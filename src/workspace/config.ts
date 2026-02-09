import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { WorkspaceConfigFile } from "./types.ts";

const CONFIG_FILENAME = "workspaces.json";

const EMPTY_CONFIG: WorkspaceConfigFile = {
  version: 1,
  workspaces: {},
};

export async function loadConfig(
  configDir: string,
): Promise<WorkspaceConfigFile> {
  const configPath = join(configDir, CONFIG_FILENAME);
  const file = Bun.file(configPath);
  if (await file.exists()) {
    return (await file.json()) as WorkspaceConfigFile;
  }
  return structuredClone(EMPTY_CONFIG);
}

export async function saveConfig(
  configDir: string,
  config: WorkspaceConfigFile,
): Promise<void> {
  await mkdir(configDir, { recursive: true });
  const configPath = join(configDir, CONFIG_FILENAME);
  await Bun.write(configPath, JSON.stringify(config, null, 2) + "\n");
}
