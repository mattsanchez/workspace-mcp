import { describe, expect, it } from "bun:test";
import {
  sanitizePath,
  sanitizeGlobPattern,
  compileRegex,
} from "../sanitize.ts";

describe("sanitizePath", () => {
  it("strips leading slashes", () => {
    expect(sanitizePath("/foo/bar")).toBe("foo/bar");
  });

  it("normalizes dots", () => {
    expect(sanitizePath("./foo/../bar")).toBe("bar");
  });

  it("rejects root escape via ../", () => {
    expect(() => sanitizePath("../../etc/passwd")).toThrow(
      "Path escapes workspace root",
    );
  });

  it('returns "." for empty result', () => {
    expect(sanitizePath("/")).toBe(".");
  });

  it("passes through clean paths", () => {
    expect(sanitizePath("src/index.ts")).toBe("src/index.ts");
  });
});

describe("sanitizeGlobPattern", () => {
  it("rejects patterns with ..", () => {
    expect(() => sanitizeGlobPattern("../**/*.ts")).toThrow(
      "must not contain '..'",
    );
  });

  it("strips leading slash", () => {
    expect(sanitizeGlobPattern("/**/*.ts")).toBe("**/*.ts");
  });

  it("passes through clean patterns", () => {
    expect(sanitizeGlobPattern("src/**/*.{ts,tsx}")).toBe(
      "src/**/*.{ts,tsx}",
    );
  });
});

describe("compileRegex", () => {
  it("returns RegExp with g flag by default", () => {
    const re = compileRegex("foo");
    expect(re).toBeInstanceOf(RegExp);
    expect(re.flags).toContain("g");
  });

  it("adds i flag when caseInsensitive: true", () => {
    const re = compileRegex("foo", { caseInsensitive: true });
    expect(re.flags).toContain("i");
  });

  it("adds ms flags when multiline: true", () => {
    const re = compileRegex("foo", { multiline: true });
    expect(re.flags).toContain("m");
    expect(re.flags).toContain("s");
  });

  it("throws on invalid regex", () => {
    expect(() => compileRegex("[invalid")).toThrow("Invalid regex pattern");
  });
});
