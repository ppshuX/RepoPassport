/**
 * 简单日志工具。
 * CLI 用 createConsoleLogger，Web 用 createBufferedLogger。
 */
export interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
  verbose(msg: string): void;
}

/** 标准控制台 logger（CLI 用） */
export function createConsoleLogger(verbose: boolean): Logger {
  return {
    info(msg: string) {
      console.log(`[info] ${msg}`);
    },
    warn(msg: string) {
      console.warn(`[warn] ${msg}`);
    },
    error(msg: string) {
      console.error(`[error] ${msg}`);
    },
    verbose(msg: string) {
      if (verbose) {
        console.log(`[debug] ${msg}`);
      }
    },
  };
}

/** 缓冲 logger（Web 用），每条日志回调 onLog */
export function createBufferedLogger(
  onLog: (level: "info" | "warn" | "error" | "verbose", msg: string) => void,
  verbose = false,
): Logger {
  return {
    info(msg: string) {
      onLog("info", msg);
    },
    warn(msg: string) {
      onLog("warn", msg);
    },
    error(msg: string) {
      onLog("error", msg);
    },
    verbose(msg: string) {
      if (verbose) {
        onLog("verbose", msg);
      }
    },
  };
}

/** @deprecated 使用 createConsoleLogger 替代；保留用于向后兼容 */
export const createLogger = createConsoleLogger;
