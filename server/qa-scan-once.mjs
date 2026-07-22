// QA 辅助：对当前 DB 执行一轮 scanDueReminders（等效生产 scanner 单次 tick）
// 说明：运行实例 scanner 为默认 10min 间隔且无 env 覆盖，重启实例会中断联调；
// 本脚本复刻 scanner.ts 的查询与写库逻辑，用于分钟级验收 30 天提醒投递。
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('./data/zhengmingbai.db');
const nowIso = () => new Date().toISOString();
const DEFAULT_TEMPLATE = '整理完 30 天了，回去看看{{space_name}}保持得怎么样';
const tplRow = db.prepare("SELECT value_json FROM configs WHERE key='reminder.template'").get();
const template = tplRow ? JSON.parse(tplRow.value_json) : DEFAULT_TEMPLATE;

const due = db.prepare(
  `SELECT r.id, r.user_id, r.session_id, s.space_id, sp.name AS space_name, u.reminder_enabled
   FROM reminders r
   JOIN sessions s ON s.id = r.session_id
   JOIN spaces sp ON sp.id = s.space_id
   JOIN users u ON u.id = r.user_id
   WHERE r.status = 'pending' AND r.remind_at <= ?`,
).all(nowIso());

let sent = 0;
for (const r of due) {
  if (r.reminder_enabled === 0) {
    db.prepare(`UPDATE reminders SET status='cancelled', updated_at=? WHERE id=?`).run(nowIso(), r.id);
    continue;
  }
  const content = template.replaceAll('{{space_name}}', r.space_name);
  db.prepare(`INSERT INTO messages (user_id, type, title, content, link) VALUES (?, ?, ?, ?, ?)`).run(
    r.user_id, 'reminder_30d', `好久不见，${r.space_name}还好吗？`, content, `/spaces?focus=${r.space_id}`,
  );
  db.prepare(`UPDATE reminders SET status='sent', updated_at=? WHERE id=?`).run(nowIso(), r.id);
  sent++;
}
console.log(`scan-once: due=${due.length} sent=${sent}`);
db.close();
