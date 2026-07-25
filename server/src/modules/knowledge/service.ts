/**
 * 知识库服务（R16）：中式生活物品分类知识库查询与种子写入。
 * 底层数据访问复用 modules/ai/knowledge.ts（编排器同一份数据）。
 */
import {
  getKnowledgeFor,
  listKnowledge,
  seedKnowledgeBase,
  type KnowledgeRow,
} from '../ai/knowledge.js';

/** 按空间类型取知识库（含分类与物品项） */
export function listBySpace(spaceType: string): Array<{ category: string; items: string[] }> {
  return getKnowledgeFor(spaceType);
}

/** 管理端用：查看原始行（可选按空间过滤） */
export function listRows(spaceType?: string): KnowledgeRow[] {
  return listKnowledge(spaceType);
}

/** 种子写入（幂等：同 space_type+category 已存在则跳过） */
export function seedIfEmpty(): void {
  seedKnowledgeBase();
}
