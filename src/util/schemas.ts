import { z } from "zod";

export const workspaceIdSchema = z
  .string()
  .min(1)
  .optional()
  .describe(
    "The workspace identifier. If omitted, uses the default workspace (set via DEFAULT_WORKSPACE_NAME env var).",
  );

export const pathSchema = z
  .string()
  .min(1)
  .describe("File or directory path within the workspace");

export const encodingSchema = z
  .enum(["utf8", "utf-8", "ascii", "binary", "base64", "hex", "latin1"])
  .optional()
  .describe("Character encoding (default: utf8)");

export const recursiveSchema = z
  .boolean()
  .optional()
  .describe("Operate recursively on directories");

export const forceSchema = z
  .boolean()
  .optional()
  .describe("Force operation, ignore nonexistent files");
