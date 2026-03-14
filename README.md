# workspace-mcp

An [MCP](https://modelcontextprotocol.io/) server that exposes workspace file operations — read, write, edit, search, and manage files across sandboxed workspaces.

## Features

- **Workspace management** — create, list, and switch between isolated workspaces
- **File operations** — read, write, edit, copy, move, remove files
- **Search** — grep (regex content search) and glob (file pattern matching)
- **Directory operations** — list, create, tree view
- **Structured logging** — JSON logs with configurable levels and file/stderr output via [pino](https://github.com/pinojs/pino)
- **Transports** — stdio (default) and HTTP
- **Cross-platform binaries** — pre-compiled for macOS, Linux, and Windows

## Usage

Run directly with npx — no installation required:

```bash
npx @mattsanchez/workspace-mcp
```

Or with environment variables:

```bash
DEFAULT_WORKSPACE_NAME=my-project DEFAULT_WORKSPACE_DIR=/path/to/project npx @mattsanchez/workspace-mcp
```

To use with the [MCP Inspector](https://github.com/modelcontextprotocol/inspector):

```bash
npx @modelcontextprotocol/inspector npx @mattsanchez/workspace-mcp
```

HTTP mode:

```bash
TRANSPORT=http PORT=3100 npx @mattsanchez/workspace-mcp
```

## Development

```bash
# Install dependencies
bun install

# Run in stdio mode (default)
bun run dev

# Run in HTTP mode
TRANSPORT=http PORT=3100 bun run dev

# Run tests
bun test

# Type check
bun run typecheck
```

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CONFIG_DIR` | `~/.otto` | Directory for workspace configuration |
| `TRANSPORT` | `stdio` | Transport type: `stdio` or `http` |
| `PORT` | `3100` | HTTP server port (when `TRANSPORT=http`) |
| `DEFAULT_WORKSPACE_NAME` | — | Pre-configure a default workspace name |
| `DEFAULT_WORKSPACE_DIR` | — | Pre-configure a default workspace directory |
| `LOG_LEVEL` | `info` | Log verbosity: `debug`, `info`, `warn`, or `error` |
| `LOG_FILE` | — | Path to log file; when unset, logs go to stderr |

## Logging

workspace-mcp uses [pino](https://github.com/pinojs/pino) for structured JSON logging. Logs are written to stderr by default (safe for stdio transport) or to a file when `LOG_FILE` is set.

```bash
# Debug logging to a file
LOG_LEVEL=debug LOG_FILE=/tmp/mcp.log npx @mattsanchez/workspace-mcp

# Errors only
LOG_LEVEL=error npx @mattsanchez/workspace-mcp
```

What gets logged at each level:

| Level | Events |
|-------|--------|
| `error` | Error details with stack traces |
| `warn` | Stale workspace pruning |
| `info` | Server startup, workspace create/delete |
| `debug` | Tool calls with arguments, HTTP requests, resource access |

## Building

Standalone binaries for all platforms:

```bash
bun run build          # all platforms
bun run build:macos    # macOS arm64 + x64
bun run build:linux    # Linux arm64 + x64
bun run build:windows  # Windows x64
```

## Client usage

The package also exports a client for connecting to the MCP server programmatically:

```ts
import { RemoteWorkspaceFS, McpToolCaller } from "@mattsanchez/workspace-mcp/client";
```

## License

[Apache 2.0](LICENSE)
