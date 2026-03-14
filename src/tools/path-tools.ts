import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WorkspaceManager } from "../workspace/manager.ts";
import { toMcpError } from "../util/errors.ts";
import { withLogging } from "../util/logger.ts";
import { pathSchema, workspaceIdSchema } from "../util/schemas.ts";

export function registerPathTools(
  server: McpServer,
  manager: WorkspaceManager,
): void {
  const registerTool = server.registerTool.bind(server) as any;
  registerTool(
    "ws_resolve_path",
    {
      title: "Resolve Path",
      description:
        "Resolve a relative path against a base path within the workspace. Returns the resolved absolute path.",
      inputSchema: {
        workspace_id: workspaceIdSchema,
        base: z.string().min(1).describe("Base path to resolve against"),
        path: z.string().min(1).describe("Relative path to resolve"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    withLogging("ws_resolve_path", async ({ workspace_id, base, path }: any) => {
      try {
        const fs = manager.getFs(workspace_id);
        const resolved = fs.resolvePath(base, path);
        return {
          content: [{ type: "text", text: resolved }],
        };
      } catch (err) {
        return toMcpError(err);
      }
    }),
  );

  registerTool(
    "ws_get_all_paths",
    {
      title: "Get All Paths",
      description:
        "Get all file and directory paths in the workspace. Useful for overview and glob matching. May return an empty array if the backend doesn't support this operation.",
      inputSchema: {
        workspace_id: workspaceIdSchema,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    withLogging("ws_get_all_paths", async ({ workspace_id }: any) => {
      try {
        const fs = manager.getFs(workspace_id);
        const paths = fs.getAllPaths();
        return {
          content: [{ type: "text", text: JSON.stringify(paths, null, 2) }],
        };
      } catch (err) {
        return toMcpError(err);
      }
    }),
  );

  registerTool(
    "ws_utimes",
    {
      title: "Update Timestamps",
      description:
        "Set access and modification times of a file. Times should be ISO 8601 strings (e.g., '2026-01-15T12:00:00.000Z').",
      inputSchema: {
        workspace_id: workspaceIdSchema,
        path: pathSchema,
        atime: z
          .string()
          .describe("Access time as ISO 8601 string"),
        mtime: z
          .string()
          .describe("Modification time as ISO 8601 string"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    withLogging("ws_utimes", async ({ workspace_id, path, atime, mtime }: any) => {
      try {
        const fs = manager.getFs(workspace_id);
        await fs.utimes(path, new Date(atime), new Date(mtime));
        return {
          content: [
            { type: "text", text: `Updated timestamps for ${path}` },
          ],
        };
      } catch (err) {
        return toMcpError(err);
      }
    }),
  );
}
