import { describe, expect, it } from "vitest";

import { parseGitLog, parseGitStatus } from "./git";

describe("parseGitStatus", () => {
  it("parses porcelain v1 status lines", () => {
    expect(parseGitStatus(" M src/App.tsx\nA  src/new.ts\n?? notes.md\nR  old.ts -> new.ts\n")).toEqual([
      { area: "worktree", path: "src/App.tsx", status: "modified" },
      { area: "index", path: "src/new.ts", status: "added" },
      { area: "worktree", path: "notes.md", status: "untracked" },
      { area: "index", path: "new.ts", oldPath: "old.ts", status: "renamed" },
    ]);
  });

  it("preserves staged and unstaged changes for the same file", () => {
    expect(parseGitStatus("MM src/both.ts\n")).toEqual([
      { area: "index", path: "src/both.ts", status: "modified" },
      { area: "worktree", path: "src/both.ts", status: "modified" },
    ]);
  });
});

describe("parseGitLog", () => {
  it("parses decorated graph log lines into commits", () => {
    const output = [
      "* aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\u001faaaaaaa\u001fbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb cccccccccccccccccccccccccccccccccccccccc\u001fAda\u001f2026-08-02T09:00:00+08:00\u001fHEAD -> main, tag: v1\u001fMerge feature branch",
      "|\\",
      "| * bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\u001fbbbbbbb\u001f\u001fGrace\u001f2026-08-01T08:00:00+08:00\u001ffeature\u001fAdd graph view",
    ].join("\n");

    expect(parseGitLog(output)).toEqual([
      {
        author: "Ada",
        date: "2026-08-02T09:00:00+08:00",
        graph: "*",
        hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        parents: ["bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "cccccccccccccccccccccccccccccccccccccccc"],
        refs: ["HEAD -> main", "tag: v1"],
        shortHash: "aaaaaaa",
        subject: "Merge feature branch",
      },
      {
        author: "Grace",
        date: "2026-08-01T08:00:00+08:00",
        graph: "|\\\n| *",
        hash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        parents: [],
        refs: ["feature"],
        shortHash: "bbbbbbb",
        subject: "Add graph view",
      },
    ]);
  });

  it("returns an empty history for empty output", () => {
    expect(parseGitLog("\n")).toEqual([]);
  });
});
