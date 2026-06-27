import { rm } from "node:fs/promises";
import type { Logger } from "../utils/log.js";

/**
 * 安全清理临时目录。
 */
export async function cleanupTempDir(tempDir: string, log: Logger): Promise<void> {
  try {
    await rm(tempDir, { recursive: true, force: true });
    log.verbose(`已清理临时目录: ${tempDir}`);
  } catch {
    log.warn(`清理临时目录失败（可能已删除）: ${tempDir}`);
  }
}
