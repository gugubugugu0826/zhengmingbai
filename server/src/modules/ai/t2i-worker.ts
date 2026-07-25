/**
 * 高阶文生图异步 worker（阶段 2 增量 C；v3.1 D 板块图+文生图改造）。
 * setInterval 每 3 秒取一条 pending 任务串行处理，双链路：
 *   有 ref_photo_key（v3.1 新任务）→ 签 3600s COS 签名 URL → 火山 generateFromImages
 *     （客户端内部已下载落 COS 返回 cosKey）→ 直接写 plans.t2i_image_key + 任务置 done；
 *   无 ref_photo_key（老数据/兼容）→ 旧万相文生图：fetchWanxImage 得临时 URL
 *     → 下载图片 Buffer(>8MB 抛错) → storage.putObject 得 image_key → 写库置 done。
 * 失败：retry_count<1 置回 pending 自动重试 1 次；仍败置 failed（plans.t2i_image_key 不动=天然回退素材图）。
 * 进程重启恢复：processing 超 5 分钟的僵死任务在启动时重置回 pending。
 */
import { db, nowIso } from '../../db.js';
import { logAiCost, logger } from '../../common/logger.js';
import { fetchWanxImage } from './t2i-client.js';
import { generateFromImages } from './volcengine-image-client.js';
import { storage } from '../upload/storage.js';

interface T2iTaskRow {
  id: number;
  plan_id: number;
  session_id: number;
  user_id: number;
  status: string;
  prompt: string;
  image_key: string | null;
  ref_photo_key: string | null;
  error_message: string | null;
  retry_count: number;
  free_retry_used: number;
}

/** 启动时回收僵死任务（processing 超 5 分钟视为进程崩溃遗留） */
export function recoverStaleT2iTasks(): void {
  const staleBefore = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const result = db
    .prepare(
      `UPDATE t2i_tasks SET status = 'pending', updated_at = ?
       WHERE status = 'processing' AND updated_at < ?`,
    )
    .run(nowIso(), staleBefore);
  if (Number(result.changes) > 0) {
    logger.warn({ recovered: Number(result.changes) }, '回收僵死文生图任务');
  }
}

/** 任务执行成功后的统一落库：plans.t2i_image_key + 任务置 done */
function markTaskDone(task: T2iTaskRow, imageKey: string): void {
  db.prepare('UPDATE plans SET t2i_image_key = ?, updated_at = ? WHERE id = ?').run(
    imageKey,
    nowIso(),
    task.plan_id,
  );
  db.prepare(`UPDATE t2i_tasks SET status = 'done', image_key = ?, updated_at = ? WHERE id = ?`).run(
    imageKey,
    nowIso(),
    task.id,
  );
}

/**
 * v3.1 图+文生图链路（有参考图）：ref_photo_key 签 3600s COS URL → 火山 Seedream。
 * generateFromImages 内部已完成"临时 URL 下载落 COS"（D-3 硬约束），返回 cosKey 直接用，
 * 不再二次下载；成本台账也在客户端内部记录，此处不重复记。
 */
async function processTaskWithRefPhoto(task: T2iTaskRow): Promise<void> {
  const refUrl = storage.signedUrl(task.ref_photo_key!, 3600); // AI 回源统一 3600s（架构 §五-5）
  const { cosKey } = await generateFromImages(task.prompt, [refUrl], {
    sessionId: task.session_id,
  });
  markTaskDone(task, cosKey);
  logger.info({ taskId: task.id, planId: task.plan_id }, '图+文生图任务完成（火山效果图）');
}

/** 旧文生图链路（无参考图，老数据兼容）：万相临时 URL → 下载(>8MB 抛错) → 落存储通道 */
async function processTaskLegacyWanx(task: T2iTaskRow): Promise<void> {
  const url = await fetchWanxImage(task.prompt); // 万相临时 URL（24h 过期，必须落存储通道）
  const imgRes = await fetch(url);
  if (!imgRes.ok) throw new Error(`下载生成图失败 HTTP ${imgRes.status}`);
  const buf = Buffer.from(await imgRes.arrayBuffer());
  if (buf.length > 8 * 1024 * 1024) throw new Error('生成图过大');
  const key = await storage.putObject(buf, 'png'); // 走通道：COS/local 自动适配
  markTaskDone(task, key);
  logAiCost({
    stage: 'illustration',
    model: 'wanx2.1-t2i-turbo',
    inputTokens: 0,
    outputTokens: 1,
    estCostYuan: 0.14,
    mock: false,
    sessionId: task.session_id,
  });
  logger.info({ taskId: task.id, planId: task.plan_id }, '文生图任务完成');
}

async function processTask(task: T2iTaskRow): Promise<void> {
  if (task.ref_photo_key) {
    await processTaskWithRefPhoto(task);
  } else {
    await processTaskLegacyWanx(task);
  }
}

/** 处理一条任务（claim → 执行 → 状态回写），worker 每 tick 调用 */
async function tick(): Promise<void> {
  // 原子 claim：只有当前任务仍是 pending 才能置为 processing，防重复处理
  const task = db
    .prepare(`SELECT * FROM t2i_tasks WHERE status = 'pending' ORDER BY id LIMIT 1`)
    .get() as T2iTaskRow | undefined;
  if (!task) return;
  const claimed = db
    .prepare(
      `UPDATE t2i_tasks SET status = 'processing', updated_at = ? WHERE id = ? AND status = 'pending'`,
    )
    .run(nowIso(), task.id);
  if (Number(claimed.changes) === 0) return;

  try {
    await processTask(task);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ taskId: task.id, err: message }, '文生图任务失败');
    if (task.retry_count < 1) {
      // 服务端自动重试 1 次：置回 pending 排队
      db.prepare(
        `UPDATE t2i_tasks SET status = 'pending', retry_count = retry_count + 1, updated_at = ? WHERE id = ?`,
      ).run(nowIso(), task.id);
    } else {
      db.prepare(
        `UPDATE t2i_tasks SET status = 'failed', error_message = ?, updated_at = ? WHERE id = ?`,
      ).run('画画失败了，点重试免费再画一次', nowIso(), task.id);
    }
  }
}

/** v3.1 T03：模块级 isBusy 锁——防 setInterval+async 叠加并发（与 regen worker 同款） */
let isBusy = false;

/** 启动文生图 worker（每 3 秒轮询），返回 interval 句柄供优雅关闭 */
export function startT2iWorker(): NodeJS.Timeout {
  recoverStaleT2iTasks();
  const timer = setInterval(() => {
    if (isBusy) return; // 上一轮还没跑完，跳过本轮
    isBusy = true;
    tick()
      .catch((err) => logger.warn({ err }, 't2i worker tick 异常'))
      .finally(() => {
        isBusy = false;
      });
  }, 3000);
  timer.unref?.();
  logger.info('文生图 worker 已启动（3s 轮询，isBusy 防叠加）');
  return timer;
}
