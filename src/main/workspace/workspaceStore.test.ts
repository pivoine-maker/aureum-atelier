import { describe, expect, it } from "vitest";

import { WorkspaceStore } from "./workspaceStore";

describe("WorkspaceStore", () => {
  it("resolves files within the configured root", () => {
    const store = new WorkspaceStore();
    store.setRoot("/tmp/aureum-project");

    expect(store.resolveInsideRoot("src/App.tsx")).toBe("/tmp/aureum-project/src/App.tsx");
  });

  it("rejects traversal outside the workspace", () => {
    const store = new WorkspaceStore();
    store.setRoot("/tmp/aureum-project");

    expect(() => store.resolveInsideRoot("../secrets.txt")).toThrow("outside the workspace");
    expect(() => store.resolveInsideRoot("/tmp/aureum-project-copy/file.ts")).toThrow("outside the workspace");
  });

  it("can clear the current root", () => {
    const store = new WorkspaceStore();
    store.setRoot("/tmp/aureum-project");
    store.clearRoot();

    expect(store.getRoot()).toBeNull();
    expect(() => store.resolveInsideRoot("src/App.tsx")).toThrow("No workspace is open");
  });
});
