import { getLogger } from "./logger.ts";

export class WorkspaceNotFoundError extends Error {
  constructor(workspaceId: string) {
    super(`Workspace not found: ${workspaceId}`);
    this.name = "WorkspaceNotFoundError";
  }
}

export class WorkspaceExistsError extends Error {
  constructor(workspaceId: string) {
    super(`Workspace already exists: ${workspaceId}`);
    this.name = "WorkspaceExistsError";
  }
}

export function toMcpError(err: unknown) {
  const log = getLogger();
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  log.error({ error: message, stack }, "mcp_error");
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    isError: true as const,
  };
}
