import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WorkspaceManager } from "../workspace/manager.ts";
import { toMcpError } from "../util/errors.ts";
import { workspaceIdSchema, pathSchema } from "../util/schemas.ts";

export function registerLinkTools(
  server: McpServer,
  manager: WorkspaceManager,
): void {
  server.registerTool(
    "ws_symlink",
    {
      title: "Create Symbolic Link",
      description:
        "Create a symbolic link at link_path that points to target.",
      inputSchema: {
        workspace_id: workspaceIdSchema,
        target: pathSchema.describe("The path the symlink should point to"),
        link_path: pathSchema.describe(
          "The path where the symlink will be created",
        ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ workspace_id, target, link_path }) => {
      try {
        const fs = manager.getFs(workspace_id);
        await fs.symlink(target, link_path);
        return {
          content: [
            {
              type: "text",
              text: `Symlink created: ${link_path} -> ${target}`,
            },
          ],
        };
      } catch (err) {
        return toMcpError(err);
      }
    },
  );

  server.registerTool(
    "ws_link",
    {
      title: "Create Hard Link",
      description:
        "Create a hard link. The new_path will reference the same file data as existing_path.",
      inputSchema: {
        workspace_id: workspaceIdSchema,
        existing_path: pathSchema.describe("The existing file to link to"),
        new_path: pathSchema.describe(
          "The path where the new link will be created",
        ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ workspace_id, existing_path, new_path }) => {
      try {
        const fs = manager.getFs(workspace_id);
        await fs.link(existing_path, new_path);
        return {
          content: [
            {
              type: "text",
              text: `Hard link created: ${new_path} -> ${existing_path}`,
            },
          ],
        };
      } catch (err) {
        return toMcpError(err);
      }
    },
  );

  server.registerTool(
    "ws_readlink",
    {
      title: "Read Symbolic Link",
      description:
        "Read the target path of a symbolic link.",
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
    async ({ workspace_id, path }) => {
      try {
        const fs = manager.getFs(workspace_id);
        const target = await fs.readlink(path);
        return {
          content: [{ type: "text", text: target }],
        };
      } catch (err) {
        return toMcpError(err);
      }
    },
  );

  server.registerTool(
    "ws_realpath",
    {
      title: "Resolve Real Path",
      description:
        "Resolve all symbolic links in a path to get the canonical, absolute path.",
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
    async ({ workspace_id, path }) => {
      try {
        const fs = manager.getFs(workspace_id);
        const resolved = await fs.realpath(path);
        return {
          content: [{ type: "text", text: resolved }],
        };
      } catch (err) {
        return toMcpError(err);
      }
    },
  );
}
