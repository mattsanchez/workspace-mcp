import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WorkspaceManager } from "./workspace/manager.ts";
import { registerAllTools } from "./tools/register-all.ts";

export function createServer(manager: WorkspaceManager): McpServer {
  const server = new McpServer({
    name: "workspace-mcp-server",
    version: "1.0.0",
  });

  registerAllTools(server, manager);

  return server;
}
