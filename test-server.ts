#!/usr/bin/env bun
/**
 * test-server.ts — Smoke-test for workspace-mcp server tools & resources
 *
 * Modes:
 *   stdio (default) — spawns workspace-mcp as a child process, no proxy needed
 *   remote          — connects to a running server via Streamable HTTP (proxy URL)
 *
 * Usage:
 *   bun packages/workspace-mcp/test-server.ts [options] [workspace-id]
 *
 * Options:
 *   --remote [params-file]   Connect via Streamable HTTP using server-params.json
 *                            (default: packages/workspace-mcp/server-params.json)
 *   --workspace-dir <path>   Directory to use as workspace root (stdio mode)
 *                            (default: a temp directory)
 *
 * Examples:
 *   bun packages/workspace-mcp/test-server.ts
 *   bun packages/workspace-mcp/test-server.ts --workspace-dir /tmp/test-ws
 *   bun packages/workspace-mcp/test-server.ts --remote
 *   bun packages/workspace-mcp/test-server.ts --remote ./my-params.json my-workspace
 */

import { readFileSync, mkdtempSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

// ── Parse args ──────────────────────────────────────────────────────

const scriptDir = dirname(new URL(import.meta.url).pathname);
let mode: "stdio" | "remote" = "stdio";
let paramsPath: string | undefined;
let workspaceDir: string | undefined;
let workspaceId: string | undefined;

const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const currentArg = args[i];
  if (!currentArg) {
    continue;
  }

  if (currentArg === "--remote") {
    mode = "remote";
    // Next arg might be a params file (if it doesn't start with --)
    const nextArg = args[i + 1];
    if (nextArg && !nextArg.startsWith("--")) {
      paramsPath = resolve(args[++i]!);
    }
  } else if (currentArg === "--workspace-dir") {
    const nextArg = args[i + 1];
    if (nextArg) {
      workspaceDir = resolve(args[++i]!);
    }
  } else if (!currentArg.startsWith("--")) {
    workspaceId = currentArg;
  }
}

// ── Colors ──────────────────────────────────────────────────────────

const isTTY = process.stdout.isTTY;
const c = {
  green: isTTY ? "\x1b[32m" : "",
  red: isTTY ? "\x1b[31m" : "",
  cyan: isTTY ? "\x1b[36m" : "",
  bold: isTTY ? "\x1b[1m" : "",
  dim: isTTY ? "\x1b[2m" : "",
  reset: isTTY ? "\x1b[0m" : "",
};

// ── Counters ────────────────────────────────────────────────────────

let pass = 0;
let fail = 0;
let total = 0;

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
}

function printTest(name: string, ok: boolean, detail?: string) {
  total++;
  const num = String(total).padStart(2);
  const status = ok ? `${c.green}PASS${c.reset}` : `${c.red}FAIL${c.reset}`;
  const suffix = detail ? ` → ${detail.slice(0, 80)}` : "";
  console.log(`${c.cyan}[${num}]${c.reset} ${pad(name, 50)} ${status}${suffix}`);
  if (ok) pass++;
  else fail++;
}

// ── Helper: add workspace_id to args ────────────────────────────────

function ws(args: Record<string, unknown> = {}): Record<string, unknown> {
  if (workspaceId) return { workspace_id: workspaceId, ...args };
  return args;
}

// ── Helper: extract text from tool result ───────────────────────────

function extractText(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const content = result.content as Array<{ type: string; text?: string }>;
  return content?.[0]?.text ?? "";
}

// ── Connect ─────────────────────────────────────────────────────────

console.log();
console.log(`${c.bold}workspace-mcp server test${c.reset}`);

let transport: Transport;

if (mode === "remote") {
  paramsPath = paramsPath ?? resolve(scriptDir, "server-params.json");
  const params: { url: string; token: string } = JSON.parse(readFileSync(paramsPath, "utf-8"));

  console.log(`Mode:      remote (Streamable HTTP)`);
  console.log(`Endpoint:  ${params.url}`);
  console.log(`Params:    ${paramsPath}`);

  transport = new StreamableHTTPClientTransport(new URL(params.url), {
    requestInit: {
      headers: { Authorization: `Bearer ${params.token}` },
    },
  });
} else {
  // Stdio mode — spawn workspace-mcp directly
  const serverBin = resolve(scriptDir, "src/index.ts");
  workspaceDir = workspaceDir ?? mkdtempSync(join(tmpdir(), "ws-mcp-test-"));

  console.log(`Mode:      stdio (direct)`);
  console.log(`Server:    ${serverBin}`);
  console.log(`Workspace: ${workspaceDir}`);

  transport = new StdioClientTransport({
    command: "bun",
    args: ["run", serverBin],
    env: {
      ...process.env as Record<string, string>,
      DEFAULT_WORKSPACE_NAME: "test",
      DEFAULT_WORKSPACE_DIR: workspaceDir,
    },
  });
}

console.log(`WS ID:     ${workspaceId ?? "<default>"}`);
console.log();

const client = new Client({ name: "test-server", version: "1.0.0" });

try {
  await client.connect(transport);
  printTest("MCP connect", true);
} catch (err: any) {
  printTest("MCP connect", false, err.message);
  console.log();
  console.log(`${c.red}Cannot connect — aborting.${c.reset}`);
  if (err.message.includes("timeout")) {
    console.log();
    console.log(`${c.dim}Timeout usually means:${c.reset}`);
    console.log(`${c.dim}  1. The session_id in the URL has expired — get a fresh one from the desktop app${c.reset}`);
    console.log(`${c.dim}  2. The desktop app browser tab must be open with an active agent session${c.reset}`);
    console.log(`${c.dim}  3. Try stdio mode instead: bun packages/workspace-mcp/test-server.ts${c.reset}`);
  }
  console.log();
  process.exit(1);
}

// ── Helper: run tool test ───────────────────────────────────────────

async function testTool(
  name: string,
  toolName: string,
  args: Record<string, unknown>,
  expectError = false,
): Promise<string> {
  try {
    const result = await client.callTool({ name: toolName, arguments: args });
    const text = extractText(result);
    if (expectError) {
      printTest(name, false, "expected error, got success");
      return text;
    }
    if (result.isError) {
      printTest(name, false, `tool error: ${text.slice(0, 100)}`);
      return text;
    }
    printTest(name, true, text.split("\n")[0]);
    return text;
  } catch (err: any) {
    if (expectError) {
      printTest(name, true, `expected error: ${err.message.slice(0, 60)}`);
      return "";
    }
    printTest(name, false, err.message);
    return "";
  }
}

async function testResource(name: string, uri: string, expectError = false): Promise<string> {
  try {
    const result = await client.readResource({ uri });
    const text = (result.contents?.[0] as any)?.text ?? "";
    if (expectError) {
      printTest(name, false, "expected error, got success");
      return text;
    }
    printTest(name, true, text.split("\n")[0]);
    return text;
  } catch (err: any) {
    if (expectError) {
      printTest(name, true, `expected error: ${err.message.slice(0, 60)}`);
      return "";
    }
    printTest(name, false, err.message);
    return "";
  }
}

// ── Capability Discovery ────────────────────────────────────────────

console.log(`${c.bold}Capability Discovery${c.reset}`);

try {
  const tools = await client.listTools();
  printTest("tools/list", tools.tools.length > 0, `${tools.tools.length} tools registered`);
} catch (err: any) {
  printTest("tools/list", false, err.message);
}

try {
  const resources = await client.listResourceTemplates();
  const count = resources.resourceTemplates?.length ?? 0;
  printTest("resources/listTemplates", true, `${count} resource template(s)`);
} catch (err: any) {
  printTest("resources/listTemplates", false, err.message);
}

// ── Workspace Management ────────────────────────────────────────────

console.log(`\n${c.bold}Workspace Management${c.reset}`);

await testTool("ws_workspace_list", "ws_workspace_list", {});
await testTool("ws_workspace_info", "ws_workspace_info", ws());

// ── File Read Operations ────────────────────────────────────────────

console.log(`\n${c.bold}File Read Operations${c.reset}`);

await testTool("ws_exists (root dir)", "ws_exists", ws({ path: "." }));
await testTool("ws_stat (root dir)", "ws_stat", ws({ path: "." }));
await testTool("ws_readdir (root)", "ws_readdir", ws({ path: "." }));
await testTool("ws_readdir_with_types (root)", "ws_readdir_with_types", ws({ path: "." }));
await testTool("ws_exists (nonexistent)", "ws_exists", ws({ path: "__does_not_exist_12345__.txt" }));

// ── File Write Operations ───────────────────────────────────────────

console.log(`\n${c.bold}File Write Operations${c.reset}`);

const TEST_DIR = `.test-workspace-mcp-${process.pid}`;
const TEST_FILE = `${TEST_DIR}/hello.txt`;

await testTool("ws_mkdir (test dir)", "ws_mkdir", ws({ path: TEST_DIR, recursive: true }));
await testTool("ws_write_file", "ws_write_file", ws({ path: TEST_FILE, content: "hello world\nline two\n" }));
await testTool("ws_read_file (verify write)", "ws_read_file", ws({ path: TEST_FILE }));
await testTool("ws_append_file", "ws_append_file", ws({ path: TEST_FILE, content: "appended line\n" }));
await testTool("ws_read_file (verify append)", "ws_read_file", ws({ path: TEST_FILE }));

// ── Edit Operations ─────────────────────────────────────────────────

console.log(`\n${c.bold}Edit Operations${c.reset}`);

await testTool("ws_edit (string replace)", "ws_edit", ws({
  path: TEST_FILE,
  old_string: "hello world",
  new_string: "goodbye world",
}));
await testTool("ws_read_file (verify edit)", "ws_read_file", ws({ path: TEST_FILE }));

// ── Search Operations ───────────────────────────────────────────────

console.log(`\n${c.bold}Search Operations${c.reset}`);

await testTool("ws_glob (*.txt)", "ws_glob", ws({ pattern: "**/*.txt" }));
await testTool("ws_grep (content)", "ws_grep", ws({ pattern: "goodbye", output_mode: "content", head_limit: 5 }));
await testTool("ws_grep (files_with_matches)", "ws_grep", ws({ pattern: "goodbye", output_mode: "files_with_matches" }));
await testTool("ws_grep (count)", "ws_grep", ws({ pattern: "goodbye", output_mode: "count" }));

// ── Path Operations ─────────────────────────────────────────────────

console.log(`\n${c.bold}Path Operations${c.reset}`);

await testTool("ws_resolve_path", "ws_resolve_path", ws({ base: TEST_DIR, path: "hello.txt" }));
await testTool("ws_realpath", "ws_realpath", ws({ path: TEST_FILE }));
await testTool("ws_get_all_paths", "ws_get_all_paths", ws());

// ── File Operations ─────────────────────────────────────────────────

console.log(`\n${c.bold}File Operations${c.reset}`);

const COPY_FILE = `${TEST_DIR}/hello-copy.txt`;
const MOVE_FILE = `${TEST_DIR}/hello-moved.txt`;

await testTool("ws_cp (copy file)", "ws_cp", ws({ src: TEST_FILE, dest: COPY_FILE }));
await testTool("ws_exists (verify copy)", "ws_exists", ws({ path: COPY_FILE }));
await testTool("ws_mv (move file)", "ws_mv", ws({ src: COPY_FILE, dest: MOVE_FILE }));
await testTool("ws_exists (verify move dest)", "ws_exists", ws({ path: MOVE_FILE }));
await testTool("ws_exists (verify move src gone)", "ws_exists", ws({ path: COPY_FILE }));
await testTool("ws_utimes (set timestamps)", "ws_utimes", ws({
  path: MOVE_FILE,
  atime: "2026-01-01T00:00:00.000Z",
  mtime: "2026-01-01T00:00:00.000Z",
}));
await testTool("ws_stat (verify timestamps)", "ws_stat", ws({ path: MOVE_FILE }));

// ── Link Operations ─────────────────────────────────────────────────

console.log(`\n${c.bold}Link Operations${c.reset}`);

const LINK_FILE = `${TEST_DIR}/hello-link`;

await testTool("ws_symlink", "ws_symlink", ws({ target: "hello.txt", link_path: LINK_FILE }));
await testTool("ws_readlink", "ws_readlink", ws({ path: LINK_FILE }));
await testTool("ws_lstat (symlink metadata)", "ws_lstat", ws({ path: LINK_FILE }));

// ── Resources API ───────────────────────────────────────────────────

console.log(`\n${c.bold}Resources API${c.reset}`);

// Write a known file for resource read tests
await client.callTool({ name: "ws_write_file", arguments: ws({ path: "resource-test.txt", content: "resource content here\n" }) });

await testResource("workspace:// read file", "workspace://resource-test.txt");
await testResource("workspace:// read (nested path)", `workspace://${TEST_FILE}`);
await testResource("workspace:// read (nonexistent)", "workspace://__does_not_exist_12345__.txt", true);

// Clean up resource test file
await client.callTool({ name: "ws_rm", arguments: ws({ path: "resource-test.txt", force: true }) });

// ── Cleanup ─────────────────────────────────────────────────────────

console.log(`\n${c.bold}Cleanup${c.reset}`);

await testTool("ws_rm (recursive cleanup)", "ws_rm", ws({ path: TEST_DIR, recursive: true, force: true }));
await testTool("ws_exists (verify cleanup)", "ws_exists", ws({ path: TEST_DIR }));

// ── Disconnect ──────────────────────────────────────────────────────

try {
  await client.close();
} catch {
  // ignore close errors
}

// ── Summary ─────────────────────────────────────────────────────────

console.log();
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
const failStr = fail > 0 ? `${c.red}${fail} failed${c.reset}` : "0 failed";
console.log(`${c.bold}Results: ${c.green}${pass} passed${c.reset}, ${failStr} (${total} total)`);
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log();

process.exit(fail > 0 ? 1 : 0);
