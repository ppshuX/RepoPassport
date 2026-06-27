import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { readdir } from "node:fs/promises";
import { statSync, existsSync } from "node:fs";
/** 高价值文件名列表 */
const HIGH_VALUE_FILES = [
    "package.json",
    "README.md",
    "README_zh.md",
    "README.zh.md",
    "README-zh.md",
    "tsconfig.json",
    "jsconfig.json",
];
/** 构建/工具配置文件名 */
const BUILD_CONFIG_FILES = [
    "vite.config.ts",
    "vite.config.js",
    "next.config.js",
    "next.config.ts",
    "webpack.config.js",
    "rollup.config.ts",
    "rollup.config.js",
    "esbuild.config.js",
    "tsup.config.ts",
];
/** 入口文件候选 */
const ENTRY_CANDIDATES = [
    "src/index.ts",
    "src/index.js",
    "src/main.ts",
    "src/main.js",
    "lib/index.ts",
    "lib/index.js",
    "index.ts",
    "index.js",
];
/** 跳过目录名 */
const SKIP_DIRS = new Set([
    "node_modules",
    ".git",
    "dist",
    "build",
    ".next",
    ".nuxt",
    "__pycache__",
    "coverage",
]);
/** 跳过文件名模式 */
const SKIP_FILE_PATTERNS = [
    /^(CHANGELOG|LICENSE|CONTRIBUTING|CODE_OF_CONDUCT|SECURITY|AUTHORS)(\.md)?$/i,
    /\.test\.(ts|js|tsx|jsx)$/,
    /\.spec\.(ts|js|tsx|jsx)$/,
    /\.(png|jpg|jpeg|gif|svg|webp|ico|woff2?|eot|ttf|otf)$/,
    /\.lock$/,
    /^\./, // .gitignore, .eslintrc, .prettierrc etc
];
const MAX_FILE_SIZE = 500_000; // 500KB
const MAX_LINES_PER_FILE = 300;
const MAX_TOTAL_TOKENS_ESTIMATE = 8000;
/**
 * 估算字符串的 token 数（粗略：4 字符 ≈ 1 token）。
 */
function estimateTokens(text) {
    return Math.ceil(text.length / 4);
}
/**
 * 过滤和读取仓库中的高价值文件。
 */
export async function collectFiles(tempDir, log) {
    const files = [];
    let totalTokens = 0;
    // 1. 读取高价值固定文件
    for (const fileName of HIGH_VALUE_FILES) {
        const fp = join(tempDir, fileName);
        const result = await readIfExists(fp, log);
        if (result) {
            totalTokens += estimateTokens(result.content);
            files.push(result);
        }
    }
    // 2. 读取构建配置文件
    for (const fileName of BUILD_CONFIG_FILES) {
        const fp = join(tempDir, fileName);
        if (totalTokens > MAX_TOTAL_TOKENS_ESTIMATE * 0.8)
            break;
        const result = await readIfExists(fp, log);
        if (result) {
            totalTokens += estimateTokens(result.content);
            files.push(result);
        }
    }
    // 3. 读取入口文件
    for (const fileName of ENTRY_CANDIDATES) {
        const fp = join(tempDir, fileName);
        if (totalTokens > MAX_TOTAL_TOKENS_ESTIMATE * 0.8)
            break;
        const result = await readTruncated(fp, MAX_LINES_PER_FILE, log);
        if (result) {
            totalTokens += estimateTokens(result.content);
            files.push(result);
        }
    }
    // 4. 读取 src/ 或 lib/ 的一级文件列表
    const srcDir = existsSync(join(tempDir, "src")) ? "src" : "lib";
    const srcPath = join(tempDir, srcDir);
    if (existsSync(srcPath)) {
        try {
            const entries = await readdir(srcPath, { withFileTypes: true });
            const tsFiles = entries
                .filter((e) => e.isFile() &&
                /\.(ts|js|tsx|jsx)$/.test(e.name) &&
                !SKIP_FILE_PATTERNS.some((p) => p.test(e.name)))
                .slice(0, 10); // 最多读 10 个源码文件
            for (const entry of tsFiles) {
                if (totalTokens > MAX_TOTAL_TOKENS_ESTIMATE * 0.9)
                    break;
                const fp = join(srcPath, entry.name);
                const result = await readTruncated(fp, MAX_LINES_PER_FILE, log);
                if (result) {
                    totalTokens += estimateTokens(result.content);
                    files.push(result);
                }
            }
        }
        catch {
            log.verbose(`${srcDir}/ 目录读取失败，跳过`);
        }
    }
    log.info(`收集了 ${files.length} 个文件，预估 ${totalTokens} tokens`);
    return files;
}
async function readIfExists(filePath, log) {
    try {
        const stat = statSync(filePath);
        if (!stat.isFile())
            return null;
        if (stat.size > MAX_FILE_SIZE) {
            log.verbose(`跳过过大文件: ${filePath} (${stat.size} bytes)`);
            return null;
        }
        // 检查文件名是否在跳过模式中
        const name = filePath.split(/[/\\]/).pop() || "";
        if (SKIP_FILE_PATTERNS.some((p) => p.test(name)))
            return null;
        const content = await readFile(filePath, "utf-8");
        return {
            path: filePath.replace(/\\/g, "/"),
            content,
            size: stat.size,
        };
    }
    catch {
        return null;
    }
}
async function readTruncated(filePath, maxLines, log) {
    try {
        const stat = statSync(filePath);
        if (!stat.isFile())
            return null;
        if (stat.size > MAX_FILE_SIZE)
            return null;
        const name = filePath.split(/[/\\]/).pop() || "";
        if (SKIP_FILE_PATTERNS.some((p) => p.test(name)))
            return null;
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
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=files.js.map