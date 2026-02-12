import { beforeEach, describe, expect, it } from "bun:test";
import { RemoteWorkspaceFS } from "./remote-workspace-fs.ts";
import type { McpToolCaller } from "./remote-workspace-fs.ts";

// ---------------------------------------------------------------------------
// Mock McpToolCaller
// ---------------------------------------------------------------------------

interface RecordedCall {
  name: string;
  arguments?: Record<string, unknown>;
}

function createMockCaller(
  response: { text: string; isError?: boolean } = { text: "" },
): { caller: McpToolCaller; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const caller: McpToolCaller = {
    async callTool(params) {
      calls.push({
        name: params.name,
        arguments: params.arguments,
      });
      return {
        content: [{ type: "text", text: response.text }],
        isError: response.isError,
      };
    },
  };
  return { caller, calls };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RemoteWorkspaceFS", () => {
  describe("constructor and call helper", () => {
    it("includes workspace_id when provided", async () => {
      const { caller, calls } = createMockCaller({ text: '{"exists":true}' });
      const fs = new RemoteWorkspaceFS(caller, "my-ws");
      await fs.exists("/test");
      expect(calls[0]!.arguments).toEqual({
        workspace_id: "my-ws",
        path: "/test",
      });
    });

    it("omits workspace_id when not provided", async () => {
      const { caller, calls } = createMockCaller({ text: '{"exists":true}' });
      const fs = new RemoteWorkspaceFS(caller);
      await fs.exists("/test");
      expect(calls[0]!.arguments).toEqual({ path: "/test" });
      expect(calls[0]!.arguments).not.toHaveProperty("workspace_id");
    });
  });

  describe("error handling", () => {
    it("throws on isError response", async () => {
      const { caller } = createMockCaller({
        text: "Error: File not found: /nope",
        isError: true,
      });
      const fs = new RemoteWorkspaceFS(caller);
      await expect(fs.readFile("/nope")).rejects.toThrow(
        "Error: File not found: /nope",
      );
    });
  });

  describe("readFile", () => {
    it("calls ws_read_file and returns text", async () => {
      const { caller, calls } = createMockCaller({ text: "hello world" });
      const fs = new RemoteWorkspaceFS(caller, "ws1");
      const result = await fs.readFile("/file.txt");
      expect(result).toBe("hello world");
      expect(calls[0]!.name).toBe("ws_read_file");
      expect(calls[0]!.arguments).toEqual({
        workspace_id: "ws1",
        path: "/file.txt",
      });
    });

    it("passes encoding as string option", async () => {
      const { caller, calls } = createMockCaller({ text: "data" });
      const fs = new RemoteWorkspaceFS(caller, "ws1");
      await fs.readFile("/file.txt", "utf8");
      expect(calls[0]!.arguments).toEqual({
        workspace_id: "ws1",
        path: "/file.txt",
        encoding: "utf8",
      });
    });

    it("passes encoding from options object", async () => {
      const { caller, calls } = createMockCaller({ text: "data" });
      const fs = new RemoteWorkspaceFS(caller, "ws1");
      await fs.readFile("/file.txt", { encoding: "ascii" });
      expect(calls[0]!.arguments).toEqual({
        workspace_id: "ws1",
        path: "/file.txt",
        encoding: "ascii",
      });
    });
  });

  describe("readFileBuffer", () => {
    it("calls ws_read_file_buffer and decodes base64", async () => {
      const original = new Uint8Array([0x00, 0x01, 0x02, 0xff]);
      const b64 = Buffer.from(original).toString("base64");
      const { caller, calls } = createMockCaller({ text: b64 });
      const fs = new RemoteWorkspaceFS(caller, "ws1");
      const result = await fs.readFileBuffer("/binary.bin");
      expect(result).toBeInstanceOf(Uint8Array);
      expect(Array.from(result)).toEqual(Array.from(original));
      expect(calls[0]!.name).toBe("ws_read_file_buffer");
    });
  });

  describe("writeFile", () => {
    it("calls ws_write_file with string content", async () => {
      const { caller, calls } = createMockCaller({ text: "Written to /f" });
      const fs = new RemoteWorkspaceFS(caller, "ws1");
      await fs.writeFile("/f", "content");
      expect(calls[0]!.name).toBe("ws_write_file");
      expect(calls[0]!.arguments).toEqual({
        workspace_id: "ws1",
        path: "/f",
        content: "content",
      });
    });

    it("base64-encodes Uint8Array content", async () => {
      const data = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
      const { caller, calls } = createMockCaller({ text: "Written to /f" });
      const fs = new RemoteWorkspaceFS(caller, "ws1");
      await fs.writeFile("/f", data);
      expect(calls[0]!.arguments).toEqual({
        workspace_id: "ws1",
        path: "/f",
        content: Buffer.from(data).toString("base64"),
        encoding: "base64",
      });
    });

    it("passes encoding option for string content", async () => {
      const { caller, calls } = createMockCaller({ text: "Written to /f" });
      const fs = new RemoteWorkspaceFS(caller, "ws1");
      await fs.writeFile("/f", "data", "latin1");
      expect(calls[0]!.arguments).toEqual({
        workspace_id: "ws1",
        path: "/f",
        content: "data",
        encoding: "latin1",
      });
    });
  });

  describe("appendFile", () => {
    it("calls ws_append_file with string content", async () => {
      const { caller, calls } = createMockCaller({ text: "Appended to /f" });
      const fs = new RemoteWorkspaceFS(caller, "ws1");
      await fs.appendFile("/f", "more");
      expect(calls[0]!.name).toBe("ws_append_file");
      expect(calls[0]!.arguments).toEqual({
        workspace_id: "ws1",
        path: "/f",
        content: "more",
      });
    });

    it("base64-encodes Uint8Array content", async () => {
      const data = new Uint8Array([0x01, 0x02]);
      const { caller, calls } = createMockCaller({ text: "Appended to /f" });
      const fs = new RemoteWorkspaceFS(caller, "ws1");
      await fs.appendFile("/f", data);
      expect(calls[0]!.arguments).toEqual({
        workspace_id: "ws1",
        path: "/f",
        content: Buffer.from(data).toString("base64"),
        encoding: "base64",
      });
    });
  });

  describe("exists", () => {
    it("returns true when file exists", async () => {
      const { caller } = createMockCaller({ text: '{"exists":true}' });
      const fs = new RemoteWorkspaceFS(caller);
      expect(await fs.exists("/yes")).toBe(true);
    });

    it("returns false when file does not exist", async () => {
      const { caller } = createMockCaller({ text: '{"exists":false}' });
      const fs = new RemoteWorkspaceFS(caller);
      expect(await fs.exists("/no")).toBe(false);
    });
  });

  describe("stat", () => {
    it("parses stat response with mtime as Date", async () => {
      const statJson = JSON.stringify({
        isFile: true,
        isDirectory: false,
        isSymbolicLink: false,
        mode: 0o644,
        size: 1024,
        mtime: "2025-06-15T10:30:00.000Z",
      });
      const { caller, calls } = createMockCaller({ text: statJson });
      const fs = new RemoteWorkspaceFS(caller, "ws1");
      const result = await fs.stat("/file.txt");
      expect(calls[0]!.name).toBe("ws_stat");
      expect(result.isFile).toBe(true);
      expect(result.isDirectory).toBe(false);
      expect(result.isSymbolicLink).toBe(false);
      expect(result.mode).toBe(0o644);
      expect(result.size).toBe(1024);
      expect(result.mtime).toBeInstanceOf(Date);
      expect(result.mtime.toISOString()).toBe("2025-06-15T10:30:00.000Z");
    });
  });

  describe("lstat", () => {
    it("parses lstat response with mtime as Date", async () => {
      const statJson = JSON.stringify({
        isFile: false,
        isDirectory: false,
        isSymbolicLink: true,
        mode: 0o777,
        size: 10,
        mtime: "2025-01-01T00:00:00.000Z",
      });
      const { caller, calls } = createMockCaller({ text: statJson });
      const fs = new RemoteWorkspaceFS(caller, "ws1");
      const result = await fs.lstat("/link");
      expect(calls[0]!.name).toBe("ws_lstat");
      expect(result.isSymbolicLink).toBe(true);
      expect(result.mtime).toBeInstanceOf(Date);
    });
  });

  describe("mkdir", () => {
    it("calls ws_mkdir", async () => {
      const { caller, calls } = createMockCaller({ text: "Directory created: /d" });
      const fs = new RemoteWorkspaceFS(caller, "ws1");
      await fs.mkdir("/d");
      expect(calls[0]!.name).toBe("ws_mkdir");
      expect(calls[0]!.arguments).toEqual({
        workspace_id: "ws1",
        path: "/d",
      });
    });

    it("passes recursive option", async () => {
      const { caller, calls } = createMockCaller({ text: "Directory created: /a/b/c" });
      const fs = new RemoteWorkspaceFS(caller, "ws1");
      await fs.mkdir("/a/b/c", { recursive: true });
      expect(calls[0]!.arguments).toEqual({
        workspace_id: "ws1",
        path: "/a/b/c",
        recursive: true,
      });
    });
  });

  describe("readdir", () => {
    it("parses JSON array of strings", async () => {
      const { caller, calls } = createMockCaller({
        text: '["file1.txt","file2.txt","dir1"]',
      });
      const fs = new RemoteWorkspaceFS(caller, "ws1");
      const result = await fs.readdir("/home");
      expect(calls[0]!.name).toBe("ws_readdir");
      expect(result).toEqual(["file1.txt", "file2.txt", "dir1"]);
    });
  });

  describe("readdirWithFileTypes", () => {
    it("parses JSON array of DirentEntry objects", async () => {
      const entries = [
        { name: "file.txt", isFile: true, isDirectory: false, isSymbolicLink: false },
        { name: "subdir", isFile: false, isDirectory: true, isSymbolicLink: false },
      ];
      const { caller, calls } = createMockCaller({ text: JSON.stringify(entries) });
      const fs = new RemoteWorkspaceFS(caller, "ws1");
      const result = await fs.readdirWithFileTypes("/home");
      expect(calls[0]!.name).toBe("ws_readdir_with_types");
      expect(result).toEqual(entries);
    });
  });

  describe("rm", () => {
    it("calls ws_rm with options", async () => {
      const { caller, calls } = createMockCaller({ text: "Removed: /d" });
      const fs = new RemoteWorkspaceFS(caller, "ws1");
      await fs.rm("/d", { recursive: true, force: true });
      expect(calls[0]!.name).toBe("ws_rm");
      expect(calls[0]!.arguments).toEqual({
        workspace_id: "ws1",
        path: "/d",
        recursive: true,
        force: true,
      });
    });
  });

  describe("cp", () => {
    it("calls ws_cp with options", async () => {
      const { caller, calls } = createMockCaller({ text: "Copied /a to /b" });
      const fs = new RemoteWorkspaceFS(caller, "ws1");
      await fs.cp("/a", "/b", { recursive: true });
      expect(calls[0]!.name).toBe("ws_cp");
      expect(calls[0]!.arguments).toEqual({
        workspace_id: "ws1",
        src: "/a",
        dest: "/b",
        recursive: true,
      });
    });
  });

  describe("mv", () => {
    it("calls ws_mv", async () => {
      const { caller, calls } = createMockCaller({ text: "Moved /a to /b" });
      const fs = new RemoteWorkspaceFS(caller, "ws1");
      await fs.mv("/a", "/b");
      expect(calls[0]!.name).toBe("ws_mv");
      expect(calls[0]!.arguments).toEqual({
        workspace_id: "ws1",
        src: "/a",
        dest: "/b",
      });
    });
  });

  describe("chmod", () => {
    it("calls ws_chmod", async () => {
      const { caller, calls } = createMockCaller({ text: "Changed permissions" });
      const fs = new RemoteWorkspaceFS(caller, "ws1");
      await fs.chmod("/f", 0o755);
      expect(calls[0]!.name).toBe("ws_chmod");
      expect(calls[0]!.arguments).toEqual({
        workspace_id: "ws1",
        path: "/f",
        mode: 0o755,
      });
    });
  });

  describe("utimes", () => {
    it("calls ws_utimes with ISO strings", async () => {
      const { caller, calls } = createMockCaller({ text: "Updated timestamps" });
      const fs = new RemoteWorkspaceFS(caller, "ws1");
      const atime = new Date("2025-06-01T00:00:00.000Z");
      const mtime = new Date("2025-06-15T12:00:00.000Z");
      await fs.utimes("/f", atime, mtime);
      expect(calls[0]!.name).toBe("ws_utimes");
      expect(calls[0]!.arguments).toEqual({
        workspace_id: "ws1",
        path: "/f",
        atime: "2025-06-01T00:00:00.000Z",
        mtime: "2025-06-15T12:00:00.000Z",
      });
    });
  });

  describe("symlink", () => {
    it("calls ws_symlink with target and link_path", async () => {
      const { caller, calls } = createMockCaller({ text: "Symlink created" });
      const fs = new RemoteWorkspaceFS(caller, "ws1");
      await fs.symlink("/target", "/link");
      expect(calls[0]!.name).toBe("ws_symlink");
      expect(calls[0]!.arguments).toEqual({
        workspace_id: "ws1",
        target: "/target",
        link_path: "/link",
      });
    });
  });

  describe("link", () => {
    it("calls ws_link with existing_path and new_path", async () => {
      const { caller, calls } = createMockCaller({ text: "Hard link created" });
      const fs = new RemoteWorkspaceFS(caller, "ws1");
      await fs.link("/existing", "/new");
      expect(calls[0]!.name).toBe("ws_link");
      expect(calls[0]!.arguments).toEqual({
        workspace_id: "ws1",
        existing_path: "/existing",
        new_path: "/new",
      });
    });
  });

  describe("readlink", () => {
    it("calls ws_readlink and returns text", async () => {
      const { caller, calls } = createMockCaller({ text: "/real/target" });
      const fs = new RemoteWorkspaceFS(caller, "ws1");
      const result = await fs.readlink("/link");
      expect(calls[0]!.name).toBe("ws_readlink");
      expect(result).toBe("/real/target");
    });
  });

  describe("realpath", () => {
    it("calls ws_realpath and returns text", async () => {
      const { caller, calls } = createMockCaller({ text: "/canonical/path" });
      const fs = new RemoteWorkspaceFS(caller, "ws1");
      const result = await fs.realpath("/some/link/../path");
      expect(calls[0]!.name).toBe("ws_realpath");
      expect(result).toBe("/canonical/path");
    });
  });

  describe("resolvePath", () => {
    it("resolves paths locally without MCP call", () => {
      const { caller, calls } = createMockCaller();
      const fs = new RemoteWorkspaceFS(caller);
      const result = fs.resolvePath("/base/dir", "sub/file.txt");
      expect(result).toBe("/base/dir/sub/file.txt");
      expect(calls).toHaveLength(0);
    });

    it("resolves absolute path arg", () => {
      const { caller, calls } = createMockCaller();
      const fs = new RemoteWorkspaceFS(caller);
      const result = fs.resolvePath("/base", "/absolute/path");
      expect(result).toBe("/absolute/path");
      expect(calls).toHaveLength(0);
    });

    it("resolves parent references", () => {
      const { caller } = createMockCaller();
      const fs = new RemoteWorkspaceFS(caller);
      const result = fs.resolvePath("/base/dir", "../sibling");
      expect(result).toBe("/base/sibling");
    });
  });

  describe("getAllPaths / refreshAllPaths", () => {
    it("returns empty array initially", () => {
      const { caller } = createMockCaller();
      const fs = new RemoteWorkspaceFS(caller);
      expect(fs.getAllPaths()).toEqual([]);
    });

    it("returns populated array after refreshAllPaths", async () => {
      const paths = ["/a.txt", "/b/c.txt", "/d"];
      const { caller, calls } = createMockCaller({
        text: JSON.stringify(paths),
      });
      const fs = new RemoteWorkspaceFS(caller, "ws1");
      const result = await fs.refreshAllPaths();
      expect(calls[0]!.name).toBe("ws_get_all_paths");
      expect(result).toEqual(paths);
      expect(fs.getAllPaths()).toEqual(paths);
    });

    it("updates cache on subsequent refreshAllPaths calls", async () => {
      let responseText = '["first"]';
      const caller: McpToolCaller = {
        async callTool() {
          return {
            content: [{ type: "text", text: responseText }],
          };
        },
      };
      const fs = new RemoteWorkspaceFS(caller, "ws1");

      await fs.refreshAllPaths();
      expect(fs.getAllPaths()).toEqual(["first"]);

      responseText = '["second","third"]';
      await fs.refreshAllPaths();
      expect(fs.getAllPaths()).toEqual(["second", "third"]);
    });
  });

  describe("base64 round-trip", () => {
    it("readFileBuffer decodes what writeFile would encode", async () => {
      const original = new Uint8Array([0, 1, 2, 128, 255]);
      let capturedContent: string | undefined;

      const caller: McpToolCaller = {
        async callTool(params) {
          if (params.name === "ws_write_file") {
            capturedContent = params.arguments?.content as string;
            return { content: [{ type: "text", text: "Written" }] };
          }
          // For readFileBuffer, return whatever was captured
          return {
            content: [{ type: "text", text: capturedContent ?? "" }],
          };
        },
      };

      const fs = new RemoteWorkspaceFS(caller, "ws1");
      await fs.writeFile("/binary", original);
      const result = await fs.readFileBuffer("/binary");
      expect(Array.from(result)).toEqual(Array.from(original));
    });
  });
});
