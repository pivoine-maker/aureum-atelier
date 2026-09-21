import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { beforeEach, describe, expect, it } from "vitest";

import { GitService } from "./gitService";

const exec = promisify(execFile);

describe("GitService", () => {
  let root: string;
  let service: GitService;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "aureum-git-"));
    await exec("git", ["init", "-b", "main"], { cwd: root });
    await exec("git", ["config", "user.email", "aureum@example.com"], { cwd: root });
    await exec("git", ["config", "user.name", "Aureum Test"], { cwd: root });
    await writeFile(join(root, "tracked.txt"), "first\n", "utf8");
    await exec("git", ["add", "tracked.txt"], { cwd: root });
    await exec("git", ["commit", "-m", "initial"], { cwd: root });
    service = new GitService(root);
  });

  it("stages, diffs, unstages, and reverts a tracked file", async () => {
    await writeFile(join(root, "tracked.txt"), "second\n", "utf8");

    expect(await service.diff("tracked.txt", false)).toContain("+second");
    await service.stage("tracked.txt");
    expect((await service.status()).changes).toContainEqual({ area: "index", path: "tracked.txt", status: "modified" });
    expect(await service.diff("tracked.txt", true)).toContain("+second");

    await service.unstage("tracked.txt");
    expect((await service.status()).changes).toContainEqual({ area: "worktree", path: "tracked.txt", status: "modified" });
    await service.revert("tracked.txt", false);
    expect(await readFile(join(root, "tracked.txt"), "utf8")).toBe("first\n");
  });

  it("commits staged changes with a validated message", async () => {
    await writeFile(join(root, "new.txt"), "gold\n", "utf8");
    await service.stage("new.txt");
    await expect(service.commit("Add gilded note")).resolves.toContain("Add gilded note");
    await expect(service.commit("   ")).rejects.toThrow("Commit message is required");
  });

  it("loads recent commits with graph and ref metadata", async () => {
    await writeFile(join(root, "new.txt"), "gold\n", "utf8");
    await service.stage("new.txt");
    await service.commit("Add gilded note");

    const commits = await service.log(5);

    expect(commits).toHaveLength(2);
    expect(commits[0]).toMatchObject({
      author: "Aureum Test",
      graph: "*",
      refs: expect.arrayContaining(["HEAD -> main"]),
      shortHash: expect.stringMatching(/^[0-9a-f]{7}/),
      subject: "Add gilded note",
    });
    expect(commits[0].parents).toHaveLength(1);
  });

  it("returns an empty log for repositories without commits", async () => {
    const emptyRoot = await mkdtemp(join(tmpdir(), "aureum-git-empty-"));
    await exec("git", ["init", "-b", "main"], { cwd: emptyRoot });

    await expect(new GitService(emptyRoot).log()).resolves.toEqual([]);
  });
});
