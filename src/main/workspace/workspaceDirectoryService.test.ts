import { promises as fs } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { readWorkspaceDirectory } from "./workspaceDirectoryService";

describe("readWorkspaceDirectory", () => {
  it("reads exactly one directory level and leaves folders unloaded", async () => {
    const root = await mkdtemp(join(tmpdir(), "aureum-workspace-tree-"));
    await fs.mkdir(join(root, "src", "nested"), { recursive: true });
    await fs.writeFile(join(root, "README.md"), "readme", "utf8");
    await fs.writeFile(join(root, "src", "index.ts"), "index", "utf8");

    const nodes = await readWorkspaceDirectory(root, root);

    expect(nodes).toEqual([
      { name: "src", path: "src", kind: "directory" },
      { name: "README.md", path: "README.md", kind: "file" },
    ]);
  });

  it("omits hidden, ignored, symbolic-link, and special entries", async () => {
    const root = await mkdtemp(join(tmpdir(), "aureum-workspace-filter-"));
    await fs.mkdir(join(root, ".git"));
    await fs.mkdir(join(root, "node_modules"));
    await fs.writeFile(join(root, ".secret"), "secret", "utf8");
    await fs.writeFile(join(root, ".env.example"), "example", "utf8");
    await fs.writeFile(join(root, "target.txt"), "target", "utf8");
    await fs.symlink(join(root, "target.txt"), join(root, "target-link"));

    const nodes = await readWorkspaceDirectory(root, root);

    expect(nodes.map((node) => node.name)).toEqual([".env.example", "target.txt"]);
  });

  it("returns an empty list when a directory cannot be read", async () => {
    const readEntries = async () => {
      throw Object.assign(new Error("permission denied"), { code: "EACCES" });
    };

    await expect(readWorkspaceDirectory("/Users/test", "/Users/test/Library", readEntries)).resolves.toEqual([]);
  });

  it("hides the system Library only at the Home root", async () => {
    const home = await mkdtemp(join(tmpdir(), "aureum-home-tree-"));
    await fs.mkdir(join(home, "Library"));
    await fs.mkdir(join(home, "Documents"));

    const nodes = await readWorkspaceDirectory(home, home, undefined, home);

    expect(nodes.map((node) => node.name)).toEqual(["Documents"]);
  });
});
