// T03 端到端冒烟：注册→登录→空间→会话→after-photos→空间详情前后对比→商城→消息→更改邮箱→忘记密码
// 运行：cd server && node qa-t03-e2e.mjs（需后端已以 CAPTCHA_BYPASS=gugu0826 启动，VERIFICATION_CHANNEL=mock）
const BASE = 'http://localhost:3001/api/v1';
const B = 'gugu0826';
const email = `t03e2e${Date.now()}@x.com`;
const password = 'abc12345';

async function call(method, path, body, token) {
  const resp = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return resp.json();
}
function ok(name, cond, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
  if (!cond) process.exitCode = 1;
}

const { DatabaseSync } = await import('node:sqlite');
const db = new DatabaseSync('./data/zhengmingbai.db');
function latestCode(targetEmail, scene) {
  const row = scene
    ? db.prepare('SELECT code FROM email_verifications WHERE email = ? AND scene = ? ORDER BY id DESC LIMIT 1').get(targetEmail, scene)
    : db.prepare('SELECT code FROM email_verifications WHERE email = ? ORDER BY id DESC LIMIT 1').get(targetEmail);
  return row ? row.code : '';
}

// 1. 注册发码
let r = await call('POST', '/auth/email-code', { email, scene: 'register', captcha_id: B, captcha_code: B });
ok('register send code', r.code === 0, r.message);

// 2. 注册
r = await call('POST', '/auth/register', {
  email, email_code: latestCode(email), password,
  username: `t03${String(Date.now()).slice(-6)}`, captcha_id: B, captcha_code: B,
});
ok('register', r.code === 0, r.message);
const token = r.data?.token;

// 3. 商城套餐（新三档）
r = await call('GET', '/packages', null, token);
const pkgs = r.data ?? [];
ok('packages 3 档', r.code === 0 && pkgs.length >= 3,
  pkgs.map((p) => `${p.name}:${p.price_fen}/${p.points}pt/${p.tag ?? ''}`).join(' | '));

// 4. 建空间 + 会话 + 上传照片（before）
const space = await call('POST', '/spaces', { name: '我的厨房', space_type: 'kitchen' }, token);
ok('create space', space.code === 0, space.message);
const sess = await call('POST', '/sessions', {
  space_id: space.data.id, granularity: 'region', discard_mode: 'conservative',
  output_forms: ['checklist'], keep_photos: 1,
}, token);
ok('create session', sess.code === 0, sess.message);
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
r = await call('POST', `/sessions/${sess.data.id}/photos`, { photos: [PNG, PNG] }, token);
ok('upload before photos', r.code === 0, r.message);

// 5. after-photos 收尾上传（≤9）
r = await call('POST', `/sessions/${sess.data.id}/after-photos`, { photos: [PNG, PNG, PNG] }, token);
ok('after-photos upload', r.code === 0, `${r.data?.photos?.length ?? 0} 张`);
r = await call('POST', `/sessions/${sess.data.id}/after-photos`, { photos: Array(10).fill(PNG) }, token);
ok('after-photos 超 9 张拦截', r.code !== 0, r.message);

// 6. 空间详情前后对比
r = await call('GET', `/spaces/${space.data.id}`, null, token);
ok('space detail before/after',
  r.code === 0 && r.data.photos.length === 2 && r.data.after_photos.length === 3,
  `before=${r.data?.photos?.length} after=${r.data?.after_photos?.length} status=${r.data?.status}`);

// 7. compare 口子恒 501+1099
r = await call('POST', `/sessions/${sess.data.id}/compare`, {}, token);
ok('compare 口子 1099', r.code === 1099, r.message);

// 8. 消息 + 未读数
r = await call('GET', '/messages', null, token);
ok('messages list', r.code === 0, `${r.data?.length ?? 0} 条`);
r = await call('GET', '/messages/unread-count', null, token);
ok('unread count', r.code === 0 && typeof r.data.count === 'number');

// 9. 偏好开关（30 天提醒 / 保留记录）
r = await call('PUT', '/account/preferences', { reminder_enabled: 0 }, token);
ok('preferences reminder off', r.code === 0 && r.data.reminder_enabled === 0, r.message);
r = await call('PUT', '/account/preferences', { reminder_enabled: 1 }, token);
ok('preferences reminder on', r.code === 0 && r.data.reminder_enabled === 1, r.message);

// 10. 更改邮箱全流程：查重 → 发码 → 换绑
const newEmail = `t03new${Date.now()}@x.com`;
r = await call('GET', `/auth/check-email?value=${encodeURIComponent(newEmail)}`, null, token);
ok('check-email available', r.code === 0 && r.data.available === true);
r = await call('POST', '/account/email-code', { new_email: newEmail, captcha_id: B, captcha_code: B }, token);
ok('change_email send code', r.code === 0, r.message);
r = await call('PUT', '/account/email', { new_email: newEmail, code: latestCode(newEmail) }, token);
// 邮箱返回为脱敏值（§5-I-11 统一脱敏）：code===0 且返回 masked 邮箱即视为换绑成功
ok('change email done', r.code === 0 && typeof r.data.email === 'string' && r.data.email.includes('@'), `${r.message} -> ${r.data?.email}`);

// 11. 忘记密码全流程（新邮箱）：发码 → 重置 → 一次性 → 旧密码失效 → 新密码登录
r = await call('POST', '/auth/email-code', { email: newEmail, scene: 'reset_password', captcha_id: B, captcha_code: B });
ok('reset_password send code', r.code === 0, r.message);
const code3 = latestCode(newEmail, 'reset_password');
const newPwd = 'newpass123';
r = await call('POST', '/auth/password-reset', { email: newEmail, code: code3, new_password: newPwd });
ok('password-reset', r.code === 0, r.message);
r = await call('POST', '/auth/password-reset', { email: newEmail, code: code3, new_password: newPwd });
ok('reset code 一次性（复用 2102）', r.code === 2102, r.message);
r = await call('POST', '/auth/login', { login_type: 'email_password', email: newEmail, password, captcha_id: B, captcha_code: B });
ok('旧密码立即失效', r.code === 2001, r.message);
r = await call('POST', '/auth/login', { login_type: 'email_password', email: newEmail, password: newPwd, captcha_id: B, captcha_code: B });
ok('新密码登录', r.code === 0, r.message);
const token2 = r.data?.token;

// 12. 手机号密码登录（合并 Tab 的 phone 分支；手机号每次随机避免与历史数据冲突）
const probePhone = `139${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
r = await call('PUT', '/account/phone', { phone: probePhone, captcha_id: B, captcha_code: B }, token2);
ok('bind phone', r.code === 0, r.message);
r = await call('POST', '/auth/login', { login_type: 'phone_password', phone: probePhone, password: newPwd, captcha_id: B, captcha_code: B });
ok('手机号密码登录', r.code === 0, r.message);

// 13. 注册开关拒绝 2107（configs 热改，value_json 列）
db.prepare("UPDATE configs SET value_json='false' WHERE key='ops.registration_enabled'").run();
const email2 = `t03sw${Date.now()}@x.com`;
await call('POST', '/auth/email-code', { email: email2, scene: 'register', captcha_id: B, captcha_code: B });
r = await call('POST', '/auth/register', {
  email: email2, email_code: latestCode(email2), password: 'abc12345',
  username: `sw${String(Date.now()).slice(-6)}`, captcha_id: B, captcha_code: B,
});
ok('注册开关关闭 → 2107 暂停注册', r.code === 2107, r.message);
db.prepare("UPDATE configs SET value_json='true' WHERE key='ops.registration_enabled'").run();

console.log('DONE');
