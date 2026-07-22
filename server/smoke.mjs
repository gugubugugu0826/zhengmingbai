/**
 * 冒烟脚本：走通核心链路（v2.2 新链路适配版）
 * 注册(图形码后门+库内取邮箱码) → 邮箱密码登录 → 建空间 → 建会话 → 传照片 → confirm
 * → analyze → 采纳 → regenerate → 下单 → mock 支付回调 → 余额校验 → 重放不重复入账 → 无 token 401
 *
 * 运行前提（服务端环境变量）：
 *   CAPTCHA_BYPASS=<任意口令>   图形码后门（仅测试环境；与 SMOKE_CAPTCHA_BYPASS 一致）
 *   RATE_LIMIT_DISABLED=1       关闭限流
 *   VERIFICATION_CHANNEL=mock   邮箱码走 mock 通道（落库，本脚本直读 DB 取码）
 * 运行：SMOKE_DB_FILE=./data/xxx.db SMOKE_CAPTCHA_BYPASS=<口令> node smoke.mjs
 */
const BASE = process.env.BASE_URL || 'http://localhost:3001';
const DB_FILE = process.env.SMOKE_DB_FILE || './data/zhengmingbai.db';
const BYPASS = process.env.SMOKE_CAPTCHA_BYPASS || '';
// 每次运行独立的冒烟账号（用户名唯一约束，重复跑不冲突）
const RUN_ID = Date.now().toString(36);
const SMOKE_EMAIL = `smoke-${RUN_ID}@test.local`;
const SMOKE_USERNAME = `冒烟${RUN_ID}`;
// 冒烟测试专用口令（仅本地/CI 临时账号用，非任何真实凭据）；可被环境变量覆盖
const SMOKE_PASSWORD = process.env.SMOKE_PASSWORD || 'SmokePass123';

// 最小合法 PNG（1x1 透明像素，带正确魔数）
const PNG_B64 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

let passed = 0;
let failed = 0;

function check(name, cond, extra = '') {
  if (cond) {
    passed++;
    console.log(`  PASS ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name} ${extra}`);
  }
}

async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

/** 直读 DB 取最新邮箱验证码（等价于 mock 通道"日志取码"） */
async function latestEmailCode(email, scene) {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(DB_FILE, { readOnly: true });
  try {
    const row = db
      .prepare(
        `SELECT code FROM email_verifications WHERE email = ? AND scene = ? ORDER BY created_at DESC LIMIT 1`,
      )
      .get(email, scene);
    if (!row) throw new Error(`未找到 ${email}/${scene} 的邮箱验证码（VERIFICATION_CHANNEL 需为 mock）`);
    return row.code;
  } finally {
    db.close();
  }
}

const captchaFields = () => ({ captcha_id: 'smoke', captcha_code: BYPASS });

const run = async () => {
  if (!BYPASS) {
    console.error('缺少 SMOKE_CAPTCHA_BYPASS（需与服务端 CAPTCHA_BYPASS 一致）');
    process.exit(1);
  }
  console.log('== 0. 无 token 访问受保护接口 ==');
  const noAuth = await api('/api/v1/points/balance');
  check('无 token 返回 401', noAuth.status === 401, `got ${noAuth.status}`);

  console.log('== 1. 注册 + 邮箱密码登录（v2.2 新链路） ==');
  // 1a. 发注册邮箱验证码（图形码走后门）
  const sendReg = await api('/api/v1/auth/email-code', {
    method: 'POST',
    body: { email: SMOKE_EMAIL, scene: 'register', ...captchaFields() },
  });
  check('发注册邮箱码', sendReg.json?.code === 0 && sendReg.json?.data?.sent === true,
    JSON.stringify(sendReg.json).slice(0, 200));
  const regCode = await latestEmailCode(SMOKE_EMAIL, 'register');

  // 1b. 注册（赠 20 点）
  const reg = await api('/api/v1/auth/register', {
    method: 'POST',
    body: {
      email: SMOKE_EMAIL,
      email_code: regCode,
      password: SMOKE_PASSWORD,
      username: SMOKE_USERNAME,
      ...captchaFields(),
    },
  });
  check('注册成功', reg.json?.code === 0 && !!reg.json?.data?.token, JSON.stringify(reg.json).slice(0, 300));
  const giftBalance = reg.json.data.points?.balance ?? 0;
  check('新用户礼包 20 点', giftBalance === 20, `balance=${giftBalance}`);
  check('邮箱脱敏返回', String(reg.json.data.user?.email).includes('***'));

  // 1c. 邮箱+密码登录（验证三登录主路径）
  const login = await api('/api/v1/auth/login', {
    method: 'POST',
    body: { login_type: 'email_password', email: SMOKE_EMAIL, password: SMOKE_PASSWORD, ...captchaFields() },
  });
  check('邮箱密码登录成功', login.json?.code === 0 && !!login.json?.data?.token,
    JSON.stringify(login.json).slice(0, 200));
  check('登录不重复赠点', login.json.data.points?.balance === giftBalance,
    `balance=${login.json.data.points?.balance}`);
  const token = login.json.data.token;

  console.log('== 2. 建空间 ==');
  const space = await api('/api/v1/spaces', {
    method: 'POST',
    token,
    body: { name: '主卧', space_type: 'bedroom' },
  });
  check('建空间成功', space.json?.code === 0, JSON.stringify(space.json));
  const spaceId = space.json.data.id;

  console.log('== 3. 建会话 ==');
  const session = await api('/api/v1/sessions', {
    method: 'POST',
    token,
    body: { space_id: spaceId, granularity: 'region', discard_mode: 'conservative' },
  });
  check('建会话成功', session.json?.code === 0, JSON.stringify(session.json));
  const sessionId = session.json.data.id;

  console.log('== 4. 上传照片 ==');
  const upload = await api(`/api/v1/sessions/${sessionId}/photos`, {
    method: 'POST',
    token,
    body: { photos: [PNG_B64] },
  });
  check('上传成功', upload.json?.code === 0 && upload.json.data.length === 1, JSON.stringify(upload.json));
  check('返回签名 URL', String(upload.json.data[0].url).includes('/api/v1/files/'));

  console.log('== 5. AI 确认 ==');
  const confirmRun = await api(`/api/v1/sessions/${sessionId}/confirm/run`, { method: 'POST', token });
  check('confirm/run 返回分组', confirmRun.json?.code === 0 && Array.isArray(confirmRun.json.data.groups));
  const confirm = await api(`/api/v1/sessions/${sessionId}/confirm`, {
    method: 'POST',
    token,
    body: { vague_answers: ['一袋数据线'] },
  });
  check('confirm 提交成功', confirm.json?.code === 0);

  console.log('== 6. 分析出方案（扣点） ==');
  const analyze = await api(`/api/v1/sessions/${sessionId}/analyze`, { method: 'POST', token });
  check('analyze 成功', analyze.json?.code === 0, JSON.stringify(analyze.json).slice(0, 300));
  const planId = analyze.json.data.id;
  const charged = analyze.json.data.charged;
  const balanceAfterAnalysis = analyze.json.data.balance;
  check('扣点 10（region）', charged === 10, `charged=${charged}`);
  check('余额 = 礼包 - 10', balanceAfterAnalysis === giftBalance - 10, `balance=${balanceAfterAnalysis}`);
  check('方案五部分齐全',
    ['discard_suggestions', 'groups', 'storage_advice', 'purchase_advice', 'steps']
      .every((k) => Array.isArray(analyze.json.data.content[k])));

  console.log('== 7. 条目采纳 ==');
  const firstItem = analyze.json.data.items[0];
  const accept = await api(`/api/v1/plans/items/${firstItem.id}`, {
    method: 'PATCH',
    token,
    body: { status: 'accepted' },
  });
  check('采纳成功', accept.json?.code === 0);

  console.log('== 8. 重生成（首次免费，异步任务 R41） ==');
  const regen = await api(`/api/v1/plans/${planId}/regenerate`, { method: 'POST', token });
  check('regenerate 返回 task_id', regen.json?.code === 0 && !!regen.json.data.task_id, JSON.stringify(regen.json).slice(0, 300));
  check('首次免费 charged=0', regen.json.data.charged === 0, `charged=${regen.json.data.charged}`);
  const taskId = regen.json.data.task_id;
  let regenTask = null;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const t = await api(`/api/v1/plans/regen-tasks/${taskId}`, { token });
    if (t.json?.data?.status === 'done') { regenTask = t.json.data; break; }
    if (t.json?.data?.status === 'failed') break;
  }
  check('重生成任务完成', regenTask?.status === 'done', JSON.stringify(regenTask).slice(0, 200));
  check('版本号 v2', regenTask?.plan?.version === 2);

  console.log('== 9. 下单 + mock 支付（阶段2套餐全下架为预期；smoke 临时上架一档后还原） ==');
  const { DatabaseSync } = await import('node:sqlite');
  const smokeDb = new DatabaseSync(DB_FILE);
  let pkgRow = smokeDb.prepare('SELECT * FROM packages ORDER BY sort LIMIT 1').get();
  if (!pkgRow) {
    // 全新库（packages 为空，种子在 seed-cli 才跑）：插入临时套餐供支付链路验证
    // （用毕保持下架不删：orders 外键引用，删除会违反约束）
    const r = smokeDb
      .prepare(`INSERT INTO packages (name, price_fen, points, tag, sort, is_active) VALUES ('smoke 临时套餐', 990, 20, 'smoke', 1, 0)`)
      .run();
    pkgRow = { id: Number(r.lastInsertRowid) };
  }
  smokeDb.prepare('UPDATE packages SET is_active = 1 WHERE id = ?').run(pkgRow.id);
  const pkgsAll = await api('/api/v1/packages', { token });
  const pkg = pkgsAll.json?.data?.[0];
  check('套餐列表查询成功', pkgsAll.json?.code === 0 && !!pkg, JSON.stringify(pkgsAll.json).slice(0, 200));
  const order = await api('/api/v1/orders', { method: 'POST', token, body: { package_id: pkg.id } });
  check('下单成功', order.json?.code === 0, JSON.stringify(order.json).slice(0, 200));
  const orderNo = order.json.data.order.order_no;
  const paySign = order.json.data.payment.sign;
  const amountFen = order.json.data.order.amount_fen;

  const cb = await api('/api/v1/payments/mock/callback', {
    method: 'POST',
    token,
    body: { order_no: orderNo, amount_fen: amountFen, sign: paySign },
  });
  check('支付回调入账', cb.json?.code === 0 && cb.json.data.points_added === pkg.points,
    JSON.stringify(cb.json));
  const expectedBalance = balanceAfterAnalysis + pkg.points;
  check('余额 = 之前 + 套餐点数', cb.json.data.balance === expectedBalance,
    `balance=${cb.json.data.balance}, expected=${expectedBalance}`);

  console.log('== 10. 重放支付回调（幂等） ==');
  const replay = await api('/api/v1/payments/mock/callback', {
    method: 'POST',
    token,
    body: { order_no: orderNo, amount_fen: amountFen, sign: paySign },
  });
  check('重放返回成功', replay.json?.code === 0);
  check('重放不重复入账', replay.json.data.points_added === 0 && replay.json.data.balance === expectedBalance,
    JSON.stringify(replay.json));

  const bal = await api('/api/v1/points/balance', { token });
  check('最终余额一致', bal.json.data.balance === expectedBalance);
  // 还原：套餐恢复下架（阶段2预期状态；临时套餐因 orders 外键保留但保持下架，等价于"购买入口关闭"）
  smokeDb.prepare('UPDATE packages SET is_active = 0 WHERE id = ?').run(pkgRow.id);
  smokeDb.close();

  console.log('== 11. 知识库 & 分享卡片 ==');
  // 全新库知识库为空（种子在 seed-cli 才跑）：插临时条目，验证后删除
  const kbDb = new DatabaseSync(DB_FILE);
  const kbCount = kbDb.prepare('SELECT COUNT(*) AS c FROM knowledge_base').get().c;
  let tempKbId = null;
  if (kbCount === 0) {
    const r = kbDb
      .prepare(`INSERT INTO knowledge_base (space_type, category, items_json, sort, is_active) VALUES ('kitchen', 'smoke 临时分类', '["锅具","餐具"]', 1, 1)`)
      .run();
    tempKbId = Number(r.lastInsertRowid);
  }
  kbDb.close();
  const kb = await api('/api/v1/knowledge?space_type=kitchen', { token });
  check('知识库查询', kb.json?.code === 0 && kb.json.data.length > 0);
  const card = await api(`/api/v1/share/${sessionId}/card`, { token });
  check('分享卡片数据', card.json?.code === 0 && card.json.data.brand === '整明白' &&
    card.json.data.points.length > 0 && card.json.data.points.length <= 5);
  const svgRes = await fetch(`${BASE}/api/v1/share/${sessionId}/card.svg`, {
    headers: { authorization: `Bearer ${token}` },
  });
  check('分享卡片 SVG', svgRes.status === 200 && (svgRes.headers.get('content-type') || '').includes('svg'));

  // 还原临时知识库条目
  if (tempKbId !== null) {
    const kbDb2 = new DatabaseSync(DB_FILE);
    kbDb2.prepare('DELETE FROM knowledge_base WHERE id = ?').run(tempKbId);
    kbDb2.close();
  }

  console.log(`\n结果: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
};

run().catch((err) => {
  console.error('smoke 脚本异常:', err);
  process.exit(1);
});
