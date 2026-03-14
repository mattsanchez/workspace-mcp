import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WorkspaceManager } from "../workspace/manager.ts";
import { toMcpError } from "../util/errors.ts";
import { withLogging } from "../util/logger.ts";
import {
  forceSchema,
  pathSchema,
  recursiveSchema,
  workspaceIdSchema,
} from "../util/schemas.ts";

export function registerFileOpsTools(
  server: McpServer,
  manager: WorkspaceManager,
): void {
  const registerTool = server.registerTool.bind(server) as any;
  registerTool(
    "ws_rm",
    {
      title: "Remove File or Directory",
      description:
        "Remove a file or directory from the workspace. Use recursive for directories with contents, force to ignore nonexistent paths.",
      inputSchema: {
        workspace_id: workspaceIdSchema,
        path: pathSchema,
        recursive: recursiveSchema,
        force: forceSchema,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    withLogging("ws_rm", async ({ workspace_id, path, recursive, force }: any) => {
      try {
        const fs = manager.getFs(workspace_id);
        await fs.rm(path, { recursive, force });
        return {
          content: [{ type: "text", text: `Removed: ${path}` }],
        };
      } catch (err) {
        return toMcpError(err);
      }
    }),
  );

  registerTool(
    "ws_cp",
    {
      title: "Copy File or Directory",
      description:
        "Copy a file or directory within the workspace. Use recursive to copy directories with their contents.",
      inputSchema: {
        workspace_id: workspaceIdSchema,
        src: pathSchema.describe("Source path"),
        dest: pathSchema.describe("Destination path"),
        recursive: recursiveSchema,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    withLogging("ws_cp", async ({ workspace_id, src, dest, recursive }: any) => {
      try {
        const fs = manager.getFs(workspace_id);
        await fs.cp(src, dest, recursive ? { recursive } : undefined);
        return {
          content: [{ type: "text", text: `Copied ${src} to ${dest}` }],
        };
      } catch (err) {
        return toMcpError(err);
      }
    }),
  );

  registerTool(
    "ws_mv",
    {
      title: "Move/Rename",
      description:
        "Move or rename a file or directory within the workspace.",
      inputSchema: {
        workspace_id: workspaceIdSchema,
        src: pathSchema.describe("Current path"),
        dest: pathSchema.describe("New path"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    withLogging("ws_mv", async ({ workspace_id, src, dest }: any) => {
      try {
        const fs = manager.getFs(workspace_id);
        await fs.mv(src, dest);
        return {
          content: [{ type: "text", text: `Moved ${src} to ${dest}` }],
        };
      } catch (err) {
        return toMcpError(err);
      }
    }),
  );

  registerTool(
    "ws_chmod",
    {
      title: "Change Permissions",
      description:
        "Change file or directory permissions. Mode is a numeric value (e.g., 493 for rwxr-xr-x, 420 for rw-r--r--).",
      inputSchema: {
        workspace_id: workspaceIdSchema,
        path: pathSchema,
        mode: z
          .number()
          .int()
          .min(0)
          .max(0o7777)
          .describe(
            "File mode as a number (e.g., 493 = 0o755 = rwxr-xr-x, 420 = 0o644 = rw-r--r--)",
          ),
      } as any,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    withLogging("ws_chmod", async ({ workspace_id, path, mode }: any) => {
      try {
        const fs = manager.getFs(workspace_id);
        await fs.chmod(path, mode);
        return {
          content: [
            {
              type: "text",
              text: `Changed permissions of ${path} to ${mode.toString(8)}`,
            },
          ],
        };
      } catch (err) {
        return toMcpError(err);
      }
    }),
  );
}
