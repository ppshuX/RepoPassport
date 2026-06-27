import { describe, it, expect } from "vitest";
import { validateGitHubUrl, parseRepoUrl } from "../src/repo/clone.js";

describe("validateGitHubUrl", () => {
  it("accepts valid HTTPS URL", () => {
    expect(validateGitHubUrl("https://github.com/owner/repo")).toBe(true);
  });

  it("accepts URL with .git suffix", () => {
    expect(validateGitHubUrl("https://github.com/owner/repo.git")).toBe(true);
  });

  it("rejects non-GitHub URL", () => {
    expect(validateGitHubUrl("https://gitlab.com/owner/repo")).toBe(false);
  });

  it("rejects missing owner or repo", () => {
    expect(validateGitHubUrl("https://github.com")).toBe(false);
  });

  it("rejects URL with extra path", () => {
    expect(validateGitHubUrl("https://github.com/owner/repo/tree/main")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(validateGitHubUrl("")).toBe(false);
  });
});

describe("parseRepoUrl", () => {
  it("parses owner and name", () => {
    const result = parseRepoUrl("https://github.com/nestjs/nest");
    expect(result).toEqual({ owner: "nestjs", name: "nest" });
  });

  it("returns null for invalid URL", () => {
    expect(parseRepoUrl("not-a-url")).toBeNull();
  });
});
