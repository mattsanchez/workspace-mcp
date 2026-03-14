import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WorkspaceManager } from "../workspace/manager.ts";
import { getLogger } from "../util/logger.ts";

/**
 * Register workspace:// resource handlers on the MCP server.
 *
 * Exposes workspace files via the MCP resource protocol using
 * the URI scheme `workspace://{path}`. The `{+path}` reserved
 * expansion (RFC 6570) allows slashes in the path segment,
 * supporting nested paths like `.otto/AGENTS.md`.
 */
export function registerWorkspaceResources(
  server: McpServer,
  manager: WorkspaceManager,
): void {
  server.registerResource(
    "workspace-file",
    new ResourceTemplate("workspace://{+path}", { list: undefined }),
    { description: "Read a file from the workspace filesystem" },
    async (uri, variables) => {
      getLogger().debug({ uri: uri.href }, "resource access");
      const filePath = "/" + (variables.path as string);
      const fs = manager.getFs(undefined);
      const content = await fs.readFile(filePath);
      return {
        contents: [{ uri: uri.href, text: content, mimeType: "text/plain" }],
      };
    },
  );
}
