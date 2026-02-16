/**
 * Maps file type names to their file extensions.
 * Follows ripgrep's --type convention.
 */
export const FILE_TYPE_MAP: Record<string, string[]> = {
  ts: [".ts", ".tsx", ".mts", ".cts"],
  js: [".js", ".jsx", ".mjs", ".cjs"],
  py: [".py", ".pyi"],
  go: [".go"],
  rust: [".rs"],
  java: [".java"],
  json: [".json"],
  md: [".md", ".markdown"],
  yaml: [".yml", ".yaml"],
  css: [".css", ".scss", ".less"],
  html: [".html", ".htm"],
  c: [".c", ".h"],
  cpp: [".cpp", ".cc", ".cxx", ".hpp", ".hh", ".hxx"],
  ruby: [".rb"],
  php: [".php"],
  swift: [".swift"],
  kotlin: [".kt", ".kts"],
  shell: [".sh", ".bash", ".zsh"],
  toml: [".toml"],
  xml: [".xml"],
  sql: [".sql"],
};
