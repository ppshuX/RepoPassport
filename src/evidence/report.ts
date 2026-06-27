import type { RepoFacts, FactsItem } from "../types/facts.js";
import type { ContentEvidenceMap } from "../types/run.js";

/**
 * 生成内容到证据的映射。
 */
export function buildContentEvidenceMap(
  generatedReadme: string,
  facts: RepoFacts,
): ContentEvidenceMap[] {
  const sections: ContentEvidenceMap[] = [];
  const lines = generatedReadme.split("\n");

  let currentSection = "";
  let currentContent = "";
  let sectionStart = false;

  for (const line of lines) {
    if (line.startsWith("## ")) {
      // 保存上一节
      if (currentSection && currentContent.trim()) {
        sections.push({
          section: currentSection,
          content: currentContent.trim(),
          evidenceRefs: findEvidenceRefs(currentContent, facts.items),
          hasEvidence: hasSupportingEvidence(currentContent, facts.items),
        });
      }
      currentSection = line.replace(/^## /, "").trim();
      currentContent = "";
      sectionStart = true;
    } else if (line.startsWith("# ") && !sectionStart) {
      currentSection = line.replace(/^# /, "").trim();
      currentContent = "";
    } else {
      currentContent += line + "\n";
    }
  }

  // 最后一节
  if (currentSection && currentContent.trim()) {
    sections.push({
      section: currentSection,
      content: currentContent.trim(),
      evidenceRefs: findEvidenceRefs(currentContent, facts.items),
      hasEvidence: hasSupportingEvidence(currentContent, facts.items),
    });
  }

  return sections;
}

function findEvidenceRefs(content: string, items: FactsItem[]): number[] {
  return items
    .map((item, idx) => (content.includes(item.content.slice(0, 30)) ? idx : -1))
    .filter((idx) => idx >= 0);
}

function hasSupportingEvidence(content: string, items: FactsItem[]): boolean {
  return findEvidenceRefs(content, items).length > 0;
}

/**
 * 格式化证据报告，用于终端输出。
 */
export function formatEvidenceReport(
  facts: RepoFacts,
  contentEvidenceMap: ContentEvidenceMap[],
): string {
  const lines: string[] = [];

  lines.push("═".repeat(72));
  lines.push("  证据报告 / Evidence Report");
  lines.push("═".repeat(72));
  lines.push("");
  lines.push(`仓库: ${facts.repo.owner}/${facts.repo.name}`);
  lines.push(`Commit: ${facts.repo.commitSha.slice(0, 7)}`);
  lines.push(`分析时间: ${facts.analyzedAt}`);
  lines.push(`总置信度: ${(facts.overallConfidence * 100).toFixed(0)}%`);
  lines.push(`事实项数: ${facts.items.length}`);
  lines.push("");

  // 按类别分组
  const byCategory = new Map<string, FactsItem[]>();
  for (const item of facts.items) {
    const existing = byCategory.get(item.category) || [];
    existing.push(item);
    byCategory.set(item.category, existing);
  }

  for (const [category, items] of byCategory) {
    lines.push(`── ${categoryLabel(category)} ──`);
    for (const item of items) {
      lines.push(`  • ${item.content}`);
      lines.push(`    置信度: ${(item.combinedConfidence * 100).toFixed(0)}%`);
      for (const ev of item.evidence) {
        let loc = ev.filePath;
        if (ev.lineRange) loc += `:${ev.lineRange[0]}-${ev.lineRange[1]}`;
        if (ev.symbol) loc += ` → ${ev.symbol}`;
        lines.push(
          `    [${ev.sourceType}] ${loc} (${ev.extractionMethod}, ${(ev.confidence * 100).toFixed(0)}%)`,
        );
      }
      lines.push("");
    }
  }

  // 内容到证据映射摘要
  lines.push("── 文档章节证据覆盖 ──");
  for (const section of contentEvidenceMap) {
    const status = section.hasEvidence ? "✓" : "✗";
    lines.push(
      `  ${status} ${section.section}: ${section.evidenceRefs.length} 项证据`,
    );
  }
  lines.push("");

  // 无证据章节警告
  const noEvidenceSections = contentEvidenceMap.filter((s) => !s.hasEvidence);
  if (noEvidenceSections.length > 0) {
    lines.push("⚠ 以下章节缺少证据支撑:");
    for (const section of noEvidenceSections) {
      lines.push(`  - ${section.section}`);
    }
    lines.push("");
  }

  lines.push("═".repeat(72));

  return lines.join("\n");
}

function categoryLabel(category: string): string {
  const labels: Record<string, string> = {
    project_name: "项目名称",
    description: "项目描述",
    purpose: "用途定位",
    tech_stack: "技术栈",
    installation: "安装方式",
    usage: "使用方式",
    configuration: "配置说明",
    api_surface: "API 接口",
    architecture: "架构设计",
    dependencies: "依赖关系",
  };
  return labels[category] || category;
}
