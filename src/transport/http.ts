import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

export function startHttpServer(server: McpServer, port: number): void {
  Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);

      if (url.pathname === "/mcp" && req.method === "POST") {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true,
        });

        await server.connect(transport);

        const body = await req.json();
        const response = await new Promise<Response>((resolve) => {
          const res = {
            writeHead: (_status: number, _headers: Record<string, string>) => res,
            end: (data: string) => {
              resolve(
                new Response(data, {
                  headers: { "Content-Type": "application/json" },
                }),
              );
            },
          };
          // The StreamableHTTPServerTransport expects Node-style req/res.
          // For Bun, we adapt by passing the body directly.
          transport.handleRequest(
            { body, method: "POST", headers: Object.fromEntries(req.headers) } as any,
            res as any,
            body,
          );
        });

        return response;
      }

      if (url.pathname === "/health") {
        return new Response(JSON.stringify({ status: "ok" }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response("Not Found", { status: 404 });
    },
  });

  console.error(`Workspace MCP server listening on http://localhost:${port}/mcp`);
}
