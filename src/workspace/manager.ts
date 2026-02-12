import { OverlayFs, ReadWriteFs, type IFileSystem, type OverlayFsOptions } from "just-bash";
import { loadConfig, saveConfig } from "./config.ts";
import type {
  WorkspaceConfigFile,
  WorkspaceCreateParams,
  WorkspaceMetadata,
} from "./types.ts";
import {
  WorkspaceExistsError,
  WorkspaceNotFoundError,
} from "../util/errors.ts";

export class WorkspaceManager {
  private configDir: string;
  private config: WorkspaceConfigFile = { version: 1, workspaces: {} };
  private filesystems = new Map<string, IFileSystem>();
  private defaultWorkspaceId: string | undefined;

  constructor(configDir: string) {
    this.configDir = configDir;
  }

  async init(): Promise<void> {
    this.config = await loadConfig(this.configDir);
    for (const meta of Object.values(this.config.workspaces)) {
      this.filesystems.set(meta.id, this.createFs(meta));
    }
  }

  /**
   * Set up a default workspace from environment variables.
   * Creates the workspace if it doesn't exist, or updates
   * the rootPath if it changed.
   */
  async setupDefault(name: string, rootPath: string): Promise<void> {
    this.defaultWorkspaceId = name;
    const existing = this.config.workspaces[name];

    if (!existing) {
      await this.createWorkspace({
        id: name,
        name,
        rootPath,
        fsBackend: "read-write",
      });
    } else if (existing.rootPath !== rootPath) {
      existing.rootPath = rootPath;
      existing.fsOptions = { root: rootPath, maxFileReadSize: existing.fsOptions.maxFileReadSize };
      existing.updatedAt = new Date().toISOString();
      this.filesystems.set(name, this.createFs(existing));
      await saveConfig(this.configDir, this.config);
    }
  }

  private resolveWorkspaceId(workspaceId: string | undefined): string {
    if (workspaceId) return workspaceId;
    if (this.defaultWorkspaceId) return this.defaultWorkspaceId;
    throw new Error(
      "No workspace_id provided and no default workspace configured. " +
        "Set DEFAULT_WORKSPACE_NAME and DEFAULT_WORKSPACE_DIR environment variables, " +
        "or pass workspace_id explicitly.",
    );
  }

  getFs(workspaceId: string | undefined): IFileSystem {
    const id = this.resolveWorkspaceId(workspaceId);
    const fs = this.filesystems.get(id);
    if (!fs) {
      throw new WorkspaceNotFoundError(id);
    }
    return fs;
  }

  getWorkspace(workspaceId: string | undefined): WorkspaceMetadata {
    const id = this.resolveWorkspaceId(workspaceId);
    const meta = this.config.workspaces[id];
    if (!meta) {
      throw new WorkspaceNotFoundError(id);
    }
    return meta;
  }

  listWorkspaces(): WorkspaceMetadata[] {
    return Object.values(this.config.workspaces);
  }

  async createWorkspace(
    params: WorkspaceCreateParams,
  ): Promise<WorkspaceMetadata> {
    if (this.config.workspaces[params.id]) {
      throw new WorkspaceExistsError(params.id);
    }

    const now = new Date().toISOString();
    const fsOptions =
      params.fsBackend === "overlay"
        ? {
            root: params.rootPath,
            mountPoint: params.mountPoint,
            readOnly: params.readOnly,
            maxFileReadSize: params.maxFileReadSize,
          }
        : {
            root: params.rootPath,
            maxFileReadSize: params.maxFileReadSize,
          };

    const meta: WorkspaceMetadata = {
      id: params.id,
      name: params.name,
      rootPath: params.rootPath,
      fsBackend: params.fsBackend,
      fsOptions,
      createdAt: now,
      updatedAt: now,
    };

    this.config.workspaces[params.id] = meta;
    this.filesystems.set(params.id, this.createFs(meta));
    await saveConfig(this.configDir, this.config);
    return meta;
  }

  async deleteWorkspace(workspaceId: string | undefined): Promise<void> {
    const id = this.resolveWorkspaceId(workspaceId);
    if (!this.config.workspaces[id]) {
      throw new WorkspaceNotFoundError(id);
    }
    delete this.config.workspaces[id];
    this.filesystems.delete(id);
    await saveConfig(this.configDir, this.config);
  }

  private createFs(meta: WorkspaceMetadata): IFileSystem {
    if (meta.fsBackend === "overlay") {
      const opts = meta.fsOptions as OverlayFsOptions;
      return new OverlayFs({
        root: opts.root,
        mountPoint: opts.mountPoint,
        readOnly: opts.readOnly,
        maxFileReadSize: opts.maxFileReadSize,
      });
    }
    return new ReadWriteFs({
      root: meta.fsOptions.root,
      maxFileReadSize: meta.fsOptions.maxFileReadSize,
    });
  }
}
