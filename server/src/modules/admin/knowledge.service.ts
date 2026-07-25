/**
 * 管理员-知识库 CRUD（R35）：直接操作 knowledge_base 表，全部写 admin_logs。
 */
import { db, nowIso } from '../../db.js';
import { BizError } from '../../common/errors.js';
import { writeAdminLog } from './logs.service.js';

export interface KnowledgeInput {
  space_type: string;
  category: string;
  items: string[];
  sort?: number;
  is_active?: number;
}

export function createKnowledge(adminId: number, input: KnowledgeInput): { id: number } {
  const result = db
    .prepare(
      `INSERT INTO knowledge_base (space_type, category, items_json, sort, is_active)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      input.space_type,
      input.category,
      JSON.stringify(input.items),
      input.sort ?? 0,
      input.is_active ?? 1,
    );
  const id = Number(result.lastInsertRowid);
  writeAdminLog(adminId, 'kb_create', `kb:${input.space_type}/${input.category}`, { id, ...input });
  return { id };
}

export function updateKnowledge(adminId: number, id: number, input: Partial<KnowledgeInput>): void {
  const old = db.prepare('SELECT * FROM knowledge_base WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  if (!old) throw BizError.notFound('知识库条目不存在');
  const sets: string[] = [];
  const values: unknown[] = [];
  if (input.space_type !== undefined) {
    sets.push('space_type = ?');
    values.push(input.space_type);
  }
  if (input.category !== undefined) {
    sets.push('category = ?');
    values.push(input.category);
  }
  if (input.items !== undefined) {
    sets.push('items_json = ?');
    values.push(JSON.stringify(input.items));
  }
  if (input.sort !== undefined) {
    sets.push('sort = ?');
    values.push(input.sort);
  }
  if (input.is_active !== undefined) {
    sets.push('is_active = ?');
    values.push(input.is_active);
  }
  if (sets.length === 0) return;
  sets.push('updated_at = ?');
  values.push(nowIso(), id);
  db.prepare(`UPDATE knowledge_base SET ${sets.join(', ')} WHERE id = ?`).run(...(values as never[]));
  writeAdminLog(adminId, 'kb_update', `kb:${old.space_type}/${old.category}`, {
    id,
    old: { ...old, items_json: JSON.parse(String(old.items_json)) },
    new: input,
  });
}

export function deleteKnowledge(adminId: number, id: number): void {
  const old = db.prepare('SELECT * FROM knowledge_base WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  if (!old) throw BizError.notFound('知识库条目不存在');
  db.prepare('DELETE FROM knowledge_base WHERE id = ?').run(id);
  writeAdminLog(adminId, 'kb_delete', `kb:${old.space_type}/${old.category}`, { id });
}
