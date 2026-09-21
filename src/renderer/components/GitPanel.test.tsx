import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GitStatus } from "../../shared/git";
import { GitPanel } from "./GitPanel";

const status: GitStatus = {
  branch: "main",
  isRepository: true,
  changes: [
    { area: "worktree", path: "src/App.tsx", status: "modified" },
    { area: "index", path: "README.md", status: "modified" },
  ],
};

describe("GitPanel", () => {
  beforeEach(() => {
    Reflect.set(window, "aureum", { git: {
      status: vi.fn().mockResolvedValue(status),
      diff: vi.fn().mockResolvedValue("@@ -1 +1 @@\n-old\n+new"),
      stage: vi.fn().mockResolvedValue(undefined),
      unstage: vi.fn().mockResolvedValue(undefined),
      revert: vi.fn().mockResolvedValue(undefined),
      commit: vi.fn().mockResolvedValue("[main abc] Update files"),
      log: vi.fn().mockResolvedValue([
        {
          author: "Aureum Test",
          date: "2026-08-02T09:00:00+08:00",
          graph: "*",
          hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          parents: ["bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"],
          refs: ["HEAD -> main", "tag: v1"],
          shortHash: "aaaaaaa",
          subject: "Add Git graph",
        },
      ]),
    } });
  });

  it("loads and renders a collapsible recent commit graph", async () => {
    render(<GitPanel onNotice={vi.fn()} onRefresh={vi.fn()} status={status} />);

    await waitFor(() => expect(window.aureum.git.log).toHaveBeenCalledWith({ limit: 30 }));
    expect(screen.getByRole("heading", { name: "Commit Graph" })).toBeInTheDocument();
    expect(screen.getByText("Add Git graph")).toBeInTheDocument();
    expect(screen.getByText("aaaaaaa")).toBeInTheDocument();
    expect(screen.getByText("HEAD -> main")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Collapse commit graph" }));
    expect(screen.queryByText("Add Git graph")).not.toBeInTheDocument();
  });

  it("shows an empty graph state for repositories without commits", async () => {
    window.aureum.git.log = vi.fn().mockResolvedValue([]);

    render(<GitPanel onNotice={vi.fn()} onRefresh={vi.fn()} status={{ ...status, changes: [] }} />);

    expect(await screen.findByText("No commits yet")).toBeInTheDocument();
  });

  it("reloads history when the active repository branch changes", async () => {
    const notice = vi.fn();
    const refresh = vi.fn();
    const view = render(<GitPanel onNotice={notice} onRefresh={refresh} repositoryKey="/tmp/project" status={status} />);
    await waitFor(() => expect(window.aureum.git.log).toHaveBeenCalledTimes(1));

    view.rerender(<GitPanel onNotice={notice} onRefresh={refresh} repositoryKey="/tmp/project" status={{ ...status, branch: "feature/graph" }} />);

    await waitFor(() => expect(window.aureum.git.log).toHaveBeenCalledTimes(2));
  });

  it("opens a split diff and stages a worktree change", async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    render(<GitPanel onNotice={vi.fn()} onRefresh={refresh} status={status} />);

    fireEvent.click(screen.getByRole("button", { name: "Open diff for src/App.tsx" }));
    await waitFor(() => expect(window.aureum.git.diff).toHaveBeenCalledWith({ path: "src/App.tsx", staged: false }));
    expect(screen.getByRole("dialog", { name: "Diff src/App.tsx" })).toBeInTheDocument();
    expect(screen.getByText("old")).toBeInTheDocument();
    expect(screen.getByText("new")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Stage src/App.tsx" }));
    await waitFor(() => expect(window.aureum.git.stage).toHaveBeenCalledWith("src/App.tsx"));
    expect(refresh).toHaveBeenCalled();
  });

  it("unstages files and commits the index", async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    render(<GitPanel onNotice={vi.fn()} onRefresh={refresh} status={status} />);

    fireEvent.click(screen.getByRole("button", { name: "Unstage README.md" }));
    await waitFor(() => expect(window.aureum.git.unstage).toHaveBeenCalledWith("README.md"));

    fireEvent.change(screen.getByRole("textbox", { name: "Commit message" }), { target: { value: "Update files" } });
    fireEvent.click(screen.getByRole("button", { name: "Commit staged changes" }));
    await waitFor(() => expect(window.aureum.git.commit).toHaveBeenCalledWith("Update files"));
  });
});
