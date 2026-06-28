import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { readdir } from "node:fs/promises";
import { statSync, existsSync, readdirSync } from "node:fs";
import type { FileContent } from "../types/facts.js";
import type { Logger } from "../utils/log.js";

// ── 多语言生态定义 ──

export interface EcoSystem {
  name: string;
  signals: string[];
  configFiles: string[];
  sourceDirs: string[];
  sourceExts: string[];
  entryFiles: string[];
}

const ECOSYSTEMS: EcoSystem[] = [
  {
    name: "JavaScript/TypeScript",
    signals: ["package.json"],
    configFiles: [
      "package.json", "tsconfig.json", "jsconfig.json",
      "vite.config.ts", "vite.config.js", "next.config.js", "next.config.ts",
      "webpack.config.js", "rollup.config.ts", "rollup.config.js",
      "esbuild.config.js", "tsup.config.ts",
    ],
    sourceDirs: ["src/", "lib/"],
    sourceExts: [".ts", ".js", ".tsx", ".jsx"],
    entryFiles: ["src/index.ts", "src/index.js", "src/main.ts", "src/main.js", "lib/index.ts", "lib/index.js", "index.ts", "index.js"],
  },
  {
    name: "Python",
    signals: ["requirements.txt", "pyproject.toml", "setup.py", "setup.cfg"],
    configFiles: ["pyproject.toml", "setup.py", "setup.cfg", "Makefile"],
    sourceDirs: ["src/", "lib/"],
    sourceExts: [".py"],
    entryFiles: ["src/__init__.py", "src/main.py", "src/app.py", "main.py", "app.py"],
  },
  {
    name: "Go",
    signals: ["go.mod"],
    configFiles: ["go.mod", "go.sum", "Makefile"],
    sourceDirs: [".", "cmd/", "internal/", "pkg/"],
    sourceExts: [".go"],
    entryFiles: ["main.go", "cmd/main.go", "cmd/server/main.go"],
  },
  {
    name: "Rust",
    signals: ["Cargo.toml"],
    configFiles: ["Cargo.toml", "Cargo.lock"],
    sourceDirs: ["src/"],
    sourceExts: [".rs"],
    entryFiles: ["src/lib.rs", "src/main.rs"],
  },
  {
    name: "Java/Kotlin",
    signals: ["pom.xml", "build.gradle", "build.gradle.kts"],
    configFiles: ["pom.xml", "build.gradle", "build.gradle.kts", "settings.gradle", "settings.gradle.kts"],
    sourceDirs: ["src/main/java/", "src/main/kotlin/"],
    sourceExts: [".java", ".kt"],
    entryFiles: [],
  },
  {
    name: "C/C++",
    signals: ["CMakeLists.txt", "Makefile"],
    configFiles: ["CMakeLists.txt", "Makefile"],
    sourceDirs: ["src/"],
    sourceExts: [".c", ".cpp", ".cc", ".cxx", ".h", ".hpp"],
    entryFiles: [],
  },
  {
    name: "Ruby",
    signals: ["Gemfile"],
    configFiles: ["Gemfile", "Gemfile.lock", "Rakefile"],
    sourceDirs: ["lib/"],
    sourceExts: [".rb"],
    entryFiles: ["lib/index.rb"],
  },
  {
    name: "PHP",
    signals: ["composer.json"],
    configFiles: ["composer.json", "composer.lock"],
    sourceDirs: ["src/", "app/"],
    sourceExts: [".php"],
    entryFiles: ["src/index.php", "app/index.php", "index.php"],
  },
  {
    name: "C#/.NET",
    signals: [],
    configFiles: [],
    sourceDirs: [],
    sourceExts: [".csproj", ".sln"],
    entryFiles: [],
  },
];

// ── 通用常量 ──

const ALWAYS_COLLECT = [
  "README.md",
  "README_zh.md",
  "README.zh.md",
  "README-zh.md",
];

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next", ".nuxt",
  "__pycache__", "coverage", "target", "vendor", ".venv", "venv",
]);

const SKIP_FILE_PATTERNS = [
  /^(CHANGELOG|LICENSE|CONTRIBUTING|CODE_OF_CONDUCT|SECURITY|AUTHORS)(\.md)?$/i,
  /\.test\.(ts|js|tsx|jsx|py|go|rs|java|rb|php)$/,
  /\.spec\.(ts|js|tsx|jsx|py|go|rs)$/,
  /\.(png|jpg|jpeg|gif|svg|webp|ico|woff2?|eot|ttf|otf|lock)$/,
  /^\./,
];

const MAX_FILE_SIZE = 500_000;
const MAX_LINES_PER_FILE = 300;
const MAX_TOTAL_TOKENS_ESTIMATE = 8000;

// ── 多语言检测 ──

/**
 * 检测仓库中存在的生态。
 * 返回匹配的生态列表（按顺序，先去重信号）。
 */
export function detectLanguages(tempDir: string): string[] {
  const found: string[] = [];

  for (const eco of ECOSYSTEMS) {
    // .NET 特殊处理：扫描 *.csproj 文件
    if (eco.name === "C#/.NET") {
      if (hasDotNetProject(tempDir)) {
        found.push(eco.name);
      }
      continue;
    }

    for (const signal of eco.signals) {
      if (existsSync(join(tempDir, signal))) {
        found.push(eco.name);
        break;
      }
    }
  }

  return found.length > 0 ? found : ["JavaScript/TypeScript"]; // 兜底
}

function hasDotNetProject(tempDir: string): boolean {
  try {
    const entries = readdirSyncSafe(tempDir);
    return entries.some((e) => e.endsWith(".csproj") || e.endsWith(".sln"));
  } catch {
    return false;
  }
}

function readdirSyncSafe(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

// ── 文件收集 ──

export interface CollectResult {
  files: FileContent[];
  detectedLanguages: string[];
}

/**
 * 收集仓库中的高价值文件，支持多语言生态。
 */
export async function collectFiles(
  tempDir: string,
  log: Logger,
): Promise<CollectResult> {
  const files: FileContent[] = [];
  let totalTokens = 0;
  const detectedLanguages = detectLanguages(tempDir);

  log.verbose(`检测到语言/生态: ${detectedLanguages.join(", ")}`);

  // 1. 始终收集的 README 文件
  for (const fileName of ALWAYS_COLLECT) {
    const fp = join(tempDir, fileName);
    const result = await readIfExists(fp, log);
    if (result) {
      totalTokens += estimateTokens(result.content);
      files.push(result);
    }
  }

  // 2. 按检测到的生态收集
  for (const lang of detectedLanguages) {
    if (totalTokens > MAX_TOTAL_TOKENS_ESTIMATE * 0.9) break;
    const eco = ECOSYSTEMS.find((e) => e.name === lang);
    if (!eco) continue;

    // 2a. 配置文件
    for (const fileName of eco.configFiles) {
      if (totalTokens > MAX_TOTAL_TOKENS_ESTIMATE * 0.8) break;
      const fp = join(tempDir, fileName);
      const result = await readIfExists(fp, log);
      if (result) {
        totalTokens += estimateTokens(result.content);
        files.push(result);
      }
    }

    // 2b. 入口文件
    for (const fileName of eco.entryFiles) {
      if (totalTokens > MAX_TOTAL_TOKENS_ESTIMATE * 0.8) break;
      const fp = join(tempDir, fileName);
      const result = await readTruncated(fp, MAX_LINES_PER_FILE, log);
      if (result) {
        totalTokens += estimateTokens(result.content);
        files.push(result);
      }
    }

    // 2c. 源码目录中的文件
    for (const srcDir of eco.sourceDirs) {
      if (totalTokens > MAX_TOTAL_TOKENS_ESTIMATE * 0.9) break;
      await collectSourceDir(tempDir, srcDir, eco.sourceExts, files, log, () => totalTokens < MAX_TOTAL_TOKENS_ESTIMATE * 0.9);
      // 重新估算
      totalTokens = files.reduce((sum, f) => sum + estimateTokens(f.content), 0);
    }
  }

  log.info(`收集了 ${files.length} 个文件，预估 ${totalTokens} tokens`);
  return { files, detectedLanguages };
}

async function collectSourceDir(
  tempDir: string,
  srcDir: string,
  exts: string[],
  files: FileContent[],
  log: Logger,
  budgetCheck: () => boolean,
): Promise<void> {
  const srcPath = join(tempDir, srcDir.replace(/[/\\]$/, ""));
  if (!existsSync(srcPath)) return;

  // 深层目录递归收集一层
  const maxFiles = 8; // 每种生态最多 8 个源码文件
  let collected = 0;

  try {
    const entries = await readdir(srcPath, { withFileTypes: true });

    // 先收集当前目录文件
    for (const entry of entries) {
      if (!budgetCheck() || collected >= maxFiles) return;
      if (!entry.isFile()) continue;
      const ext = entry.name.includes(".") ? "." + entry.name.split(".").pop() : "";
      if (!exts.includes(ext)) continue;
      if (SKIP_FILE_PATTERNS.some((p) => p.test(entry.name))) continue;

      const fp = join(srcPath, entry.name);
      const result = await readTruncated(fp, MAX_LINES_PER_FILE, log);
      if (result) {
        files.push(result);
        collected++;
      }
    }

    // 递归一级子目录
    for (const entry of entries) {
      if (!budgetCheck() || collected >= maxFiles) return;
      if (!entry.isDirectory()) continue;
      if (SKIP_DIRS.has(entry.name)) continue;
      if (entry.name.startsWith(".")) continue;

      const subPath = join(srcPath, entry.name);
      try {
        const subEntries = await readdir(subPath, { withFileTypes: true });
        for (const sub of subEntries) {
          if (!budgetCheck() || collected >= maxFiles) return;
          if (!sub.isFile()) continue;
          const ext = sub.name.includes(".") ? "." + sub.name.split(".").pop() : "";
          if (!exts.includes(ext)) continue;
          if (SKIP_FILE_PATTERNS.some((p) => p.test(sub.name))) continue;

          const fp = join(subPath, sub.name);
          const result = await readTruncated(fp, MAX_LINES_PER_FILE, log);
          if (result) {
            files.push(result);
            collected++;
          }
        }
      } catch {
        // 子目录读取失败，跳过
      }
    }
  } catch {
    log.verbose(`${srcDir} 目录读取失败，跳过`);
  }
}

// ── 文件读取工具 ──

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

async function readIfExists(
  filePath: string,
  log: Logger,
): Promise<FileContent | null> {
  try {
    const stat = statSync(filePath);
    if (!stat.isFile()) return null;
    if (stat.size > MAX_FILE_SIZE) {
      log.verbose(`跳过过大文件: ${filePath} (${stat.size} bytes)`);
      return null;
    }

    const name = filePath.split(/[/\\]/).pop() || "";
    if (SKIP_FILE_PATTERNS.some((p) => p.test(name))) return null;

    const content = await readFile(filePath, "utf-8");
    return {
      path: filePath.replace(/\\/g, "/"),
      content,
      size: stat.size,
    };
  } catch {
    return null;
  }
}

async function readTruncated(
  filePath: string,
  maxLines: number,
  log: Logger,
): Promise<FileContent | null> {
  try {
    const stat = statSync(filePath);
    if (!stat.isFile()) return null;
    if (stat.size > MAX_FILE_SIZE) return null;

    const name = filePath.split(/[/\\]/).pop() || "";
    if (SKIP_FILE_PATTERNS.some((p) => p.test(name))) return null;

    let content = await readFile(filePath, "utf-8");
    const lines = content.split("\n");
    if (lines.length > maxLines) {
      content = lines.slice(0, maxLines).join("\n");
      log.verbose(`截断文件 ${filePath}: ${lines.length} → ${maxLines} 行`);
    }

    return {
      path: filePath.replace(/\\/g, "/"),
      content,
      size: stat.size,
    };
  } catch {
    return null;
  }
}
