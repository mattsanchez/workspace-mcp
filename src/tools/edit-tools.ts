import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { IFileSystem } from "just-bash";
import type { WorkspaceManager } from "../workspace/manager.ts";
import { toMcpError } from "../util/errors.ts";
import { pathSchema, workspaceIdSchema } from "../util/schemas.ts";

/**
 * Core edit logic extracted for direct testing.
 * Performs exact string replacement in a file.
 */
export async function performEdit(
  fs: IFileSystem,
  path: string,
  old_string: string,
  new_string: string,
  replace_all: boolean,
): Promise<{ count: number }> {
  if (old_string === new_string) {
    throw new Error("old_string and new_string are identical");
  }
  const content = await fs.readFile(path);
  const count = content.split(old_string).length - 1;
  if (count === 0) {
    throw new Error(
      `No match found for the provided old_string in ${path}`,
    );
  }
  if (count > 1 && !replace_all) {
    throw new Error(
      `Multiple matches (${count}) found for old_string in ${path}. ` +
        `Use replace_all: true to replace all, or provide a more specific old_string.`,
    );
  }
  const newContent = replace_all
    ? content.replaceAll(old_string, new_string)
    : content.replace(old_string, new_string);
  await fs.writeFile(path, newContent);
  return { count };
}

export function registerEditTools(
  server: McpServer,
  manager: WorkspaceManager,
): void {
  const registerTool = server.registerTool.bind(server) as any;
  registerTool(
    "ws_edit",
    {
      title: "Edit File",
      description:
        "Perform exact string replacement in a file. Finds old_string and replaces with new_string. " +
        "Fails if old_string matches 0 or >1 locations (unless replace_all is true). " +
        "Whitespace-exact: tabs, spaces, newlines must match precisely.",
      inputSchema: {
        workspace_id: workspaceIdSchema,
        path: pathSchema,
        old_string: z.string().min(1).describe("Exact text to find and replace"),
        new_string: z.string().describe("Replacement text (can be empty to delete)"),
        replace_all: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "Replace all occurrences instead of requiring unique match",
          ),
      } as any,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ workspace_id, path, old_string, new_string, replace_all }: any) => {
      try {
        const fs = manager.getFs(workspace_id);
        const { count } = await performEdit(
          fs,
          path,
          old_string,
          new_string,
          replace_all,
        );
        return {
          content: [
            {
              type: "text",
              text: `Edited ${path}: replaced ${count} occurrence(s)`,
            },
          ],
        };
      } catch (err) {
        return toMcpError(err);
      }
    },
  );
}
