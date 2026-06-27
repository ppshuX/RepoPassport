import { describe, it, expect } from "vitest";
import { validateRepoUrl, parseRepoUrl } from "../src/repo/clone.js";

describe("validateRepoUrl (multi-platform)", () => {
  it("accepts valid GitHub HTTPS URL", () => {
    expect(validateRepoUrl("https://github.com/owner/repo")).toBe(true);
  });

  it("accepts GitHub URL with .git suffix", () => {
    expect(validateRepoUrl("https://github.com/owner/repo.git")).toBe(true);
  });

  it("accepts valid Gitee URL", () => {
    expect(validateRepoUrl("https://gitee.com/owner/repo")).toBe(true);
  });

  it("accepts valid ACGit URL", () => {
    expect(validateRepoUrl("https://git.woa.com/group/project")).toBe(true);
  });

  it("rejects GitLab URL (unsupported)", () => {
    expect(validateRepoUrl("https://gitlab.com/owner/repo")).toBe(false);
  });

  it("rejects missing owner or repo", () => {
    expect(validateRepoUrl("https://github.com")).toBe(false);
  });

  it("rejects URL with extra path", () => {
    expect(validateRepoUrl("https://github.com/owner/repo/tree/main")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(validateRepoUrl("")).toBe(false);
  });
});

describe("parseRepoUrl (multi-platform)", () => {
  it("parses GitHub owner and name with platform info", () => {
    const result = parseRepoUrl("https://github.com/nestjs/nest");
    expect(result).toMatchObject({ platform: "github", owner: "nestjs", name: "nest" });
  });

  it("parses Gitee owner and name", () => {
    const result = parseRepoUrl("https://gitee.com/oschina/gitee");
    expect(result).toMatchObject({ platform: "gitee", owner: "oschina", name: "gitee" });
  });

  it("parses ACGit woa.com URL", () => {
    const result = parseRepoUrl("https://git.woa.com/team/project.git");
    expect(result).toMatchObject({ platform: "acgit", owner: "team", name: "project" });
  });

  it("parses ACGit code.tencent.com URL", () => {
    const result = parseRepoUrl("https://git.code.tencent.com/group/repo");
    expect(result).toMatchObject({ platform: "acgit", owner: "group", name: "repo" });
  });

  it("returns null for invalid URL", () => {
    expect(parseRepoUrl("not-a-url")).toBeNull();
  });
});
