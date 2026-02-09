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
  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    isError: true as const,
  };
}
