import { describe, it, expect } from "vitest";
import { showNewFileDiff, showDiff } from "../src/utils/diff.js";

describe("showNewFileDiff", () => {
  it("generates diff for new file", () => {
    const content = "# Hello\n\nWorld";
    const result = showNewFileDiff(content, "README.en.md");
    expect(result).toContain("--- a/README.en.md");
    expect(result).toContain("+++ b/README.en.md");
    expect(result).toContain("+# Hello");
  });
});

describe("showDiff", () => {
  it("generates diff between two files", () => {
    const original = "line1\nline2\nline3";
    const generated = "line1\nline2-changed\nline3\nline4";
    const result = showDiff(original, generated, "README.en.md");
    expect(result).toContain(" line1");
    expect(result).toContain("-line2");
    expect(result).toContain("+line2-changed");
    expect(result).toContain("+line4");
  });

  it("handles complete rewrite", () => {
    const original = "old content";
    const generated = "new content";
    const result = showDiff(original, generated, "file.md");
    expect(result).toContain("-old content");
    expect(result).toContain("+new content");
  });
});
