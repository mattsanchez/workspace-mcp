#!/usr/bin/env node
import "dotenv/config";
import { homedir } from "node:os";
import { join } from "node:path";
import { initLogger, getLogger } from "./util/logger.ts";
import { WorkspaceManager } from "./workspace/manager.ts";
import { createServer } from "./server.ts";
import { createStdioTransport } from "./transport/stdio.ts";
import { startHttpServer } from "./transport/http.ts";

initLogger({
  level: process.env.LOG_LEVEL,
  logFile: process.env.LOG_FILE,
});
const log = getLogger();

const configDir =
  process.env.CONFIG_DIR ?? join(homedir(), ".otto");
const transport = process.env.TRANSPORT ?? "stdio";
const port = parseInt(process.env.PORT ?? "3100", 10);

const manager = new WorkspaceManager(configDir);
await manager.init();

const defaultName = process.env.DEFAULT_WORKSPACE_NAME;
const defaultDir = process.env.DEFAULT_WORKSPACE_DIR;
if (defaultName && defaultDir) {
  await manager.setupDefault(defaultName, defaultDir);
  log.info({ name: defaultName, dir: defaultDir }, "default workspace configured");
}

const server = createServer(manager);

if (transport === "http") {
  await startHttpServer(server, port);
} else {
  const stdio = createStdioTransport();
  await server.connect(stdio);
  log.info({ transport: "stdio" }, "server started");
}
