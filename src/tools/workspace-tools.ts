import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WorkspaceManager } from "../workspace/manager.ts";
import { toMcpError } from "../util/errors.ts";
import { workspaceIdSchema } from "../util/schemas.ts";

export function registerWorkspaceTools(
  server: McpServer,
  manager: WorkspaceManager,
): void {
  const registerTool = server.registerTool.bind(server) as any;
  registerTool(
    "ws_workspace_create",
    {
      title: "Create Workspace",
      description:
        "Register a new workspace backed by a local directory. Supports read-write (direct filesystem access) or overlay (copy-on-write, reads from disk, writes in memory) backends.",
      inputSchema: {
        id: z
          .string()
          .regex(
            /^[a-z0-9][a-z0-9_-]*$/,
            "Lowercase alphanumeric, hyphens, underscores. Must start with alphanumeric.",
          )
          .describe("Unique workspace identifier"),
        name: z.string().min(1).describe("Human-readable workspace name"),
        root_path: z
          .string()
          .min(1)
          .describe(
            "Absolute path to the root directory on the host filesystem",
          ),
        fs_backend: z
          .enum(["read-write", "overlay"])
          .default("read-write")
          .describe(
            "Filesystem backend: read-write for direct access, overlay for copy-on-write",
          ),
        mount_point: z
          .string()
          .optional()
          .describe(
            "Virtual mount point (overlay backend only, default: /)",
          ),
        read_only: z
          .boolean()
          .optional()
          .describe("Read-only mode (overlay backend only, default: false)"),
        max_file_read_size: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Maximum file read size in bytes (default: 10MB)"),
      } as any,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({
      id,
      name,
      root_path,
      fs_backend,
      mount_point,
      read_only,
      max_file_read_size,
    }: any) => {
      try {
        const meta = await manager.createWorkspace({
          id,
          name,
          rootPath: root_path,
          fsBackend: fs_backend,
          mountPoint: mount_point,
          readOnly: read_only,
          maxFileReadSize: max_file_read_size,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(meta, null, 2) }],
        };
      } catch (err) {
        return toMcpError(err);
      }
    },
  );

  registerTool(
    "ws_workspace_list",
    {
      title: "List Workspaces",
      description: "List all registered workspaces with their metadata.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      try {
        const workspaces = manager.listWorkspaces();
        return {
          content: [
            { type: "text", text: JSON.stringify(workspaces, null, 2) },
          ],
        };
      } catch (err) {
        return toMcpError(err);
      }
    },
  );

  registerTool(
    "ws_workspace_info",
    {
      title: "Workspace Info",
      description:
        "Get detailed metadata for a specific workspace including its filesystem backend configuration.",
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
    async ({ workspace_id }: any) => {
      try {
        const meta = manager.getWorkspace(workspace_id);
        return {
          content: [{ type: "text", text: JSON.stringify(meta, null, 2) }],
        };
      } catch (err) {
        return toMcpError(err);
      }
    },
  );

  registerTool(
    "ws_workspace_delete",
    {
      title: "Delete Workspace",
      description:
        "Remove a workspace from the registry. This does NOT delete files on disk -- it only unregisters the workspace.",
      inputSchema: {
        workspace_id: workspaceIdSchema,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ workspace_id }: any) => {
      try {
        await manager.deleteWorkspace(workspace_id);
        return {
          content: [
            {
              type: "text",
              text: `Workspace '${workspace_id}' deleted from registry.`,
            },
          ],
        };
      } catch (err) {
        return toMcpError(err);
      }
    },
  );
}
