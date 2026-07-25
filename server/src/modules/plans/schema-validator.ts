/**
 * 方案 JSON 结构校验（架构文档 2.5：五部分缺一不可）。
 * 真实模型输出后用 zod 强校验，不合法自动重试 1 次（重试逻辑在编排器）。
 */
import { z } from 'zod';

export const planContentSchema = z.object({
  discard_suggestions: z
    .array(z.object({ item: z.string(), reason: z.string(), tone: z.string().default('gentle') }))
    .min(1),
  groups: z
    .array(
      z.object({
        name: z.string(),
        items: z.array(z.string()),
        kb_category: z.string().default(''),
      }),
    )
    .min(1),
  storage_advice: z
    .array(z.object({ group: z.string(), location: z.string(), tip: z.string() }))
    .min(1),
  purchase_advice: z
    .array(
      z.object({
        category: z.string(),
        reason: z.string(),
        product_link: z.string().nullable().default(null),
      }),
    )
    .min(1),
  steps: z
    .array(
      z.object({
        no: z.number().int().positive(),
        action: z.string(),
        target_groups: z.array(z.string()).default([]),
        est_minutes: z.number().int().nonnegative().default(10),
      }),
    )
    .min(1),
  scene_summary: z.string(),
  after_state_desc: z.string(),
});

export type ValidatedPlanContent = z.infer<typeof planContentSchema>;

export function validatePlanContent(content: unknown): ValidatedPlanContent {
  return planContentSchema.parse(content);
}
