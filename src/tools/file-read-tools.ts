import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WorkspaceManager } from "../workspace/manager.ts";
import { toMcpError } from "../util/errors.ts";
import {
  encodingSchema,
  pathSchema,
  workspaceIdSchema,
} from "../util/schemas.ts";

export function registerFileReadTools(
  server: McpServer,
  manager: WorkspaceManager,
): void {
  const registerTool = server.registerTool.bind(server) as any;
  registerTool(
    "ws_read_file",
    {
      title: "Read File",
      description:
        "Read the contents of a file as a string from a workspace. Uses utf8 encoding by default.",
      inputSchema: {
        workspace_id: workspaceIdSchema,
        path: pathSchema,
        encoding: encodingSchema,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ workspace_id, path, encoding }: any) => {
      try {
        const fs = manager.getFs(workspace_id);
        const content = await fs.readFile(
          path,
          encoding ? { encoding } : undefined,
        );
        return { content: [{ type: "text", text: content }] };
      } catch (err) {
        return toMcpError(err);
      }
    },
  );

  registerTool(
    "ws_read_file_buffer",
    {
      title: "Read File Buffer",
      description:
        "Read file contents as binary data, returned as a base64-encoded string. Use this for non-text files.",
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
    async ({ workspace_id, path }: any) => {
      try {
        const fs = manager.getFs(workspace_id);
        const buffer = await fs.readFileBuffer(path);
        const base64 = Buffer.from(buffer).toString("base64");
        return {
          content: [
            {
              type: "text",
              text: base64,
            },
          ],
        };
      } catch (err) {
        return toMcpError(err);
      }
    },
  );

  registerTool(
    "ws_exists",
    {
      title: "Check Path Exists",
      description:
        "Check if a file or directory exists at the given path in the workspace.",
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
    async ({ workspace_id, path }: any) => {
      try {
        const fs = manager.getFs(workspace_id);
        const exists = await fs.exists(path);
        return {
          content: [{ type: "text", text: JSON.stringify({ exists }) }],
        };
      } catch (err) {
        return toMcpError(err);
      }
    },
  );

  registerTool(
    "ws_stat",
    {
      title: "File Stat",
      description:
        "Get file or directory metadata (size, type, permissions, modification time). Follows symlinks.",
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
    async ({ workspace_id, path }: any) => {
      try {
        const fs = manager.getFs(workspace_id);
        const stat = await fs.stat(path);
        return {
          content: [{ type: "text", text: JSON.stringify(stat, null, 2) }],
        };
      } catch (err) {
        return toMcpError(err);
      }
    },
  );

  registerTool(
    "ws_lstat",
    {
      title: "File Lstat",
      description:
        "Get file or directory metadata without following symlinks. For symlinks, returns info about the link itself.",
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
    async ({ workspace_id, path }: any) => {
      try {
        const fs = manager.getFs(workspace_id);
        const stat = await fs.lstat(path);
        return {
          content: [{ type: "text", text: JSON.stringify(stat, null, 2) }],
        };
      } catch (err) {
        return toMcpError(err);
      }
    },
  );
}
