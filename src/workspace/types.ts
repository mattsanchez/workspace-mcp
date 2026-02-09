import type { ReadWriteFsOptions, OverlayFsOptions } from "just-bash";

export type FsBackend = "read-write" | "overlay";

export interface WorkspaceMetadata {
  id: string;
  name: string;
  rootPath: string;
  fsBackend: FsBackend;
  fsOptions: ReadWriteFsOptions | OverlayFsOptions;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceConfigFile {
  version: number;
  workspaces: Record<string, WorkspaceMetadata>;
}

export interface WorkspaceCreateParams {
  id: string;
  name: string;
  rootPath: string;
  fsBackend: FsBackend;
  mountPoint?: string;
  readOnly?: boolean;
  maxFileReadSize?: number;
}
