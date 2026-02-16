import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as posix from "node:path/posix";
import type { IFileSystem } from "just-bash";
import type { WorkspaceManager } from "../workspace/manager.ts";
import { toMcpError } from "../util/errors.ts";
import { workspaceIdSchema } from "../util/schemas.ts";
import {
  sanitizeGlobPattern,
  sanitizePath,
  compileRegex,
} from "../util/sanitize.ts";
import { FILE_TYPE_MAP } from "../util/file-type-map.ts";

// ---------------------------------------------------------------------------
// ws_glob
// ---------------------------------------------------------------------------

const GLOB_TIMEOUT_MS = 10_000;

/** Core glob logic, extracted for testability */
export async function globWorkspace(
  rootPath: string,
  pattern: string,
  subPath?: string,
  timeoutMs: number = GLOB_TIMEOUT_MS,
): Promise<{ files: string[]; truncated: boolean; reason?: string }> {
  const sanitized = sanitizeGlobPattern(pattern);
  let cwd = rootPath;
  let prefix = "";
  if (subPath) {
    const sanitizedPath = sanitizePath(subPath);
    cwd = posix.join(rootPath, sanitizedPath);
    prefix = sanitizedPath === "." ? "" : sanitizedPath + "/";
  }

  const glob = new Bun.Glob(sanitized);
  const matches: { path: string; mtime: number }[] = [];
  const deadline = Date.now() + timeoutMs;

  for await (const filePath of glob.scan({
    cwd,
    dot: true,
    onlyFiles: true,
    followSymlinks: false,
    absolute: false,
  })) {
    if (Date.now() > deadline) {
      matches.sort((a, b) => b.mtime - a.mtime);
      return {
        files: matches.map((m) => prefix + m.path),
        truncated: true,
        reason: "10-second timeout reached",
      };
    }
    try {
      const file = Bun.file(posix.join(cwd, filePath));
      const s = await file.stat();
      matches.push({ path: filePath, mtime: s?.mtimeMs ?? 0 });
    } catch {
      matches.push({ path: filePath, mtime: 0 });
    }
  }

  matches.sort((a, b) => b.mtime - a.mtime);
  return {
    files: matches.map((m) => prefix + m.path),
    truncated: false,
  };
}

// ---------------------------------------------------------------------------
// ws_grep
// ---------------------------------------------------------------------------

export interface GrepOptions {
  outputMode: "files_with_matches" | "content" | "count";
  type?: string;
  glob?: string;
  caseInsensitive?: boolean;
  multiline?: boolean;
  contextBefore?: number;
  contextAfter?: number;
  headLimit: number;
  lineNumbers?: boolean;
  path?: string;
}

interface GrepMatchLine {
  file: string;
  line?: number;
  content?: string;
  isContext?: boolean;
  separator?: boolean;
}

interface GrepCountEntry {
  file: string;
  count: number;
}

export interface GrepResult {
  files?: string[];
  matches?: GrepMatchLine[];
  counts?: GrepCountEntry[];
  truncated: boolean;
}

/** Check whether content looks like a binary file (null bytes in first 8192 chars) */
function isBinary(content: string): boolean {
  const sample = content.slice(0, 8192);
  return sample.includes("\0");
}

/** Check if a file path matches the type/glob filters */
function matchesFilter(filePath: string, options: GrepOptions): boolean {
  if (options.type) {
    const extensions = FILE_TYPE_MAP[options.type];
    if (extensions) {
      const ext = posix.extname(filePath).toLowerCase();
      if (!extensions.includes(ext)) return false;
    }
    // Unknown type: don't filter (pass through)
  }
  if (options.glob) {
    const globPattern = new Bun.Glob(options.glob);
    const fileName = posix.basename(filePath);
    if (!globPattern.match(fileName)) return false;
  }
  return true;
}

/** Recursively collect all file paths from an IFileSystem directory */
async function collectFiles(
  fs: IFileSystem,
  dir: string,
): Promise<string[]> {
  const results: string[] = [];
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return results;
  }
  // Sort for deterministic order
  entries.sort();
  for (const entry of entries) {
    const fullPath = posix.join(dir, entry);
    try {
      const stat = await fs.stat(fullPath);
      if (stat.isDirectory) {
        const subFiles = await collectFiles(fs, fullPath);
        results.push(...subFiles);
      } else if (stat.isFile) {
        results.push(fullPath);
      }
    } catch {
      // Skip entries we can't stat
    }
  }
  return results;
}

/** Core grep logic, extracted for testability */
export async function grepWorkspace(
  fs: IFileSystem,
  rootDir: string,
  pattern: string,
  options: GrepOptions,
): Promise<GrepResult> {
  const regex = compileRegex(pattern, {
    caseInsensitive: options.caseInsensitive,
    multiline: options.multiline,
  });

  // Determine what to search
  let filesToSearch: string[];
  let searchRoot = rootDir;

  if (options.path) {
    const sanitized = sanitizePath(options.path);
    const fullPath = posix.join(rootDir, sanitized);

    try {
      const stat = await fs.stat(fullPath);
      if (stat.isFile) {
        filesToSearch = [fullPath];
      } else if (stat.isDirectory) {
        searchRoot = fullPath;
        filesToSearch = await collectFiles(fs, searchRoot);
      } else {
        filesToSearch = [];
      }
    } catch {
      filesToSearch = [];
    }
  } else {
    filesToSearch = await collectFiles(fs, searchRoot);
  }

  const { headLimit, outputMode } = options;

  // Result accumulators
  const fileMatches: string[] = [];
  const contentMatches: GrepMatchLine[] = [];
  const countEntries: GrepCountEntry[] = [];
  let resultCount = 0;
  let truncated = false;

  for (const filePath of filesToSearch) {
    if (truncated) break;

    // Make path relative to rootDir for output
    let relativePath = filePath;
    if (filePath.startsWith(rootDir)) {
      relativePath = filePath.slice(rootDir.length);
      if (relativePath.startsWith("/")) relativePath = relativePath.slice(1);
    }

    // Apply type/glob filters
    if (!matchesFilter(relativePath, options)) continue;

    // Read file content
    let content: string;
    try {
      content = await fs.readFile(filePath);
    } catch {
      continue;
    }

    // Skip binary files
    if (isBinary(content)) continue;

    // Check for matches
    const lines = content.split("\n");

    if (outputMode === "files_with_matches") {
      // Just need to know if any line matches
      const hasMatch = lines.some((line) => {
        regex.lastIndex = 0;
        return regex.test(line);
      });
      if (hasMatch) {
        fileMatches.push(relativePath);
        resultCount++;
        if (resultCount >= headLimit) {
          truncated = true;
        }
      }
    } else if (outputMode === "count") {
      let count = 0;
      for (const line of lines) {
        regex.lastIndex = 0;
        if (regex.test(line)) count++;
      }
      if (count > 0) {
        countEntries.push({ file: relativePath, count });
        resultCount++;
        if (resultCount >= headLimit) {
          truncated = true;
        }
      }
    } else if (outputMode === "content") {
      // Find matching line indices
      const matchingIndices: number[] = [];
      for (let i = 0; i < lines.length; i++) {
        regex.lastIndex = 0;
        if (regex.test(lines[i]!)) {
          matchingIndices.push(i);
        }
      }

      if (matchingIndices.length === 0) continue;

      // Build ranges with context
      const contextB = options.contextBefore ?? 0;
      const contextA = options.contextAfter ?? 0;

      // Merge overlapping ranges
      const ranges: Array<[number, number, Set<number>]> = [];
      for (const idx of matchingIndices) {
        const start = Math.max(0, idx - contextB);
        const end = Math.min(lines.length - 1, idx + contextA);
        const lastRange = ranges[ranges.length - 1];
        if (lastRange && start <= lastRange[1] + 1) {
          // Merge with previous range
          lastRange[1] = end;
          lastRange[2].add(idx);
        } else {
          const matchSet = new Set<number>();
          matchSet.add(idx);
          ranges.push([start, end, matchSet]);
        }
      }

      // Emit lines for each range
      for (let r = 0; r < ranges.length; r++) {
        if (truncated) break;

        // Add separator between non-contiguous blocks within same file
        if (r > 0) {
          contentMatches.push({
            file: relativePath,
            separator: true,
          });
        }

        const range = ranges[r]!;
        const [start, end, matchIndices] = range;
        for (let i = start; i <= end; i++) {
          if (truncated) break;

          const isMatch = matchIndices.has(i);
          contentMatches.push({
            file: relativePath,
            line: options.lineNumbers !== false ? i + 1 : undefined,
            content: lines[i],
            isContext: !isMatch ? true : undefined,
          });
          resultCount++;
          if (resultCount >= headLimit) {
            truncated = true;
          }
        }
      }
    }
  }

  const result: GrepResult = { truncated };

  if (outputMode === "files_with_matches") {
    result.files = fileMatches;
  } else if (outputMode === "content") {
    result.matches = contentMatches;
  } else if (outputMode === "count") {
    result.counts = countEntries;
  }

  return result;
}

// ---------------------------------------------------------------------------
// MCP registration
// ---------------------------------------------------------------------------

export function registerSearchTools(
  server: McpServer,
  manager: WorkspaceManager,
): void {
  // ws_glob registration
  server.registerTool(
    "ws_glob",
    {
      title: "Find Files by Pattern",
      description:
        "Find files matching a glob pattern within the workspace. " +
        "Results sorted by modification time (most recent first). " +
        "Times out after 10 seconds, returning partial results.",
      inputSchema: {
        workspace_id: workspaceIdSchema,
        pattern: z
          .string()
          .min(1)
          .describe("Glob pattern (e.g., '**/*.ts', 'src/**/*.{js,jsx}')"),
        path: z
          .string()
          .optional()
          .describe("Directory to search in (default: workspace root)"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ workspace_id, pattern, path }) => {
      try {
        const meta = manager.getWorkspace(workspace_id);
        const result = await globWorkspace(meta.rootPath, pattern, path);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                result.truncated
                  ? {
                      files: result.files,
                      truncated: true,
                      reason: result.reason,
                    }
                  : result.files,
              ),
            },
          ],
        };
      } catch (err) {
        return toMcpError(err);
      }
    },
  );

  // ws_grep registration
  server.registerTool(
    "ws_grep",
    {
      title: "Search File Contents",
      description:
        "Search file contents with regex patterns. Supports output modes: " +
        "files_with_matches (file paths only), content (matching lines), count (match counts). " +
        "Filter by file type or glob. Default limit: 100 matches.",
      inputSchema: {
        workspace_id: workspaceIdSchema,
        pattern: z.string().min(1).describe("Regex pattern to search for"),
        path: z
          .string()
          .optional()
          .describe(
            "File or directory to search (default: workspace root)",
          ),
        output_mode: z
          .enum(["files_with_matches", "content", "count"])
          .optional()
          .default("files_with_matches")
          .describe("Output format"),
        type: z
          .string()
          .optional()
          .describe(
            "File type filter (e.g., 'ts', 'js', 'py'). Maps to file extensions.",
          ),
        glob: z
          .string()
          .optional()
          .describe("Glob pattern to filter files (e.g., '*.test.ts')"),
        case_insensitive: z
          .boolean()
          .optional()
          .default(false)
          .describe("Case insensitive search"),
        multiline: z
          .boolean()
          .optional()
          .default(false)
          .describe("Multiline mode where . matches newlines"),
        context_before: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("Lines to show before each match (content mode only)"),
        context_after: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("Lines to show after each match (content mode only)"),
        context: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe(
            "Lines to show before and after each match (shorthand for -B and -A)",
          ),
        head_limit: z
          .number()
          .int()
          .min(1)
          .optional()
          .default(100)
          .describe("Maximum results to return (default: 100)"),
        line_numbers: z
          .boolean()
          .optional()
          .default(true)
          .describe("Show line numbers in content mode"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        const fs = manager.getFs(params.workspace_id);
        const contextB =
          params.context_before ?? params.context ?? 0;
        const contextA =
          params.context_after ?? params.context ?? 0;
        const results = await grepWorkspace(fs, "/", params.pattern, {
          outputMode: params.output_mode,
          type: params.type,
          glob: params.glob,
          caseInsensitive: params.case_insensitive,
          multiline: params.multiline,
          contextBefore: contextB,
          contextAfter: contextA,
          headLimit: params.head_limit,
          lineNumbers: params.line_numbers,
          path: params.path,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(results) }],
        };
      } catch (err) {
        return toMcpError(err);
      }
    },
  );
}
