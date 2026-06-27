import { describe, it, expect } from "vitest";
import {
  EvidenceSchema,
  FactsItemSchema,
  RepoMetaSchema,
  RepoFactsSchema,
  validateRepoFacts,
  buildPartialRepoFacts,
} from "../src/validate/facts.js";

const fakeSha = "a".repeat(40);

describe("EvidenceSchema", () => {
  it("accepts valid evidence", () => {
    const ev = {
      sourceType: "config",
      filePath: "package.json",
      commitSha: fakeSha,
      confidence: 1.0,
      extractionMethod: "static",
    };
    expect(EvidenceSchema.safeParse(ev).success).toBe(true);
  });

  it("accepts evidence with optional fields", () => {
    const ev = {
      sourceType: "export",
      filePath: "src/index.ts",
      commitSha: fakeSha,
      symbol: "greet",
      lineRange: [1, 5] as [number, number],
      confidence: 0.8,
      extractionMethod: "ai-inferred",
    };
    expect(EvidenceSchema.safeParse(ev).success).toBe(true);
  });

  it("rejects invalid sourceType", () => {
    const ev = {
      sourceType: "invalid",
      filePath: "x.ts",
      commitSha: fakeSha,
      confidence: 0.5,
      extractionMethod: "static",
    };
    expect(EvidenceSchema.safeParse(ev).success).toBe(false);
  });

  it("rejects confidence out of range", () => {
    const ev = {
      sourceType: "file",
      filePath: "x.ts",
      commitSha: fakeSha,
      confidence: 1.5,
      extractionMethod: "static",
    };
    expect(EvidenceSchema.safeParse(ev).success).toBe(false);
  });

  it("rejects short commitSha", () => {
    const ev = {
      sourceType: "file",
      filePath: "x.ts",
      commitSha: "abc123",
      confidence: 0.5,
      extractionMethod: "static",
    };
    expect(EvidenceSchema.safeParse(ev).success).toBe(false);
  });
});

describe("FactsItemSchema", () => {
  it("accepts valid FactsItem", () => {
    const item = {
      category: "project_name",
      content: "sample-lib is a utility library",
      evidence: [
        {
          sourceType: "config",
          filePath: "package.json",
          commitSha: fakeSha,
          confidence: 1.0,
          extractionMethod: "static",
        },
      ],
      combinedConfidence: 0.95,
    };
    expect(FactsItemSchema.safeParse(item).success).toBe(true);
  });

  it("rejects empty evidence array", () => {
    const item = {
      category: "tech_stack",
      content: "TypeScript and Node.js",
      evidence: [],
      combinedConfidence: 0.5,
    };
    expect(FactsItemSchema.safeParse(item).success).toBe(false);
  });

  it("rejects short content", () => {
    const item = {
      category: "usage",
      content: "short",
      evidence: [
        {
          sourceType: "file",
          filePath: "x.ts",
          commitSha: fakeSha,
          confidence: 0.5,
          extractionMethod: "ai-inferred",
        },
      ],
      combinedConfidence: 0.5,
    };
    expect(FactsItemSchema.safeParse(item).success).toBe(false);
  });

  it("rejects invalid category", () => {
    const item = {
      category: "not-a-real-category",
      content: "some long content here",
      evidence: [
        {
          sourceType: "file",
          filePath: "x.ts",
          commitSha: fakeSha,
          confidence: 0.5,
          extractionMethod: "ai-inferred",
        },
      ],
      combinedConfidence: 0.5,
    };
    expect(FactsItemSchema.safeParse(item).success).toBe(false);
  });
});

describe("validateRepoFacts", () => {
  const repoMeta = {
    owner: "test",
    name: "test-repo",
    url: "https://github.com/test/test-repo",
    defaultBranch: "main",
    commitSha: fakeSha,
  };

  it("returns valid for correct RepoFacts", () => {
    const facts = {
      repo: repoMeta,
      analyzedAt: "2026-06-28T00:00:00.000Z",
      items: [
        {
          category: "project_name",
          content: "test-repo is a test project",
          evidence: [
            {
              sourceType: "config",
              filePath: "package.json",
              commitSha: fakeSha,
              confidence: 1.0,
              extractionMethod: "static",
            },
          ],
          combinedConfidence: 0.9,
        },
      ],
      overallConfidence: 0.9,
    };
    const result = validateRepoFacts(facts);
    expect(result.valid).toBe(true);
  });

  it("returns invalid with partial items for bad JSON", () => {
    const result = validateRepoFacts({ not: "valid" });
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
  });

  it("returns validItems count for partial valid array", () => {
    const partial = {
      repo: repoMeta,
      analyzedAt: "2026-06-28T00:00:00.000Z",
      items: [
        {
          category: "tech_stack",
          content: "TypeScript is used here",
          evidence: [
            {
              sourceType: "config",
              filePath: "package.json",
              commitSha: fakeSha,
              confidence: 1.0,
              extractionMethod: "static",
            },
          ],
          combinedConfidence: 0.9,
        },
        {
          // 这个会失败：evidence 为空
          category: "usage",
          content: "some usage info",
          evidence: [],
          combinedConfidence: 0.5,
        },
      ],
      overallConfidence: 0.7,
    };
    const result = validateRepoFacts(partial);
    expect(result.valid).toBe(false);
    expect(result.validItems).toBe(1);
    expect(result.totalItems).toBe(2);
  });
});

describe("buildPartialRepoFacts", () => {
  const repoMeta = {
    owner: "test",
    name: "test-repo",
    url: "https://github.com/test/test-repo",
    defaultBranch: "main",
    commitSha: fakeSha,
  };

  it("returns facts when enough valid items", () => {
    const items = [
      {
        category: "project_name" as const,
        content: "test-repo is a test project",
        evidence: [
          {
            sourceType: "config" as const,
            filePath: "package.json",
            commitSha: fakeSha,
            confidence: 1.0,
            extractionMethod: "static" as const,
          },
        ],
        combinedConfidence: 0.9,
      },
      {
        category: "tech_stack" as const,
        content: "TypeScript and Node.js",
        evidence: [
          {
            sourceType: "config" as const,
            filePath: "package.json",
            commitSha: fakeSha,
            confidence: 1.0,
            extractionMethod: "static" as const,
          },
        ],
        combinedConfidence: 0.9,
      },
      {
        category: "description" as const,
        content: "A utility library for common tasks",
        evidence: [
          {
            sourceType: "file" as const,
            filePath: "README.md",
            commitSha: fakeSha,
            confidence: 0.8,
            extractionMethod: "ai-inferred" as const,
          },
        ],
        combinedConfidence: 0.75,
      },
    ];

    const result = buildPartialRepoFacts(repoMeta, items);
    expect(result).not.toBeNull();
    expect(result!.items.length).toBe(3);
  });

  it("returns null when too few valid items", () => {
    const items = [
      {
        category: "project_name" as const,
        content: "a test project name",
        evidence: [
          {
            sourceType: "config" as const,
            filePath: "package.json",
            commitSha: fakeSha,
            confidence: 1.0,
            extractionMethod: "static" as const,
          },
        ],
        combinedConfidence: 0.9,
      },
    ];

    const result = buildPartialRepoFacts(repoMeta, items);
    expect(result).toBeNull();
  });
});
