import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InMemoryFs } from "just-bash";
import { globWorkspace, grepWorkspace } from "../search-tools.ts";

/**
 * Creates a temporary workspace directory with the given files.
 * Returns the absolute path to the temp directory.
 */
async function createTempWorkspace(
  files: Record<string, string>,
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "ws-glob-test-"));
  for (const [path, content] of Object.entries(files)) {
    const fullPath = join(dir, path);
    await mkdir(join(fullPath, ".."), { recursive: true });
    await writeFile(fullPath, content);
  }
  return dir;
}

describe("globWorkspace (ws_glob core logic)", () => {
  let workspace: string;

  beforeAll(async () => {
    workspace = await createTempWorkspace({
      "index.ts": "export const a = 1;",
      "util.ts": "export const b = 2;",
      "readme.md": "# Hello",
      "src/app.ts": "console.log('app');",
      "src/lib/helpers.ts": "export function help() {}",
      "src/lib/data.json": '{"key": "value"}',
      "build/output.js": "var x = 1;",
    });

    // Set distinct modification times so sort order is deterministic
    const now = Date.now();
    await utimes(join(workspace, "index.ts"), new Date(now - 5000), new Date(now - 5000));
    await utimes(join(workspace, "util.ts"), new Date(now - 4000), new Date(now - 4000));
    await utimes(join(workspace, "src/app.ts"), new Date(now - 3000), new Date(now - 3000));
    await utimes(join(workspace, "src/lib/helpers.ts"), new Date(now - 2000), new Date(now - 2000));
    await utimes(join(workspace, "src/lib/data.json"), new Date(now - 1000), new Date(now - 1000));
    // readme.md and build/output.js keep their original mtime (most recent)
  });

  afterAll(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  it("matches *.ts files in root only", async () => {
    const result = await globWorkspace(workspace, "*.ts");
    expect(result.truncated).toBe(false);
    // Should only match root-level .ts files (not recursive)
    expect(result.files).toContain("index.ts");
    expect(result.files).toContain("util.ts");
    expect(result.files).not.toContain("src/app.ts");
  });

  it("matches **/*.ts files recursively", async () => {
    const result = await globWorkspace(workspace, "**/*.ts");
    expect(result.truncated).toBe(false);
    const tsFiles = result.files;
    expect(tsFiles).toContain("index.ts");
    expect(tsFiles).toContain("util.ts");
    expect(tsFiles).toContain("src/app.ts");
    expect(tsFiles).toContain("src/lib/helpers.ts");
    // Should not include non-ts files
    expect(tsFiles).not.toContain("readme.md");
    expect(tsFiles).not.toContain("src/lib/data.json");
  });

  it("returns empty array when no files match", async () => {
    const result = await globWorkspace(workspace, "*.xyz");
    expect(result.files).toEqual([]);
    expect(result.truncated).toBe(false);
  });

  it("sorts results by modification time (most recent first)", async () => {
    const result = await globWorkspace(workspace, "**/*.ts");
    const tsFiles = result.files;
    // helpers.ts (mtime-2s) should come before app.ts (mtime-3s)
    // and app.ts before util.ts (mtime-4s) etc.
    const helpersIdx = tsFiles.indexOf("src/lib/helpers.ts");
    const appIdx = tsFiles.indexOf("src/app.ts");
    const utilIdx = tsFiles.indexOf("util.ts");
    const indexIdx = tsFiles.indexOf("index.ts");
    expect(helpersIdx).toBeLessThan(appIdx);
    expect(appIdx).toBeLessThan(utilIdx);
    expect(utilIdx).toBeLessThan(indexIdx);
  });

  it("rejects patterns containing '..'", async () => {
    await expect(
      globWorkspace(workspace, "../**/*.ts"),
    ).rejects.toThrow("must not contain '..'");
  });

  it("strips leading / from pattern", async () => {
    const result = await globWorkspace(workspace, "/**/*.ts");
    // Should behave like **/*.ts after stripping leading /
    expect(result.files.length).toBeGreaterThan(0);
    expect(result.files).toContain("src/app.ts");
  });

  it("scopes to subdirectory when path parameter is given", async () => {
    const result = await globWorkspace(workspace, "**/*.ts", "src");
    // Should only find files within src/
    for (const f of result.files) {
      expect(f.startsWith("src/")).toBe(true);
    }
    expect(result.files).toContain("src/app.ts");
    expect(result.files).toContain("src/lib/helpers.ts");
    // Root-level files should NOT appear
    expect(result.files).not.toContain("index.ts");
    expect(result.files).not.toContain("util.ts");
  });

  it("returns relative paths (no absolute paths, no leading /)", async () => {
    const result = await globWorkspace(workspace, "**/*");
    for (const f of result.files) {
      expect(f.startsWith("/")).toBe(false);
      expect(f.includes(workspace)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// ws_grep tests
// ---------------------------------------------------------------------------

function createGrepFs(files: Record<string, string>): InMemoryFs {
  const entries: Record<string, string> = {};
  for (const [path, content] of Object.entries(files)) {
    entries[path.startsWith("/") ? path : `/${path}`] = content;
  }
  return new InMemoryFs(entries);
}

describe("grepWorkspace (ws_grep core logic)", () => {
  const testFiles: Record<string, string> = {
    "/src/app.ts": [
      "import { helper } from './lib';",
      "const msg = 'Hello World';",
      "console.log(msg);",
      "export default msg;",
    ].join("\n"),
    "/src/lib.ts": [
      "export function helper() {",
      "  return 'Hello Helper';",
      "}",
    ].join("\n"),
    "/src/data.json": '{"hello": "world"}',
    "/readme.md": "# Hello Project\n\nThis is a readme.",
    "/src/test.test.ts": [
      "import { helper } from './lib';",
      "test('says hello', () => {",
      "  expect(helper()).toBe('Hello Helper');",
      "});",
    ].join("\n"),
  };

  it("files_with_matches mode returns matching file paths", async () => {
    const fs = createGrepFs(testFiles);
    const result = await grepWorkspace(fs, "/", "Hello", {
      outputMode: "files_with_matches",
      headLimit: 100,
    });
    expect(result.files).toBeDefined();
    expect(result.files!.length).toBeGreaterThanOrEqual(2);
    // Should find Hello in at least app.ts, lib.ts, readme.md, test.test.ts
    expect(result.files).toContain("src/app.ts");
    expect(result.files).toContain("src/lib.ts");
  });

  it("content mode returns matching lines with line numbers", async () => {
    const fs = createGrepFs(testFiles);
    const result = await grepWorkspace(fs, "/", "Hello", {
      outputMode: "content",
      headLimit: 100,
      lineNumbers: true,
    });
    expect(result.matches).toBeDefined();
    expect(result.matches!.length).toBeGreaterThan(0);
    // Each match should have file, line, and content
    for (const match of result.matches!) {
      expect(match.file).toBeDefined();
      expect(match.line).toBeDefined();
      expect(match.content).toBeDefined();
      expect(match.line).toBeGreaterThan(0);
    }
  });

  it("content mode with context lines shows surrounding lines", async () => {
    const fs = createGrepFs(testFiles);
    const result = await grepWorkspace(fs, "/", "console\\.log", {
      outputMode: "content",
      headLimit: 100,
      lineNumbers: true,
      contextBefore: 1,
      contextAfter: 1,
    });
    expect(result.matches).toBeDefined();
    // console.log is on line 3 of app.ts; with context we should see line 2 and 4
    const appMatches = result.matches!.filter((m) => m.file === "src/app.ts");
    expect(appMatches.length).toBeGreaterThanOrEqual(3); // line 2 (context), line 3 (match), line 4 (context)
  });

  it("count mode returns match count per file", async () => {
    const fs = createGrepFs(testFiles);
    const result = await grepWorkspace(fs, "/", "Hello", {
      outputMode: "count",
      headLimit: 100,
    });
    expect(result.counts).toBeDefined();
    // app.ts has 1 Hello, lib.ts has 1, etc
    const appCount = result.counts!.find((c) => c.file === "src/app.ts");
    expect(appCount).toBeDefined();
    expect(appCount!.count).toBe(1);
  });

  it("returns empty result when pattern matches nothing", async () => {
    const fs = createGrepFs(testFiles);
    const result = await grepWorkspace(fs, "/", "ZZZZNOTFOUND", {
      outputMode: "files_with_matches",
      headLimit: 100,
    });
    expect(result.files).toEqual([]);
  });

  it("case insensitive search matches regardless of case", async () => {
    const fs = createGrepFs(testFiles);
    const result = await grepWorkspace(fs, "/", "hello", {
      outputMode: "files_with_matches",
      headLimit: 100,
      caseInsensitive: true,
    });
    // "hello" should match "Hello" in app.ts, lib.ts, etc. and "hello" in data.json
    expect(result.files!.length).toBeGreaterThanOrEqual(3);
  });

  it("file type filter restricts to matching extensions", async () => {
    const fs = createGrepFs(testFiles);
    const result = await grepWorkspace(fs, "/", "Hello", {
      outputMode: "files_with_matches",
      headLimit: 100,
      type: "ts",
    });
    // Should only find .ts files, not .md or .json
    for (const f of result.files!) {
      expect(f.endsWith(".ts")).toBe(true);
    }
    expect(result.files).not.toContain("readme.md");
    expect(result.files).not.toContain("src/data.json");
  });

  it("glob filter restricts to matching file names", async () => {
    const fs = createGrepFs(testFiles);
    const result = await grepWorkspace(fs, "/", "Hello", {
      outputMode: "files_with_matches",
      headLimit: 100,
      glob: "*.test.ts",
    });
    // Only test.test.ts matches the glob
    expect(result.files!.length).toBe(1);
    expect(result.files).toContain("src/test.test.ts");
  });

  it("head_limit stops after specified number of results", async () => {
    const fs = createGrepFs(testFiles);
    const result = await grepWorkspace(fs, "/", "Hello", {
      outputMode: "files_with_matches",
      headLimit: 2,
    });
    expect(result.files!.length).toBeLessThanOrEqual(2);
    expect(result.truncated).toBe(true);
  });

  it("enforces default limit of 100", async () => {
    // Create a filesystem with many files containing "match"
    const manyFiles: Record<string, string> = {};
    for (let i = 0; i < 110; i++) {
      manyFiles[`/file${String(i).padStart(3, "0")}.ts`] = `match line ${i}`;
    }
    const fs = new InMemoryFs(manyFiles);
    const result = await grepWorkspace(fs, "/", "match", {
      outputMode: "files_with_matches",
      headLimit: 100,
    });
    expect(result.files!.length).toBeLessThanOrEqual(100);
    expect(result.truncated).toBe(true);
  });

  it("skips binary files silently", async () => {
    const fs = new InMemoryFs({
      "/text.ts": "Hello from text",
      "/binary.bin": "Hello\0binary\0data",
    });
    const result = await grepWorkspace(fs, "/", "Hello", {
      outputMode: "files_with_matches",
      headLimit: 100,
    });
    expect(result.files).toContain("text.ts");
    expect(result.files).not.toContain("binary.bin");
  });

  it("searches only specific file when path points to a file", async () => {
    const fs = createGrepFs(testFiles);
    const result = await grepWorkspace(fs, "/", "Hello", {
      outputMode: "files_with_matches",
      headLimit: 100,
      path: "src/app.ts",
    });
    expect(result.files!.length).toBe(1);
    expect(result.files).toContain("src/app.ts");
  });

  it("searches recursively within directory when path points to a directory", async () => {
    const fs = createGrepFs(testFiles);
    const result = await grepWorkspace(fs, "/", "Hello", {
      outputMode: "files_with_matches",
      headLimit: 100,
      path: "src",
    });
    // Should find in src/ subdirectory files only, not readme.md
    for (const f of result.files!) {
      expect(f.startsWith("src/")).toBe(true);
    }
    expect(result.files).not.toContain("readme.md");
  });

  it("sanitizes path with ../ safely", async () => {
    const fs = createGrepFs(testFiles);
    // Path traversal should be caught
    await expect(
      grepWorkspace(fs, "/", "Hello", {
        outputMode: "files_with_matches",
        headLimit: 100,
        path: "../etc/passwd",
      }),
    ).rejects.toThrow("escapes workspace root");
  });

  it("returns error for invalid regex pattern", async () => {
    const fs = createGrepFs(testFiles);
    await expect(
      grepWorkspace(fs, "/", "[invalid(", {
        outputMode: "files_with_matches",
        headLimit: 100,
      }),
    ).rejects.toThrow("Invalid regex");
  });
});
