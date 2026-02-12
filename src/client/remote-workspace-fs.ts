import * as posix from "node:path/posix";
import type {
  BufferEncoding,
  CpOptions,
  FileContent,
  FsStat,
  IFileSystem,
  MkdirOptions,
  RmOptions,
} from "just-bash";

// These types exist in just-bash's fs/interface but are not re-exported
// from the main entry point. Define them locally to avoid fragile subpath imports.
interface ReadFileOptions {
  encoding?: BufferEncoding | null;
}

interface WriteFileOptions {
  encoding?: BufferEncoding;
}

interface DirentEntry {
  name: string;
  isFile: boolean;
  isDirectory: boolean;
  isSymbolicLink: boolean;
}

/**
 * Minimal interface matching the MCP SDK Client's callTool method.
 * Using an interface instead of the concrete class makes RemoteWorkspaceFS
 * testable with simple mocks and avoids coupling to SDK internals.
 */
export interface McpToolCaller {
  callTool(
    params: { name: string; arguments?: Record<string, unknown> },
    resultSchema?: unknown,
    options?: unknown,
  ): Promise<{
    content: { type: string; text?: string; [key: string]: unknown }[];
    isError?: boolean;
    [key: string]: unknown;
  }>;
}

/**
 * An IFileSystem implementation that delegates every operation to a remote
 * workspace-mcp server via an MCP client's callTool method.
 */
export class RemoteWorkspaceFS implements IFileSystem {
  private cachedPaths: string[] = [];

  constructor(
    private readonly client: McpToolCaller,
    private readonly workspaceId?: string,
  ) {}

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private async call(
    toolName: string,
    args: Record<string, unknown> = {},
  ): Promise<string> {
    const toolArgs: Record<string, unknown> = { ...args };
    if (this.workspaceId !== undefined) {
      toolArgs.workspace_id = this.workspaceId;
    }

    const result = await this.client.callTool({
      name: toolName,
      arguments: toolArgs,
    });

    const textItem = result.content.find((c) => c.type === "text");
    const text = textItem?.text ?? "";

    if (result.isError) {
      throw new Error(text);
    }

    return text;
  }

  private parseStat(text: string): FsStat {
    const raw = JSON.parse(text) as {
      isFile: boolean;
      isDirectory: boolean;
      isSymbolicLink: boolean;
      mode: number;
      size: number;
      mtime: string;
    };
    return {
      isFile: raw.isFile,
      isDirectory: raw.isDirectory,
      isSymbolicLink: raw.isSymbolicLink,
      mode: raw.mode,
      size: raw.size,
      mtime: new Date(raw.mtime),
    };
  }

  // ---------------------------------------------------------------------------
  // IFileSystem implementation
  // ---------------------------------------------------------------------------

  async readFile(
    path: string,
    options?: ReadFileOptions | BufferEncoding,
  ): Promise<string> {
    const args: Record<string, unknown> = { path };
    if (typeof options === "string") {
      args.encoding = options;
    } else if (options?.encoding) {
      args.encoding = options.encoding;
    }
    return this.call("ws_read_file", args);
  }

  async readFileBuffer(path: string): Promise<Uint8Array> {
    const text = await this.call("ws_read_file_buffer", { path });
    return new Uint8Array(Buffer.from(text, "base64"));
  }

  async writeFile(
    path: string,
    content: FileContent,
    options?: WriteFileOptions | BufferEncoding,
  ): Promise<void> {
    const args: Record<string, unknown> = { path };
    if (content instanceof Uint8Array) {
      args.content = Buffer.from(content).toString("base64");
      args.encoding = "base64";
    } else {
      args.content = content;
      if (typeof options === "string") {
        args.encoding = options;
      } else if (options?.encoding) {
        args.encoding = options.encoding;
      }
    }
    await this.call("ws_write_file", args);
  }

  async appendFile(
    path: string,
    content: FileContent,
    options?: WriteFileOptions | BufferEncoding,
  ): Promise<void> {
    const args: Record<string, unknown> = { path };
    if (content instanceof Uint8Array) {
      args.content = Buffer.from(content).toString("base64");
      args.encoding = "base64";
    } else {
      args.content = content;
      if (typeof options === "string") {
        args.encoding = options;
      } else if (options?.encoding) {
        args.encoding = options.encoding;
      }
    }
    await this.call("ws_append_file", args);
  }

  async exists(path: string): Promise<boolean> {
    const text = await this.call("ws_exists", { path });
    return (JSON.parse(text) as { exists: boolean }).exists;
  }

  async stat(path: string): Promise<FsStat> {
    const text = await this.call("ws_stat", { path });
    return this.parseStat(text);
  }

  async lstat(path: string): Promise<FsStat> {
    const text = await this.call("ws_lstat", { path });
    return this.parseStat(text);
  }

  async mkdir(path: string, options?: MkdirOptions): Promise<void> {
    const args: Record<string, unknown> = { path };
    if (options?.recursive !== undefined) {
      args.recursive = options.recursive;
    }
    await this.call("ws_mkdir", args);
  }

  async readdir(path: string): Promise<string[]> {
    const text = await this.call("ws_readdir", { path });
    return JSON.parse(text) as string[];
  }

  async readdirWithFileTypes(path: string): Promise<DirentEntry[]> {
    const text = await this.call("ws_readdir_with_types", { path });
    return JSON.parse(text) as DirentEntry[];
  }

  async rm(path: string, options?: RmOptions): Promise<void> {
    const args: Record<string, unknown> = { path };
    if (options?.recursive !== undefined) {
      args.recursive = options.recursive;
    }
    if (options?.force !== undefined) {
      args.force = options.force;
    }
    await this.call("ws_rm", args);
  }

  async cp(src: string, dest: string, options?: CpOptions): Promise<void> {
    const args: Record<string, unknown> = { src, dest };
    if (options?.recursive !== undefined) {
      args.recursive = options.recursive;
    }
    await this.call("ws_cp", args);
  }

  async mv(src: string, dest: string): Promise<void> {
    await this.call("ws_mv", { src, dest });
  }

  async chmod(path: string, mode: number): Promise<void> {
    await this.call("ws_chmod", { path, mode });
  }

  async utimes(path: string, atime: Date, mtime: Date): Promise<void> {
    await this.call("ws_utimes", {
      path,
      atime: atime.toISOString(),
      mtime: mtime.toISOString(),
    });
  }

  async symlink(target: string, linkPath: string): Promise<void> {
    await this.call("ws_symlink", { target, link_path: linkPath });
  }

  async link(existingPath: string, newPath: string): Promise<void> {
    await this.call("ws_link", { existing_path: existingPath, new_path: newPath });
  }

  async readlink(path: string): Promise<string> {
    return this.call("ws_readlink", { path });
  }

  async realpath(path: string): Promise<string> {
    return this.call("ws_realpath", { path });
  }

  resolvePath(base: string, pathArg: string): string {
    return posix.resolve(base, pathArg);
  }

  getAllPaths(): string[] {
    return this.cachedPaths;
  }

  /**
   * Fetches all paths from the remote workspace and updates the local cache.
   * Call this before getAllPaths() if you need current data.
   */
  async refreshAllPaths(): Promise<string[]> {
    const text = await this.call("ws_get_all_paths");
    this.cachedPaths = JSON.parse(text) as string[];
    return this.cachedPaths;
  }
}
