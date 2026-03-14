import pino from "pino";

let logger: pino.Logger = pino({ level: "info" }, pino.destination(2));

export function initLogger(opts: { level?: string; logFile?: string }): void {
  const level = opts.level ?? "info";
  const dest = opts.logFile
    ? pino.destination(opts.logFile)
    : pino.destination(2); // stderr
  logger = pino({ level }, dest);
}

export function getLogger(): pino.Logger {
  return logger;
}

/**
 * Higher-order function that wraps a tool handler with entry logging
 * and uncaught exception logging.
 */
export function withLogging<T extends (...args: any[]) => any>(
  toolName: string,
  handler: T,
): T {
  return (async (params: any) => {
    logger.debug({ tool: toolName, args: params }, "tool.call");
    try {
      const result = await handler(params);
      return result;
    } catch (err) {
      logger.error(
        {
          tool: toolName,
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        },
        "tool.uncaught",
      );
      throw err;
    }
  }) as unknown as T;
}
