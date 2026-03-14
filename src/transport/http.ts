import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { getLogger } from "../util/logger.ts";

export async function startHttpServer(server: McpServer, port: number): Promise<void> {
  // Use stateful mode so a single transport can handle multiple requests.
  // Stateless mode throws "cannot be reused across requests" after the first call.
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
    enableJsonResponse: true,
  });

  await server.connect(transport);

  Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);
      getLogger().debug({ method: req.method, path: url.pathname }, "http request");

      if (url.pathname === "/mcp") {
        return transport.handleRequest(req);
      }

      if (url.pathname === "/health") {
        return new Response(JSON.stringify({ status: "ok" }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response("Not Found", { status: 404 });
    },
  });

  getLogger().info({ transport: "http", port }, "server started");
}
