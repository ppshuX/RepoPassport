import type { RepoFacts, FactsItem, FactCategory } from "../types/facts.js";
import type { ContentEvidenceMap } from "../types/run.js";

/**
 * README 章节标题 → 事实类别映射。
 * AI 生成的 ## 章节名对应到 RepoFacts 中的 category。
 */
const SECTION_TO_CATEGORY: Record<string, FactCategory> = {
  "features": "purpose",
  "tech stack": "tech_stack",
  "installation": "installation",
  "usage": "usage",
  "configuration": "configuration",
  "api": "api_surface",
  "api surface": "api_surface",
  "architecture": "architecture",
  "dependencies": "dependencies",
  "description": "description",
  "project name": "project_name",
  "purpose": "purpose",
  "getting started": "installation",
};

/**
 * 根据章节标题查找对应的事实类别。
 */
function mapSectionToCategory(section: string): FactCategory | null {
  const normalized = section.toLowerCase().trim();
  return SECTION_TO_CATEGORY[normalized] || null;
}

/**
 * 生成内容到证据的映射。
 * 用类别名匹配而非内容子串匹配，因为 AI 会重写文字。
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
      if (currentSection && currentContent.trim()) {
        const category = mapSectionToCategory(currentSection);
        sections.push({
          section: currentSection,
          content: currentContent.trim(),
          evidenceRefs: findEvidenceByCategory(category, facts.items),
          hasEvidence: hasEvidenceByCategory(category, facts.items),
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
    const category = mapSectionToCategory(currentSection);
    sections.push({
      section: currentSection,
      content: currentContent.trim(),
      evidenceRefs: findEvidenceByCategory(category, facts.items),
      hasEvidence: hasEvidenceByCategory(category, facts.items),
    });
  }

  return sections;
}

/**
 * 按事实类别查找匹配的事实项索引。
 * 优先用类别名精确匹配（大小写不敏感），回退到内容子串匹配。
 */
function findEvidenceByCategory(category: FactCategory | null, items: FactsItem[]): number[] {
  const refs: number[] = [];
  for (let i = 0; i < items.length; i++) {
    if (category && items[i].category === category) {
      refs.push(i);
    }
  }
  return refs;
}

function hasEvidenceByCategory(category: FactCategory | null, items: FactsItem[]): boolean {
  if (!category) return false;
  return items.some((item) => item.category === category);
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
