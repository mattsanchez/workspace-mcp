# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

workspace-mcp is an MCP (Model Context Protocol) server that exposes sandboxed workspace file operations (read, write, edit, search, directory management) over stdio or HTTP transports. It also exports a client library (`RemoteWorkspaceFS`) for programmatic access.

## Commands

```bash
bun install              # Install dependencies
bun run dev              # Run MCP server (stdio transport)
bun test                 # Run all tests (Bun test runner)
bun test src/tools/__tests__/edit-tools.test.ts  # Run a single test file
bun run typecheck        # TypeScript type checking (no emit)
bun run inspect          # Launch MCP inspector for interactive debugging
bun run build            # Build standalone binaries for all platforms
```

HTTP mode: `TRANSPORT=http PORT=3100 bun run dev`

## Architecture

**Entry flow:** `src/index.ts` → creates `WorkspaceManager` → `createServer(manager)` in `src/server.ts` → connects to stdio or HTTP transport.

**WorkspaceManager** (`src/workspace/manager.ts`) maintains a `Map<workspaceId, IFileSystem>` where each workspace is backed by either a `ReadWriteFs` (direct access) or `OverlayFs` (copy-on-write) from the `just-bash` library. Config is persisted to `~/.otto/workspaces.json`.

**Tools** (`src/tools/`) — ~30 MCP tools prefixed `ws_*`, each registered via `registerXxxTools(server, manager)` functions, centralized through `register-all.ts`. Input validation uses Zod schemas from `src/util/schemas.ts`. All tools return `{content: [{type: "text", text: string}]}` or use `toMcpError()` from `src/util/errors.ts`.

**Resources** (`src/resources/`) — exposes a `workspace://{+path}` URI scheme for reading files via MCP resource protocol.

**Client** (`src/client/`) — `RemoteWorkspaceFS` implements the `IFileSystem` interface by calling MCP tools remotely. Exported via `"./client"` package export.

**Transports** (`src/transport/`) — stdio (default, for local use) and HTTP with session support.

## Key Patterns

- All filesystem paths are sanitized in `src/util/sanitize.ts` — no `..` traversal allowed, glob patterns validated
- Tool annotations declare `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint` per MCP spec
- All tool handlers are wrapped with `withLogging()` from `src/util/logger.ts` for structured entry/error logging via pino
- Tests live in `__tests__/` directories alongside implementation, use `bun:test`, and create temp directories or use `InMemoryFs` for isolation
- `test-server.ts` at the root is a smoke test that validates tools and resources end-to-end

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CONFIG_DIR` | `~/.otto` | Workspace configuration directory |
| `TRANSPORT` | `stdio` | Transport: `stdio` or `http` |
| `PORT` | `3100` | HTTP port |
| `DEFAULT_WORKSPACE_NAME` | — | Pre-configure default workspace name |
| `DEFAULT_WORKSPACE_DIR` | — | Pre-configure default workspace directory |
| `LOG_LEVEL` | `info` | Log verbosity: `debug`, `info`, `warn`, `error` |
| `LOG_FILE` | — | Log file path; defaults to stderr |
