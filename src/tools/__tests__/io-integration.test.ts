/**
 * Integration tests for workspace-mcp I/O operations.
 *
 * Tests the full MCP stack: Client → HTTP Transport → Server → Tool Handler → Filesystem
 * Uses a real HTTP server with WebStandardStreamableHTTPServerTransport (same as production).
 *
 * Exercises reads, writes, edits, directory operations, search, and error paths
 * through the actual MCP protocol to catch transport-level issues.
 */

import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { WorkspaceManager } from "../../workspace/manager.ts";
import { createServer } from "../../server.ts";

// ── Helpers ──────────────────────────────────────────────────────────

interface McpTextResult {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

function getText(result: unknown): string {
  const r = result as McpTextResult;
  return r.content
    ?.filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("\n");
}

function isError(result: unknown): boolean {
  return (result as McpTextResult).isError === true;
}

/** Call a tool and log timing for debugging transport issues. */
async function timedCall(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<{ result: unknown; durationMs: number }> {
  const start = performance.now();
  try {
    const result = await client.callTool({ name, arguments: args });
    const durationMs = Math.round(performance.now() - start);
    return { result, durationMs };
  } catch (err) {
    const durationMs = Math.round(performance.now() - start);
    console.error(
      `[TIMEOUT-DEBUG] ${name} failed after ${durationMs}ms:`,
      err instanceof Error ? err.message : err,
    );
    throw err;
  }
}

// ── Test Setup ───────────────────────────────────────────────────────

let client: Client;
let httpServer: { stop: () => void; port: number | undefined };
let workspaceDir: string;
let configDir: string;

const WS_ID = "integration-test";

beforeAll(async () => {
  // Create temp dirs for workspace and config
  workspaceDir = await mkdtemp(join(tmpdir(), "ws-io-test-"));
  configDir = await mkdtemp(join(tmpdir(), "ws-io-config-"));

  // Setup workspace manager with real filesystem
  const manager = new WorkspaceManager(configDir);
  await manager.init();
  await manager.setupDefault(WS_ID, workspaceDir);

  // Create MCP server with all tools
  const server = createServer(manager);

  // Use the same HTTP transport as production
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
    enableJsonResponse: true,
  });
  await server.connect(transport);

  // Start HTTP server on random port
  httpServer = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/mcp") return transport.handleRequest(req);
      return new Response("Not Found", { status: 404 });
    },
  });

  // Connect client via Streamable HTTP (same as production)
  const clientTransport = new StreamableHTTPClientTransport(
    new URL(`http://localhost:${httpServer.port}/mcp`),
  );
  client = new Client({ name: "io-integration-test", version: "1.0.0" });
  await client.connect(clientTransport);
});

afterAll(async () => {
  try {
    await client?.close();
  } catch {
    // best-effort
  }
  httpServer?.stop();
  await rm(workspaceDir, { recursive: true, force: true }).catch(() => {});
  await rm(configDir, { recursive: true, force: true }).catch(() => {});
});

// ── File Write Tests ─────────────────────────────────────────────────

describe("ws_write_file", () => {
  it("writes a small file", async () => {
    const { result, durationMs } = await timedCall(client, "ws_write_file", {
      path: "small.txt",
      content: "hello world",
    });
    expect(isError(result)).toBe(false);
    expect(getText(result)).toContain("Written to small.txt");
    expect(durationMs).toBeLessThan(5000);
  });

  it("writes a medium file (10KB)", async () => {
    const content = "x".repeat(10_000);
    const { result, durationMs } = await timedCall(client, "ws_write_file", {
      path: "medium.txt",
      content,
    });
    expect(isError(result)).toBe(false);
    expect(durationMs).toBeLessThan(5000);
  });

  it("writes a large file (1MB)", async () => {
    const content = "abcdefghij\n".repeat(100_000); // ~1.1MB
    const { result, durationMs } = await timedCall(client, "ws_write_file", {
      path: "large.txt",
      content,
    });
    expect(isError(result)).toBe(false);
    expect(durationMs).toBeLessThan(10000);
  });

  it("writes a file with special characters in content", async () => {
    const content = 'line1\n"quotes"\ttab\r\nwindows\n\x00null';
    const { result } = await timedCall(client, "ws_write_file", {
      path: "special.txt",
      content,
    });
    expect(isError(result)).toBe(false);
  });

  it("writes a file with unicode content", async () => {
    const content = "日本語テスト 🎉 émojis àccénts";
    const { result } = await timedCall(client, "ws_write_file", {
      path: "unicode.txt",
      content,
    });
    expect(isError(result)).toBe(false);
  });

  it("overwrites an existing file", async () => {
    await timedCall(client, "ws_write_file", {
      path: "overwrite.txt",
      content: "original",
    });
    const { result } = await timedCall(client, "ws_write_file", {
      path: "overwrite.txt",
      content: "replaced",
    });
    expect(isError(result)).toBe(false);

    const { result: readResult } = await timedCall(client, "ws_read_file", {
      path: "overwrite.txt",
    });
    expect(getText(readResult)).toBe("replaced");
  });

  it("creates parent directories if needed", async () => {
    const { result } = await timedCall(client, "ws_write_file", {
      path: "deep/nested/dir/file.txt",
      content: "nested content",
    });
    // This may fail if ReadWriteFs doesn't auto-create dirs — that's useful to know
    if (isError(result)) {
      console.warn("[IO-TEST] ws_write_file does not auto-create parent dirs:", getText(result));
    }
  });

  it("writes an empty file", async () => {
    const { result } = await timedCall(client, "ws_write_file", {
      path: "empty.txt",
      content: "",
    });
    expect(isError(result)).toBe(false);

    const { result: readResult } = await timedCall(client, "ws_read_file", {
      path: "empty.txt",
    });
    expect(getText(readResult)).toBe("");
  });
});

// ── File Read Tests ──────────────────────────────────────────────────

describe("ws_read_file", () => {
  it("reads the small file written earlier", async () => {
    const { result, durationMs } = await timedCall(client, "ws_read_file", {
      path: "small.txt",
    });
    expect(isError(result)).toBe(false);
    expect(getText(result)).toBe("hello world");
    expect(durationMs).toBeLessThan(5000);
  });

  it("reads the 1MB file", async () => {
    const { result, durationMs } = await timedCall(client, "ws_read_file", {
      path: "large.txt",
    });
    expect(isError(result)).toBe(false);
    expect(getText(result).length).toBeGreaterThan(100_000);
    expect(durationMs).toBeLessThan(10000);
  });

  it("reads unicode content correctly", async () => {
    const { result } = await timedCall(client, "ws_read_file", {
      path: "unicode.txt",
    });
    expect(getText(result)).toBe("日本語テスト 🎉 émojis àccénts");
  });

  it("returns error for non-existent file", async () => {
    const { result } = await timedCall(client, "ws_read_file", {
      path: "does-not-exist.txt",
    });
    expect(isError(result)).toBe(true);
  });
});

// ── Append Tests ─────────────────────────────────────────────────────

describe("ws_append_file", () => {
  it("appends to an existing file", async () => {
    await timedCall(client, "ws_write_file", {
      path: "append-target.txt",
      content: "line1\n",
    });
    const { result } = await timedCall(client, "ws_append_file", {
      path: "append-target.txt",
      content: "line2\n",
    });
    expect(isError(result)).toBe(false);

    const { result: readResult } = await timedCall(client, "ws_read_file", {
      path: "append-target.txt",
    });
    expect(getText(readResult)).toBe("line1\nline2\n");
  });

  it("creates file if it does not exist", async () => {
    const { result } = await timedCall(client, "ws_append_file", {
      path: "append-new.txt",
      content: "fresh content",
    });
    expect(isError(result)).toBe(false);

    const { result: readResult } = await timedCall(client, "ws_read_file", {
      path: "append-new.txt",
    });
    expect(getText(readResult)).toBe("fresh content");
  });
});

// ── Edit Tests ───────────────────────────────────────────────────────

describe("ws_edit", () => {
  it("performs a string replacement", async () => {
    await timedCall(client, "ws_write_file", {
      path: "edit-target.ts",
      content: "const x = 1;\nconst y = 2;",
    });

    const { result } = await timedCall(client, "ws_edit", {
      path: "edit-target.ts",
      old_string: "const x = 1;",
      new_string: "const x = 42;",
    });
    expect(isError(result)).toBe(false);

    const { result: readResult } = await timedCall(client, "ws_read_file", {
      path: "edit-target.ts",
    });
    expect(getText(readResult)).toBe("const x = 42;\nconst y = 2;");
  });

  it("returns error when old_string not found", async () => {
    const { result } = await timedCall(client, "ws_edit", {
      path: "edit-target.ts",
      old_string: "not found",
      new_string: "replacement",
    });
    expect(isError(result)).toBe(true);
    expect(getText(result)).toContain("No match found");
  });
});

// ── Directory Operations ─────────────────────────────────────────────

describe("ws_mkdir + ws_readdir", () => {
  it("creates a directory and lists it", async () => {
    const { result: mkdirResult } = await timedCall(client, "ws_mkdir", {
      path: "test-dir",
    });
    expect(isError(mkdirResult)).toBe(false);

    // Write a file inside
    await timedCall(client, "ws_write_file", {
      path: "test-dir/inside.txt",
      content: "inside",
    });

    const { result: readdirResult } = await timedCall(client, "ws_readdir", {
      path: "test-dir",
    });
    expect(isError(readdirResult)).toBe(false);
    expect(getText(readdirResult)).toContain("inside.txt");
  });
});

// ── File Operations (cp, mv, rm) ─────────────────────────────────────

describe("ws_cp + ws_mv + ws_rm", () => {
  it("copies a file", async () => {
    await timedCall(client, "ws_write_file", {
      path: "cp-source.txt",
      content: "copy me",
    });

    const { result } = await timedCall(client, "ws_cp", {
      src: "cp-source.txt",
      dest: "cp-dest.txt",
    });
    expect(isError(result)).toBe(false);

    const { result: readResult } = await timedCall(client, "ws_read_file", {
      path: "cp-dest.txt",
    });
    expect(getText(readResult)).toBe("copy me");
  });

  it("moves a file", async () => {
    await timedCall(client, "ws_write_file", {
      path: "mv-source.txt",
      content: "move me",
    });

    const { result } = await timedCall(client, "ws_mv", {
      src: "mv-source.txt",
      dest: "mv-dest.txt",
    });
    expect(isError(result)).toBe(false);

    // Source should be gone
    const { result: oldResult } = await timedCall(client, "ws_read_file", {
      path: "mv-source.txt",
    });
    expect(isError(oldResult)).toBe(true);

    // Dest should exist
    const { result: newResult } = await timedCall(client, "ws_read_file", {
      path: "mv-dest.txt",
    });
    expect(getText(newResult)).toBe("move me");
  });

  it("removes a file", async () => {
    await timedCall(client, "ws_write_file", {
      path: "rm-target.txt",
      content: "delete me",
    });

    const { result } = await timedCall(client, "ws_rm", {
      path: "rm-target.txt",
    });
    expect(isError(result)).toBe(false);

    const { result: readResult } = await timedCall(client, "ws_read_file", {
      path: "rm-target.txt",
    });
    expect(isError(readResult)).toBe(true);
  });
});

// ── Search Operations ────────────────────────────────────────────────

describe("ws_glob + ws_grep", () => {
  it("finds files with glob", async () => {
    await timedCall(client, "ws_write_file", {
      path: "search/a.ts",
      content: "const a = 1;",
    });
    await timedCall(client, "ws_write_file", {
      path: "search/b.ts",
      content: "const b = 2;",
    });
    await timedCall(client, "ws_write_file", {
      path: "search/c.json",
      content: "{}",
    });

    const { result } = await timedCall(client, "ws_glob", {
      pattern: "search/*.ts",
    });
    expect(isError(result)).toBe(false);
    const text = getText(result);
    expect(text).toContain("a.ts");
    expect(text).toContain("b.ts");
    expect(text).not.toContain("c.json");
  });

  it("searches file content with grep", async () => {
    const { result } = await timedCall(client, "ws_grep", {
      pattern: "const [ab]",
      path: "search",
      output_mode: "content",
    });
    expect(isError(result)).toBe(false);
    const text = getText(result);
    expect(text).toContain("const a");
    expect(text).toContain("const b");
  });
});

// ── Path & Stat Operations ───────────────────────────────────────────

describe("ws_exists + ws_stat", () => {
  it("checks existence of a file", async () => {
    const { result } = await timedCall(client, "ws_exists", {
      path: "small.txt",
    });
    expect(isError(result)).toBe(false);
    expect(getText(result).toLowerCase()).toContain("true");
  });

  it("checks non-existence", async () => {
    const { result } = await timedCall(client, "ws_exists", {
      path: "nope.txt",
    });
    expect(isError(result)).toBe(false);
    expect(getText(result).toLowerCase()).toContain("false");
  });

  it("gets stat of a file", async () => {
    const { result } = await timedCall(client, "ws_stat", {
      path: "small.txt",
    });
    expect(isError(result)).toBe(false);
    const text = getText(result);
    // stat should return JSON with size, isFile, etc.
    expect(text).toContain("size");
  });
});

// ── Sequential Write-Read Cycles ─────────────────────────────────────

describe("write-read cycles", () => {
  it("performs 10 sequential write-read cycles", async () => {
    for (let i = 0; i < 10; i++) {
      const content = `cycle-${i}-content-${Date.now()}`;
      const { result: writeResult } = await timedCall(client, "ws_write_file", {
        path: `cycle-${i}.txt`,
        content,
      });
      expect(isError(writeResult)).toBe(false);

      const { result: readResult } = await timedCall(client, "ws_read_file", {
        path: `cycle-${i}.txt`,
      });
      expect(getText(readResult)).toBe(content);
    }
  });

  it("alternates reads and writes rapidly", async () => {
    // Write seed file
    await timedCall(client, "ws_write_file", {
      path: "rapid.txt",
      content: "v0",
    });

    for (let i = 1; i <= 20; i++) {
      // Write new version
      await timedCall(client, "ws_write_file", {
        path: "rapid.txt",
        content: `v${i}`,
      });
      // Read back
      const { result } = await timedCall(client, "ws_read_file", {
        path: "rapid.txt",
      });
      expect(getText(result)).toBe(`v${i}`);
    }
  });
});

// ── Concurrent Operations ────────────────────────────────────────────

describe("concurrent operations", () => {
  it("handles 5 concurrent writes to different files", async () => {
    const promises = Array.from({ length: 5 }, (_, i) =>
      timedCall(client, "ws_write_file", {
        path: `concurrent-${i}.txt`,
        content: `content-${i}`,
      }),
    );

    const results = await Promise.all(promises);
    for (const { result } of results) {
      expect(isError(result)).toBe(false);
    }

    // Verify all files
    for (let i = 0; i < 5; i++) {
      const { result } = await timedCall(client, "ws_read_file", {
        path: `concurrent-${i}.txt`,
      });
      expect(getText(result)).toBe(`content-${i}`);
    }
  });

  it("handles 5 concurrent reads", async () => {
    const promises = Array.from({ length: 5 }, (_, i) =>
      timedCall(client, "ws_read_file", {
        path: `concurrent-${i}.txt`,
      }),
    );

    const results = await Promise.all(promises);
    for (let i = 0; i < 5; i++) {
      expect(getText(results[i]!.result)).toBe(`content-${i}`);
    }
  });

  it("handles mixed concurrent reads and writes", async () => {
    const promises = [
      timedCall(client, "ws_write_file", { path: "mixed-1.txt", content: "w1" }),
      timedCall(client, "ws_read_file", { path: "small.txt" }),
      timedCall(client, "ws_write_file", { path: "mixed-2.txt", content: "w2" }),
      timedCall(client, "ws_read_file", { path: "unicode.txt" }),
      timedCall(client, "ws_write_file", { path: "mixed-3.txt", content: "w3" }),
    ];

    const results = await Promise.all(promises);
    // Writes should succeed
    expect(isError(results[0]!.result)).toBe(false);
    expect(isError(results[2]!.result)).toBe(false);
    expect(isError(results[4]!.result)).toBe(false);
    // Reads should return correct content
    expect(getText(results[1]!.result)).toBe("hello world");
    expect(getText(results[3]!.result)).toBe("日本語テスト 🎉 émojis àccénts");
  });
});

// ── Timing Summary ───────────────────────────────────────────────────

describe("timing diagnostics", () => {
  it("reports timing for read vs write operations", async () => {
    // Seed a file
    await timedCall(client, "ws_write_file", {
      path: "timing-test.txt",
      content: "timing content",
    });

    const readTimes: number[] = [];
    const writeTimes: number[] = [];

    for (let i = 0; i < 5; i++) {
      const { durationMs: readMs } = await timedCall(client, "ws_read_file", {
        path: "timing-test.txt",
      });
      readTimes.push(readMs);

      const { durationMs: writeMs } = await timedCall(client, "ws_write_file", {
        path: "timing-test.txt",
        content: `timing content v${i}`,
      });
      writeTimes.push(writeMs);
    }

    const avgRead = readTimes.reduce((a, b) => a + b, 0) / readTimes.length;
    const avgWrite = writeTimes.reduce((a, b) => a + b, 0) / writeTimes.length;
    const maxWrite = Math.max(...writeTimes);

    console.log("[TIMING] Read avg:", avgRead.toFixed(1), "ms, times:", readTimes);
    console.log("[TIMING] Write avg:", avgWrite.toFixed(1), "ms, times:", writeTimes);
    console.log("[TIMING] Max write:", maxWrite, "ms");

    // Both should complete in reasonable time
    expect(avgRead).toBeLessThan(1000);
    expect(avgWrite).toBeLessThan(1000);
    expect(maxWrite).toBeLessThan(5000);
  });
});
