import { describe, expect, it } from "vitest";

import { escapeRipgrepGlob, parseContentSearchResults, parseFileSearchResults } from "./workspaceSearchService";

describe("workspaceSearchService", () => {
  it("parses content and filename results without requiring a loaded tree", () => {
    expect(parseContentSearchResults("./src/App.tsx:3:12:export function App()\n")).toEqual([
      { path: "src/App.tsx", line: 3, column: 12, preview: "export function App()" },
    ]);
    expect(parseFileSearchResults("./src/App.tsx\n./docs/App-guide.md\n")).toEqual([
      { path: "src/App.tsx", line: 1, column: 1, preview: "App.tsx" },
      { path: "docs/App-guide.md", line: 1, column: 1, preview: "App-guide.md" },
    ]);
  });

  it("escapes user text before using it in a ripgrep glob", () => {
    expect(escapeRipgrepGlob("[app]*?.tsx")).toBe("\\[app\\]\\*\\?.tsx");
  });
});
