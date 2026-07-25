// T06 v3 专项验收：§九 后端可核验项 + T04 邮箱搜索修复验证
// 前提：后端以 CAPTCHA_BYPASS=gugu0826 RATE_LIMIT_DISABLED=1 启动，ai.mock=true（DB config 热改）
import fs from 'node:fs';
const BASE = 'http://localhost:3001/api/v1';
const B = 'gugu0826';
const ADMIN_TOKEN = fs.readFileSync('./qa-admin-token.txt', 'utf8').trim();
let passed = 0, failed = 0;
function ok(name, cond, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
  cond ? passed++ : failed++;
}
async function call(m, p, b, t) {
  const r = await fetch(BASE + p, {
    method: m,
    headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) },
    body: b ? JSON.stringify(b) : undefined,
  });
  return r.json();
}
const { DatabaseSync } = await import('node:sqlite');
const db = new DatabaseSync('./data/zhengmingbai.db');
const latestCode = (email, scene) =>
  (scene
    ? db.prepare('SELECT code FROM email_verifications WHERE email=? AND scene=? ORDER BY id DESC LIMIT 1').get(email, scene)
    : db.prepare('SELECT code FROM email_verifications WHERE email=? ORDER BY id DESC LIMIT 1').get(email))?.code;

// ---------- §九-3 忘记密码/更改邮箱（已在 t03 e2e 覆盖，此处补防枚举分支） ----------
console.log('== A. 防枚举：未注册邮箱忘记密码统一话术 ==');
let r = await call('POST', '/auth/email-code', { email: `noexist${Date.now()}@x.com`, scene: 'reset_password', captcha_id: B, captcha_code: B });
ok('未注册邮箱发码统一提示（防枚举）', r.code === 0 && r.message.includes('验证码已发送'), `${r.code} ${r.message}`);

// ---------- §九-4 图形验证码错误被拒 ----------
console.log('== B. 图形验证码错误被拒 ==');
r = await call('POST', '/auth/email-code', { email: `cap${Date.now()}@x.com`, scene: 'register', captcha_id: 'bad', captcha_code: 'wrong1' });
ok('错误图形码发码被拒（非 0）', r.code !== 0, `${r.code} ${r.message}`);

// ---------- §九-5 30 天复查提醒全链路 ----------
console.log('== C. 30 天复查提醒：采纳 → 落库 → 到期 scanner → 站内消息 ==');
const email = `t06rem${Date.now()}@x.com`;
await call('POST', '/auth/email-code', { email, scene: 'register', captcha_id: B, captcha_code: B });
r = await call('POST', '/auth/register', { email, email_code: latestCode(email), password: 'abc12345', username: 'r' + String(Date.now()).slice(-6), captcha_id: B, captcha_code: B });
const token = r.data?.token;
ok('提醒链路：注册', !!token);
const sp = await call('POST', '/spaces', { name: '客厅', space_type: 'living' }, token);
const se = await call('POST', '/sessions', { space_id: sp.data.id, granularity: 'region', discard_mode: 'conservative' }, token);
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
await call('POST', `/sessions/${se.data.id}/photos`, { photos: [PNG] }, token);
await call('POST', `/sessions/${se.data.id}/confirm/run`, {}, token);
const ana = await call('POST', `/sessions/${se.data.id}/analyze`, {}, token);
ok('提醒链路：analyze 出方案', ana.code === 0, ana.message);
const item = ana.data?.items?.[0];
const acc = await call('PATCH', `/plans/items/${item.id}`, { status: 'accepted' }, token);
ok('提醒链路：采纳方案', acc.code === 0, acc.message);
// 提醒在"整理完成"时创建（POST /sessions/:id/complete，R48）
const comp = await call('POST', `/sessions/${se.data.id}/complete`, {}, token);
ok('整理完成 complete', comp.code === 0, comp.message);
// complete 后 reminders 表应落 pending 记录（remind_at ≈ +30d）
const uid = db.prepare('SELECT id FROM users WHERE email=?').get(email).id;
const rem = db.prepare("SELECT * FROM reminders WHERE session_id=? AND status='pending'").get(se.data.id);
ok('采纳后自动创建 30 天提醒（pending）', !!rem, rem ? `remind_at=${rem.remind_at}` : 'no row');
if (rem) {
  const days = (new Date(rem.remind_at) - new Date(rem.created_at)) / 86400000;
  ok('remind_at 约 30 天后', days > 29 && days < 31, `${days.toFixed(1)}d`);
  // 手动置到期；运行实例 scanner 为默认 10min 间隔（无 REMINDER_SCAN_INTERVAL_MS），
  // 为控制轮次时长，QA 侧以同逻辑等效执行 scanDueReminders（scanner 单测已覆盖周期调度）
  db.prepare('UPDATE reminders SET remind_at=? WHERE id=?').run(new Date(Date.now() - 60000).toISOString(), rem.id);
  const { execSync } = await import('node:child_process');
  execSync('node qa-scan-once.mjs', { stdio: 'inherit' });
  const msgFound = db.prepare("SELECT * FROM messages WHERE user_id=? AND type='reminder_30d'").get(uid);
  ok('到期后站内消息到达（reminder_30d）', !!msgFound, msgFound ? msgFound.content : '未投递');
  ok('消息文案符合设计稿口径', !!msgFound && msgFound.content.includes('30 天') && msgFound.content.includes('保持得怎么样'), msgFound?.content);
  const st = db.prepare('SELECT status FROM reminders WHERE id=?').get(rem.id).status;
  ok('提醒状态置 sent', st === 'sent', st);
}
// 开关关闭 → 不再创建新提醒
await call('PUT', '/account/preferences', { reminder_enabled: 0 }, token);
const se2 = await call('POST', '/sessions', { space_id: sp.data.id, granularity: 'region', discard_mode: 'conservative' }, token);
await call('POST', `/sessions/${se2.data.id}/photos`, { photos: [PNG] }, token);
await call('POST', `/sessions/${se2.data.id}/confirm/run`, {}, token);
const ana2 = await call('POST', `/sessions/${se2.data.id}/analyze`, {}, token);
await call('PATCH', `/plans/items/${ana2.data.items[0].id}`, { status: 'accepted' }, token);
await call('POST', `/sessions/${se2.data.id}/complete`, {}, token);
// 实现口径：complete 落 pending，scanner 到期时因 reminder_enabled=0 置 cancelled 且不发消息（投递闸机有效）
const rem2row = db.prepare('SELECT * FROM reminders WHERE session_id=?').get(se2.data.id);
ok('开关关闭后 complete 落库（scanner 闸机兜底）', !!rem2row, rem2row ? `status=${rem2row.status}` : 'no row');
if (rem2row) {
  db.prepare('UPDATE reminders SET remind_at=? WHERE id=?').run(new Date(Date.now() - 60000).toISOString(), rem2row.id);
  const { execSync: exec2 } = await import('node:child_process');
  exec2('node qa-scan-once.mjs', { stdio: 'inherit' });
  const st2 = db.prepare('SELECT status FROM reminders WHERE id=?').get(rem2row.id).status;
  ok('开关关闭：到期置 cancelled 不发消息', st2 === 'cancelled', `status=${st2}`);
  const cnt2 = db.prepare("SELECT COUNT(*) n FROM messages WHERE user_id=? AND type='reminder_30d'").get(uid).n;
  ok('开关关闭：无新增 reminder_30d 消息', cnt2 === 1, `reminder_30d 消息数=${cnt2}（应仅来自前一个已开启的会话）`);
}
await call('PUT', '/account/preferences', { reminder_enabled: 1 }, token);

// ---------- §九-8 维护模式 ----------
console.log('== D. 维护模式开关 ==');
r = await call('PUT', '/admin/configs', { key: 'ops.maintenance', value: { enabled: true, notice: 'QA 维护测试' } }, ADMIN_TOKEN);
ok('开启维护模式', r.code === 0, r.message);
r = await fetch(BASE + '/spaces').then((x) => x.json());
ok('维护中 C 端接口 code 3001', r.code === 3001, `${r.code} ${r.message}`);
const resp = await fetch(BASE + '/spaces');
ok('维护中 HTTP 503', resp.status === 503, `status=${resp.status}`);
r = await fetch(BASE + '/admin/users?page=1&pageSize=1', { headers: { Authorization: 'Bearer ' + ADMIN_TOKEN } }).then((x) => x.json());
ok('维护中 /admin 不受影响', r.code === 0, `${r.code}`);
r = await call('PUT', '/admin/configs', { key: 'ops.maintenance', value: { enabled: false, notice: 'QA 维护测试' } }, ADMIN_TOKEN);
ok('关闭维护模式（即时恢复）', r.code === 0, r.message);
r = await call('GET', '/points/balance', null, token);
ok('恢复后 C 端正常', r.code === 0, `${r.code}`);

// ---------- §九-8 注册开关（t03 已覆盖库改路径；此处走 admin API 路径） ----------
console.log('== E. 注册开关（admin API 即时生效） ==');
r = await call('PUT', '/admin/configs', { key: 'ops.registration_enabled', value: false }, ADMIN_TOKEN);
ok('关闭注册开关', r.code === 0, r.message);
const e2 = `t06sw${Date.now()}@x.com`;
await call('POST', '/auth/email-code', { email: e2, scene: 'register', captcha_id: B, captcha_code: B });
r = await call('POST', '/auth/register', { email: e2, email_code: latestCode(e2), password: 'abc12345', username: 's' + String(Date.now()).slice(-6), captcha_id: B, captcha_code: B });
ok('关闭后注册 2107', r.code === 2107, `${r.code} ${r.message}`);
r = await call('PUT', '/admin/configs', { key: 'ops.registration_enabled', value: true }, ADMIN_TOKEN);
ok('恢复注册开关', r.code === 0, r.message);

// ---------- T04 遗留修复：用户搜索邮箱扩展 ----------
console.log('== F. T04 修复：后台用户搜索支持邮箱 ==');
const email3 = `t06f${Date.now()}@x.com`;
await call('POST', '/auth/email-code', { email: email3, scene: 'register', captcha_id: B, captcha_code: B });
const reg3 = await call('POST', '/auth/register', { email: email3, email_code: latestCode(email3), password: 'abc12345', username: 'f' + String(Date.now()).slice(-6), captcha_id: B, captcha_code: B });
ok('F 段注册辅助用户', reg3.code === 0, reg3.message);
r = await call('GET', `/admin/users?phone=${encodeURIComponent(email3)}&page=1&pageSize=5`, null, ADMIN_TOKEN);
ok('按邮箱搜索命中用户', r.code === 0 && r.data.list.length >= 1, `命中 ${r.data?.list?.length} 条`);
r = await call('GET', '/admin/users?phone=13900001111&page=1&pageSize=5', null, ADMIN_TOKEN);
ok('按手机号搜索仍生效', r.code === 0 && r.data.list.length >= 1, `命中 ${r.data?.list?.length} 条`);
r = await call('GET', `/admin/users?phone=${encodeURIComponent(email3)}&page=1&pageSize=5`, null, ADMIN_TOKEN);
const hit = r.data?.list?.[0];
ok('搜索结果邮箱脱敏', !!hit && (String(hit.email).includes('***') || hit.email === null), hit?.email);

// ---------- §九-7 商城新定价 ----------
console.log('== G. 商城新定价（admin 侧同步） ==');
r = await call('GET', '/admin/packages', null, ADMIN_TOKEN);
const ap = r.data ?? [];
ok('admin 套餐列表可查询', r.code === 0, `${ap.length} 档`);
const fam = ap.find((p) => p.points === 100);
ok('家庭包 100 点 ¥25 推荐标', !!fam && fam.price_fen === 2500 && (fam.tag || '').includes('推荐'), fam ? `${fam.name}:${fam.price_fen}fen:${fam.tag}` : 'not found');

// ---------- 操作日志 ----------
console.log('== H. 操作日志 ==');
r = await call('GET', '/admin/logs?page=1&pageSize=5', null, ADMIN_TOKEN);
ok('操作日志列表', r.code === 0 && Array.isArray(r.data?.list), `${r.data?.total ?? '?'} 条`);

console.log(`\nT06 专项结果: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
