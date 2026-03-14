import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WorkspaceManager } from "../workspace/manager.ts";
import { toMcpError } from "../util/errors.ts";
import { withLogging } from "../util/logger.ts";
import {
  pathSchema,
  recursiveSchema,
  workspaceIdSchema,
} from "../util/schemas.ts";

export function registerDirTools(
  server: McpServer,
  manager: WorkspaceManager,
): void {
  const registerTool = server.registerTool.bind(server) as any;
  registerTool(
    "ws_mkdir",
    {
      title: "Create Directory",
      description:
        "Create a directory in the workspace. Use recursive to create parent directories as needed.",
      inputSchema: {
        workspace_id: workspaceIdSchema,
        path: pathSchema,
        recursive: recursiveSchema,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    withLogging("ws_mkdir", async ({ workspace_id, path, recursive }: any) => {
      try {
        const fs = manager.getFs(workspace_id);
        await fs.mkdir(path, recursive ? { recursive } : undefined);
        return {
          content: [{ type: "text", text: `Directory created: ${path}` }],
        };
      } catch (err) {
        return toMcpError(err);
      }
    }),
  );

  registerTool(
    "ws_readdir",
    {
      title: "List Directory",
      description:
        "List the names of entries (files and directories) in a directory. Returns an array of names, not full paths.",
      inputSchema: {
        workspace_id: workspaceIdSchema,
        path: pathSchema,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    withLogging("ws_readdir", async ({ workspace_id, path }: any) => {
      try {
        const fs = manager.getFs(workspace_id);
        const entries = await fs.readdir(path);
        return {
          content: [
            { type: "text", text: JSON.stringify(entries, null, 2) },
          ],
        };
      } catch (err) {
        return toMcpError(err);
      }
    }),
  );

  registerTool(
    "ws_readdir_with_types",
    {
      title: "List Directory with Types",
      description:
        "List directory entries with type information (isFile, isDirectory, isSymbolicLink). More efficient than readdir + stat for each entry.",
      inputSchema: {
        workspace_id: workspaceIdSchema,
        path: pathSchema,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    withLogging("ws_readdir_with_types", async ({ workspace_id, path }: any) => {
      try {
        const fs = manager.getFs(workspace_id);
        if (fs.readdirWithFileTypes) {
          const entries = await fs.readdirWithFileTypes(path);
          return {
            content: [
              { type: "text", text: JSON.stringify(entries, null, 2) },
            ],
          };
        }
        // Fallback: readdir + stat
        const names = await fs.readdir(path);
        const entries = await Promise.all(
          names.map(async (name) => {
            const entryPath = fs.resolvePath(path, name);
            const stat = await fs.lstat(entryPath);
            return {
              name,
              isFile: stat.isFile,
              isDirectory: stat.isDirectory,
              isSymbolicLink: stat.isSymbolicLink,
            };
          }),
        );
        return {
          content: [
            { type: "text", text: JSON.stringify(entries, null, 2) },
          ],
        };
      } catch (err) {
        return toMcpError(err);
      }
    }),
  );
}
