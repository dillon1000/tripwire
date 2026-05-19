const DEFAULT_MIGRATION_PATTERNS = [
  "**/migrations/**",
  "**/migration/**",
  "**/*.migration.*",
  "**/schema.sql",
  "**/schema.ts",
  "prisma/**",
  "drizzle/**"
];

export function migrationPatterns(configured: string[] | undefined, globalPatterns: string[] | undefined): string[] {
  return configured?.length ? configured : globalPatterns?.length ? globalPatterns : DEFAULT_MIGRATION_PATTERNS;
}

export function matchesAnyPattern(file: string, patterns: string[]): boolean {
  return patterns.some((pattern) => globToRegExp(pattern).test(normalizePath(file)));
}

export function globToRegExp(pattern: string): RegExp {
  const normalized = normalizePath(pattern);
  let source = "";
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1];
    if (char === "*" && next === "*") {
      source += ".*";
      index += 1;
    } else if (char === "*") {
      source += "[^/]*";
    } else if (char === "?") {
      source += "[^/]";
    } else {
      source += escapeRegExp(char);
    }
  }
  return new RegExp(`^${source}$`);
}

function normalizePath(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\.\//, "");
}

function escapeRegExp(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}
