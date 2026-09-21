import { basename } from "node:path";

import { toDisplayPath, type SearchResult } from "../../shared/workspace";

export function parseContentSearchResults(stdout: string): SearchResult[] {
  return stdout
    .split("\n")
    .filter(Boolean)
    .slice(0, 250)
    .flatMap((line) => {
      const match = /^(.*?):(\d+):(\d+):(.*)$/.exec(line);
      if (!match) return [];
      return [{
        path: normalizeSearchPath(match[1]),
        line: Number(match[2]),
        column: Number(match[3]),
        preview: match[4].trim(),
      }];
    });
}

export function parseFileSearchResults(stdout: string): SearchResult[] {
  return stdout
    .split("\n")
    .filter(Boolean)
    .slice(0, 250)
    .map((path) => {
      const normalizedPath = normalizeSearchPath(path);
      return {
        path: normalizedPath,
        line: 1,
        column: 1,
        preview: basename(normalizedPath),
      };
    });
}

export function escapeRipgrepGlob(value: string): string {
  return value.replace(/[\\*?[\]{}]/g, "\\$&");
}

function normalizeSearchPath(path: string): string {
  return toDisplayPath(path.replace(/^\.\//, ""));
}
