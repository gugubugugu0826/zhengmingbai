// QA 辅助：admin 三段式登录拿正式 token（mock 通道直读 DB 取码）
import fs from 'node:fs';
const BASE = 'http://localhost:3001/api/v1';
const EMAIL = 'qa-admin@zmb.test';
const B = 'gugu0826';
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
let r = await call('POST', '/admin/auth/step1', { email: EMAIL, captcha_id: B, captcha_code: B });
console.log('step1', r.code, r.message);
await new Promise((res) => setTimeout(res, 300));
const row = db.prepare('SELECT code FROM email_verifications WHERE email=? AND scene=? ORDER BY id DESC LIMIT 1').get(EMAIL, 'admin_login');
console.log('db code', row?.code);
r = await call('POST', '/admin/auth/step2', { email: EMAIL, code: row.code });
console.log('step2', r.code, r.message, 'ticket?', !!r.data?.admin_ticket);
r = await call('POST', '/admin/auth/step3', { admin_ticket: r.data.admin_ticket, password: 'QaAdmin123' });
console.log('step3', r.code, r.message, 'token?', !!r.data?.token);
fs.writeFileSync('qa-admin-token.txt', r.data?.token || '');
