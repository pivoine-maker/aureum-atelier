import { describe, expect, it } from "vitest";

import { getWorkspaceFileKind, searchWorkspaceTreeByName, sortWorkspaceNodes, toDisplayPath, type WorkspaceTreeNode } from "./workspace";

describe("workspace helpers", () => {
  it("sorts directories before files and names alphabetically", () => {
    const nodes: WorkspaceTreeNode[] = [
      { name: "z.ts", path: "z.ts", kind: "file" },
      { name: "components", path: "components", kind: "directory", children: [] },
      { name: "a.ts", path: "a.ts", kind: "file" },
      { name: "assets", path: "assets", kind: "directory", children: [] },
    ];

    expect(sortWorkspaceNodes(nodes).map((node) => node.name)).toEqual([
      "assets",
      "components",
      "a.ts",
      "z.ts",
    ]);
  });

  it("normalizes separators for display", () => {
    expect(toDisplayPath("src\\renderer\\App.tsx")).toBe("src/renderer/App.tsx");
  });

  it("finds files and folders by display name", () => {
    expect(searchWorkspaceTreeByName([
      { name: "src", path: "src", kind: "directory", children: [
        { name: "App.tsx", path: "src/App.tsx", kind: "file" },
      ] },
    ], "app")).toEqual([{ path: "src/App.tsx", line: 1, column: 1, preview: "App.tsx" }]);
  });

  it("classifies editable, markdown, and image files for the editor", () => {
    expect(getWorkspaceFileKind("README.md")).toBe("markdown");
    expect(getWorkspaceFileKind("docs/diagram.png")).toBe("image");
    expect(getWorkspaceFileKind("src/App.tsx")).toBe("text");
  });
});
