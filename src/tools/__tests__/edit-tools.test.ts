import { describe, expect, it } from "bun:test";
import { InMemoryFs } from "just-bash";
import { performEdit } from "../edit-tools.ts";

describe("performEdit (ws_edit core logic)", () => {
  it("replaces a single match and writes back correctly", async () => {
    const fs = new InMemoryFs({ "/file.ts": "const x = 1;" });
    const result = await performEdit(fs, "/file.ts", "x = 1", "x = 42", false);
    expect(result.count).toBe(1);
    const content = await fs.readFile("/file.ts");
    expect(content).toBe("const x = 42;");
  });

  it("returns error when old_string is not found", async () => {
    const fs = new InMemoryFs({ "/file.ts": "const x = 1;" });
    await expect(
      performEdit(fs, "/file.ts", "not_found", "replacement", false),
    ).rejects.toThrow("No match found");
  });

  it("returns error when multiple matches found without replace_all", async () => {
    const fs = new InMemoryFs({ "/file.ts": "aaa bbb aaa ccc aaa" });
    await expect(
      performEdit(fs, "/file.ts", "aaa", "zzz", false),
    ).rejects.toThrow("Multiple matches (3) found");
  });

  it("replaces all occurrences when replace_all is true", async () => {
    const fs = new InMemoryFs({ "/file.ts": "aaa bbb aaa ccc aaa" });
    const result = await performEdit(fs, "/file.ts", "aaa", "zzz", true);
    expect(result.count).toBe(3);
    const content = await fs.readFile("/file.ts");
    expect(content).toBe("zzz bbb zzz ccc zzz");
  });

  it("returns error when old_string equals new_string", async () => {
    const fs = new InMemoryFs({ "/file.ts": "const x = 1;" });
    await expect(
      performEdit(fs, "/file.ts", "x = 1", "x = 1", false),
    ).rejects.toThrow("identical");
  });

  it("is whitespace-sensitive (tabs vs spaces)", async () => {
    const fs = new InMemoryFs({ "/file.ts": "\tconst x = 1;" });
    // Searching with spaces should not match tab-indented content
    await expect(
      performEdit(fs, "/file.ts", "  const x = 1;", "replaced", false),
    ).rejects.toThrow("No match found");
    // Searching with actual tab should match
    const result = await performEdit(
      fs,
      "/file.ts",
      "\tconst x = 1;",
      "  const x = 1;",
      false,
    );
    expect(result.count).toBe(1);
    const content = await fs.readFile("/file.ts");
    expect(content).toBe("  const x = 1;");
  });

  it("effectively deletes when new_string is empty", async () => {
    const fs = new InMemoryFs({ "/file.ts": "hello world" });
    const result = await performEdit(fs, "/file.ts", " world", "", false);
    expect(result.count).toBe(1);
    const content = await fs.readFile("/file.ts");
    expect(content).toBe("hello");
  });
});
