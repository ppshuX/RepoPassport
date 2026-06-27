export function createLogger(verbose) {
    return {
        info(msg) {
            console.log(`[info] ${msg}`);
        },
        warn(msg) {
            console.warn(`[warn] ${msg}`);
        },
        error(msg) {
            console.error(`[error] ${msg}`);
        },
        verbose(msg) {
            if (verbose) {
                console.log(`[debug] ${msg}`);
            }
        },
    };
}
//# sourceMappingURL=log.js.map