import * as posix from "node:path/posix";

export function sanitizePath(input: string): string {
  const normalized = posix.normalize(input);
  const relative = normalized.replace(/^\/+/, "");
  if (relative.startsWith("..")) {
    throw new Error(`Path escapes workspace root: ${input}`);
  }
  return relative || ".";
}

export function sanitizeGlobPattern(input: string): string {
  if (input.includes("..")) {
    throw new Error(`Glob pattern must not contain '..': ${input}`);
  }
  return input.replace(/^\/+/, "");
}

export function compileRegex(
  pattern: string,
  options: { caseInsensitive?: boolean; multiline?: boolean } = {},
): RegExp {
  let flags = "g";
  if (options.caseInsensitive) flags += "i";
  if (options.multiline) flags += "ms";
  try {
    return new RegExp(pattern, flags);
  } catch (err) {
    throw new Error(
      `Invalid regex pattern: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
