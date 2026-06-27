/**
 * 终端 Diff 展示工具。
 */

export function showDiff(original: string | undefined, generated: string, filePath: string): string {
  const lines: string[] = [];

  lines.push(`--- a/${filePath}`);
  lines.push(`+++ b/${filePath}`);

  if (!original) {
    // 新文件场景
    lines.push(`@@ -0,0 +1,${generated.split("\n").length} @@`);
    for (const line of generated.split("\n")) {
      lines.push(`+${line}`);
    }
  } else {
    const oldLines = original.split("\n");
    const newLines = generated.split("\n");
    lines.push(`@@ -1,${oldLines.length} +1,${newLines.length} @@`);

    // 简单行级 diff
    const maxLen = Math.max(oldLines.length, newLines.length);
    for (let i = 0; i < maxLen; i++) {
      const oldLine = i < oldLines.length ? oldLines[i] : undefined;
      const newLine = i < newLines.length ? newLines[i] : undefined;

      if (oldLine === newLine) {
        if (oldLine !== undefined) lines.push(` ${oldLine}`);
      } else {
        if (oldLine !== undefined) lines.push(`-${oldLine}`);
        if (newLine !== undefined) lines.push(`+${newLine}`);
      }
    }
  }

  return lines.join("\n");
}

/**
 * 将完整新文档展示为 Diff（新文件风格）。
 */
export function showNewFileDiff(generated: string, filePath: string): string {
  return showDiff(undefined, generated, filePath);
}
