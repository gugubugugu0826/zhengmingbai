/**
 * 后台 worker 统一入口：管理 interval 句柄，便于优雅关闭。
 * 阶段 2：regen worker（异步重生成 R41）+ reminder scanner（复查提醒 R48）。
 */
import { startRegenWorker } from './modules/ai/regen-worker.js';
import { startT2iWorker } from './modules/ai/t2i-worker.js';
import { startReminderScanner } from './modules/reminder/scanner.js';
import { cleanExpiredCaptchas } from './modules/auth/captcha/service.js';

const timers: NodeJS.Timeout[] = [];

/** v2.2：过期图形验证码清理（启动时一次 + 每 10 分钟，架构 §2.1.3） */
function startCaptchaCleaner(): NodeJS.Timeout {
  cleanExpiredCaptchas();
  return setInterval(() => {
    try {
      cleanExpiredCaptchas();
    } catch {
      // 清理失败不影响主流程，下一轮再试
    }
  }, 10 * 60 * 1000);
}

export function startWorkers(): void {
  timers.push(startRegenWorker());
  timers.push(startT2iWorker());
  timers.push(startReminderScanner());
  timers.push(startCaptchaCleaner());
}

export function stopWorkers(): void {
  for (const t of timers) clearInterval(t);
  timers.length = 0;
}
