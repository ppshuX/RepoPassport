/**
 * 简单日志工具。
 */
export interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
  verbose(msg: string): void;
}

export function createLogger(verbose: boolean): Logger {
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
