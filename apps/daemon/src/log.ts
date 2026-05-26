/**
 * Structured logger. JSON in prod, pretty in dev. No PII per .
 */
import { IS_PROD } from "./env.js";

export interface LogContext {
  [k: string]: unknown;
}

function emit(
  level: "info" | "warn" | "error" | "debug",
  msg: string,
  ctx?: LogContext,
) {
  const at = new Date().toISOString();
  if (IS_PROD) {
    process.stdout.write(JSON.stringify({ at, level, msg, ...ctx }) + "\n");
  } else {
    const color =
      level === "error"
        ? "\x1b[31m"
        : level === "warn"
          ? "\x1b[33m"
          : level === "debug"
            ? "\x1b[90m"
            : "\x1b[36m";
    process.stdout.write(
      `${color}[${level}]\x1b[0m ${msg} ${ctx ? JSON.stringify(ctx) : ""}\n`,
    );
  }
}

export const log = {
  info: (msg: string, ctx?: LogContext) => emit("info", msg, ctx),
  warn: (msg: string, ctx?: LogContext) => emit("warn", msg, ctx),
  error: (msg: string, ctx?: LogContext) => emit("error", msg, ctx),
  debug: (msg: string, ctx?: LogContext) => emit("debug", msg, ctx),
};
