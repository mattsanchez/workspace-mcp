# workspace-mcp

An [MCP](https://modelcontextprotocol.io/) server that exposes workspace file operations — read, write, edit, search, and manage files across sandboxed workspaces.

## Features

- **Workspace management** — create, list, and switch between isolated workspaces
- **File operations** — read, write, edit, copy, move, remove files
- **Search** — grep (regex content search) and glob (file pattern matching)
- **Directory operations** — list, create, tree view
- **Transports** — stdio (default) and HTTP
- **Cross-platform binaries** — pre-compiled for macOS, Linux, and Windows

## Quick start

```bash
# Install dependencies
bun install

# Run in stdio mode (default)
bun run dev

# Run in HTTP mode
TRANSPORT=http PORT=3100 bun run dev
```

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CONFIG_DIR` | `~/.otto` | Directory for workspace configuration |
| `TRANSPORT` | `stdio` | Transport type: `stdio` or `http` |
| `PORT` | `3100` | HTTP server port (when `TRANSPORT=http`) |
| `DEFAULT_WORKSPACE_NAME` | — | Pre-configure a default workspace name |
| `DEFAULT_WORKSPACE_DIR` | — | Pre-configure a default workspace directory |

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
