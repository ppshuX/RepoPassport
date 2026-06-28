import { z } from "zod";

export const EvidenceSchema = z.object({
  sourceType: z.enum(["file", "config", "dependency", "export"]),
  filePath: z.string().min(1),
  commitSha: z.string().min(7).max(40),
  symbol: z.string().optional(),
  lineRange: z.tuple([z.number().int().positive(), z.number().int().positive()]).optional(),
  confidence: z.number().min(0).max(1),
  extractionMethod: z.enum(["static", "ai-inferred"]),
});

export const FactsItemSchema = z.object({
  category: z.enum([
    "project_name",
    "description",
    "purpose",
    "tech_stack",
    "installation",
    "usage",
    "configuration",
    "api_surface",
    "architecture",
    "dependencies",
  ]),
  content: z.string().min(10),
  evidence: z.array(EvidenceSchema).min(1),
  combinedConfidence: z.number().min(0).max(1),
});

export const RepoMetaSchema = z.object({
  owner: z.string().min(1),
  name: z.string().min(1),
  url: z.string().url(),
  defaultBranch: z.string().min(1),
  commitSha: z.string().min(7).max(40),
});

export const RepoFactsSchema = z.object({
  repo: RepoMetaSchema,
  analyzedAt: z.string().datetime(),
  items: z.array(FactsItemSchema),
  overallConfidence: z.number().min(0).max(1),
});

export type RepoFactsValidated = z.infer<typeof RepoFactsSchema>;

/**
 * 校验 AI 输出的 RepoFacts JSON。
 * 返回 { valid: true, data } 或 { valid: false, errors, validItems }。
 */
export function validateRepoFacts(raw: unknown): {
  valid: boolean;
  data?: RepoFactsValidated;
  errors?: z.ZodError;
  validItems?: number;
  totalItems?: number;
} {
  const result = RepoFactsSchema.safeParse(raw);
  if (result.success) {
    return { valid: true, data: result.data };
  }

  // 尝试逐项校验 items
  if (typeof raw === "object" && raw !== null && "items" in raw) {
    const obj = raw as Record<string, unknown>;
    const items = Array.isArray(obj.items) ? obj.items : [];
    const validItems = items
      .map((item) => FactsItemSchema.safeParse(item))
      .filter((r) => r.success)
      .map((r) => (r as z.SafeParseSuccess<unknown>).data);

    return {
      valid: false,
      errors: result.error,
      validItems: validItems.length,
      totalItems: items.length,
    };
  }

  return { valid: false, errors: result.error };
}

/**
 * 从部分校验结果构建合法的 RepoFacts。
 * 仅保留通过校验的 items，若低于最小阈值返回 null。
 */
export function buildPartialRepoFacts(
  repoMeta: z.infer<typeof RepoMetaSchema>,
  validItems: z.infer<typeof FactsItemSchema>[],
  minItems = 3,
): z.infer<typeof RepoFactsSchema> | null {
  if (validItems.length < minItems) return null;

  const overallConfidence =
    validItems.reduce((sum, item) => sum + item.combinedConfidence, 0) / validItems.length;

  return {
    repo: repoMeta,
    analyzedAt: new Date().toISOString(),
    items: validItems,
    overallConfidence: Math.round(overallConfidence * 100) / 100,
  };
}
