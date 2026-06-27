import { describe, it, expect } from "vitest";

describe("status 命令", () => {
  it("验证 PR URL 格式", () => {
    const validUrls = [
      "https://github.com/owner/repo/pull/123",
      "https://github.com/nestjs/nest/pull/12345",
      "https://github.com/a/b/pull/1",
    ];

    const invalidUrls = [
      "https://github.com/owner/repo",
      "https://github.com/owner/repo/issues/123",
      "not-a-url",
      "https://gitlab.com/owner/repo/pull/123",
    ];

    const pattern = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+/;

    for (const url of validUrls) {
      expect(pattern.test(url)).toBe(true);
    }

    for (const url of invalidUrls) {
      expect(pattern.test(url)).toBe(false);
    }
  });
});
