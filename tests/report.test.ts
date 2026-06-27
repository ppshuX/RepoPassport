import { describe, it, expect } from "vitest";
import { formatEvidenceReport, buildContentEvidenceMap } from "../src/evidence/report.js";
import type { RepoFacts } from "../src/types/facts.js";

const fakeSha = "a".repeat(40);

describe("formatEvidenceReport", () => {
  const facts: RepoFacts = {
    repo: {
      owner: "test",
      name: "test-repo",
      url: "https://github.com/test/test-repo",
      defaultBranch: "main",
      commitSha: fakeSha,
    },
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
            symbol: "name",
            confidence: 1.0,
            extractionMethod: "static",
          },
        ],
        combinedConfidence: 1.0,
      },
      {
        category: "tech_stack",
        content: "TypeScript and Node.js",
        evidence: [
          {
            sourceType: "config",
            filePath: "package.json",
            commitSha: fakeSha,
            symbol: "dependencies",
            confidence: 1.0,
            extractionMethod: "static",
          },
        ],
        combinedConfidence: 1.0,
      },
    ],
    overallConfidence: 1.0,
  };

  it("generates evidence report", () => {
    const report = formatEvidenceReport(facts, [
      {
        section: "Overview",
        content: "test-repo is a test project",
        evidenceRefs: [0],
        hasEvidence: true,
      },
      {
        section: "Tech Stack",
        content: "TypeScript and Node.js",
        evidenceRefs: [1],
        hasEvidence: true,
      },
    ]);

    expect(report).toContain("证据报告");
    expect(report).toContain("test/test-repo");
    expect(report).toContain("项目名称");
    expect(report).toContain("技术栈");
  });

  it("warns about sections without evidence", () => {
    const report = formatEvidenceReport(facts, [
      {
        section: "Contributing",
        content: "Please contribute!",
        evidenceRefs: [],
        hasEvidence: false,
      },
    ]);

    expect(report).toContain("缺少证据支撑");
    expect(report).toContain("Contributing");
  });
});

describe("buildContentEvidenceMap", () => {
  it("maps sections to evidence refs", () => {
    const readme = `# Test\n\n## Features\n\n- Feature A\n- Feature B\n\n## Installation\n\nnpm install test\n`;
    const facts: RepoFacts = {
      repo: {
        owner: "test",
        name: "test-repo",
        url: "https://github.com/test/test-repo",
        defaultBranch: "main",
        commitSha: fakeSha,
      },
      analyzedAt: "2026-06-28T00:00:00.000Z",
      items: [
        {
          category: "installation",
          content: "npm install test",
          evidence: [
            {
              sourceType: "config",
              filePath: "package.json",
              commitSha: fakeSha,
              confidence: 1.0,
              extractionMethod: "static",
            },
          ],
          combinedConfidence: 1.0,
        },
      ],
      overallConfidence: 1.0,
    };

    const map = buildContentEvidenceMap(readme, facts);
    expect(map.length).toBeGreaterThanOrEqual(1);
    const installSection = map.find((s) => s.section === "Installation");
    expect(installSection).toBeDefined();
    expect(installSection!.hasEvidence).toBe(true);
  });
});
