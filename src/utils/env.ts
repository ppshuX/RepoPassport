import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

/**
 * 从文件读取 key=value 环境变量并设置到 process.env。
 * 不覆盖已存在的环境变量。
 * 忽略空行和 # 注释行。
 */
function loadEnvFile(filePath: string): void {
  try {
    const content = readFileSync(filePath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      // 跳过空行和注释
      if (!trimmed || trimmed.startsWith("#")) continue;

      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;

      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();

      // 如果值被引号包裹，去引号
      const cleanValue = (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
        ? value.slice(1, -1)
        : value;

      if (key && !process.env[key]) {
        process.env[key] = cleanValue;
      }
    }
  } catch {
    // 文件不存在或无法读取，静默跳过
  }
}

/**
 * 加载环境变量文件（按优先级）：
 * 1. ~/.repopassport/.env — 用户全局配置
 *
 * 已存在的环境变量不会被覆盖（命令行设置优先）。
 */
export function loadEnv(): void {
  const globalEnv = join(homedir(), ".repopassport", ".env");
  loadEnvFile(globalEnv);
}
