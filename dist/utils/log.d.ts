/**
 * 简单日志工具。
 */
export interface Logger {
    info(msg: string): void;
    warn(msg: string): void;
    error(msg: string): void;
    verbose(msg: string): void;
}
export declare function createLogger(verbose: boolean): Logger;
//# sourceMappingURL=log.d.ts.map