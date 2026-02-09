import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WorkspaceManager } from "../workspace/manager.ts";
import { registerWorkspaceTools } from "./workspace-tools.ts";
import { registerFileReadTools } from "./file-read-tools.ts";
import { registerFileWriteTools } from "./file-write-tools.ts";
import { registerDirTools } from "./dir-tools.ts";
import { registerFileOpsTools } from "./file-ops-tools.ts";
import { registerLinkTools } from "./link-tools.ts";
import { registerPathTools } from "./path-tools.ts";

export function registerAllTools(
  server: McpServer,
  manager: WorkspaceManager,
): void {
  registerWorkspaceTools(server, manager);
  registerFileReadTools(server, manager);
  registerFileWriteTools(server, manager);
  registerDirTools(server, manager);
  registerFileOpsTools(server, manager);
  registerLinkTools(server, manager);
  registerPathTools(server, manager);
}
