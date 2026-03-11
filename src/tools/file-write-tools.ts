import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WorkspaceManager } from "../workspace/manager.ts";
import { toMcpError } from "../util/errors.ts";
import {
  encodingSchema,
  pathSchema,
  workspaceIdSchema,
} from "../util/schemas.ts";
import { z } from "zod";

export function registerFileWriteTools(
  server: McpServer,
  manager: WorkspaceManager,
): void {
  const registerTool = server.registerTool.bind(server) as any;
  registerTool(
    "ws_write_file",
    {
      title: "Write File",
      description:
        "Write content to a file in the workspace, creating it if it doesn't exist or overwriting if it does.",
      inputSchema: {
        workspace_id: workspaceIdSchema,
        path: pathSchema,
        content: z.string().describe("The content to write to the file"),
        encoding: encodingSchema,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ workspace_id, path, content, encoding }: any) => {
      try {
        const fs = manager.getFs(workspace_id);
        await fs.writeFile(path, content, encoding ? { encoding } : undefined);
        return {
          content: [{ type: "text", text: `Written to ${path}` }],
        };
      } catch (err) {
        return toMcpError(err);
      }
    },
  );

  registerTool(
    "ws_append_file",
    {
      title: "Append to File",
      description:
        "Append content to a file in the workspace, creating it if it doesn't exist.",
      inputSchema: {
        workspace_id: workspaceIdSchema,
        path: pathSchema,
        content: z.string().describe("The content to append to the file"),
        encoding: encodingSchema,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ workspace_id, path, content, encoding }: any) => {
      try {
        const fs = manager.getFs(workspace_id);
        await fs.appendFile(
          path,
          content,
          encoding ? { encoding } : undefined,
        );
        return {
          content: [{ type: "text", text: `Appended to ${path}` }],
        };
      } catch (err) {
        return toMcpError(err);
      }
    },
  );
}
