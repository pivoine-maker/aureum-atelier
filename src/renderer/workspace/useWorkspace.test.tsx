import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useWorkspace } from "./useWorkspace";

const tree = [
  { name: "src", path: "src", kind: "directory" as const, children: [
    { name: "App.tsx", path: "src/App.tsx", kind: "file" as const },
  ] },
];

describe("useWorkspace", () => {
  beforeEach(() => {
    window.aureum = {
      settings: { getInitial: vi.fn(), update: vi.fn() },
      artwork: {
        getToday: vi.fn(),
        resolveCachedImage: vi.fn().mockResolvedValue(null),
        onCacheReady: vi.fn().mockReturnValue(vi.fn()),
      },
      workspace: {
        open: vi.fn().mockResolvedValue({ root: "/tmp/project", name: "project", tree }),
        restoreLast: vi.fn().mockResolvedValue(null),
        openRecent: vi.fn().mockResolvedValue(null),
        getRecent: vi.fn().mockResolvedValue([]),
        getTree: vi.fn().mockResolvedValue(tree),
        readDirectory: vi.fn().mockResolvedValue([]),
        readFile: vi.fn().mockResolvedValue({
          path: "src/App.tsx",
          content: "export const app = true;",
          language: "typescript",
          kind: "text",
        }),
        writeFile: vi.fn().mockResolvedValue(undefined),
        search: vi.fn().mockResolvedValue([{ path: "src/App.tsx", line: 1, column: 14, preview: "export const app = true;" }]),
      },
      codex: {
        pickAttachments: vi.fn().mockResolvedValue([]),
        listSkills: vi.fn().mockResolvedValue([]),
        createThread: vi.fn().mockResolvedValue("thread-1"),
        getGoal: vi.fn().mockResolvedValue(null),
        setGoal: vi.fn(),
        clearGoal: vi.fn().mockResolvedValue(false),
        start: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn().mockResolvedValue(undefined),
        respondToApproval: vi.fn().mockResolvedValue(undefined),
        onEvent: vi.fn().mockReturnValue(vi.fn()),
      },
      terminal: {
        create: vi.fn().mockResolvedValue({ id: "terminal-1" }),
        write: vi.fn().mockResolvedValue(undefined),
        resize: vi.fn().mockResolvedValue(undefined),
        kill: vi.fn().mockResolvedValue(undefined),
        onOutput: vi.fn().mockReturnValue(vi.fn()),
        onExit: vi.fn().mockReturnValue(vi.fn()),
      },
      git: {
        status: vi.fn().mockResolvedValue({ branch: "main", changes: [], isRepository: true }),
        log: vi.fn().mockResolvedValue([]),
        diff: vi.fn().mockResolvedValue(""),
        stage: vi.fn().mockResolvedValue(undefined),
        unstage: vi.fn().mockResolvedValue(undefined),
        revert: vi.fn().mockResolvedValue(undefined),
        commit: vi.fn().mockResolvedValue("Committed"),
      },
    };
  });

  it("opens a workspace and loads its tree", async () => {
    const { result } = renderHook(() => useWorkspace());

    await act(async () => {
      await result.current.openWorkspace();
    });

    expect(result.current.rootName).toBe("project");
    expect(result.current.tree).toEqual(tree);
  });

  it("restores the most recent workspace on startup", async () => {
    vi.mocked(window.aureum.workspace.restoreLast).mockResolvedValueOnce({
      root: "/tmp/recent",
      name: "recent",
      tree,
    });

    const { result } = renderHook(() => useWorkspace());

    await waitFor(() => expect(result.current.rootName).toBe("recent"));
    expect(result.current.recentWorkspaces[0]?.root).toBe("/tmp/recent");
  });

  it("selects, edits, and saves a file", async () => {
    const { result } = renderHook(() => useWorkspace());

    await act(async () => {
      await result.current.selectFile("src/App.tsx");
    });

    expect(result.current.activeFile?.content).toBe("export const app = true;");

    act(() => {
      result.current.updateActiveContent("export const app = false;");
    });

    expect(result.current.isDirty).toBe(true);

    await act(async () => {
      await result.current.saveActiveFile();
    });

    expect(window.aureum.workspace.writeFile).toHaveBeenCalledWith({
      path: "src/App.tsx",
      content: "export const app = false;",
    });
    expect(result.current.isDirty).toBe(false);
  });

  it("keeps multiple editor tabs and lets the user switch and close them", async () => {
    vi.mocked(window.aureum.workspace.readFile)
      .mockResolvedValueOnce({ path: "src/App.tsx", content: "app", language: "typescript", kind: "text" })
      .mockResolvedValueOnce({ path: "README.md", content: "# Readme", language: "markdown", kind: "markdown" });
    const { result } = renderHook(() => useWorkspace());

    await act(async () => {
      await result.current.selectFile("src/App.tsx");
    });
    await act(async () => {
      await result.current.selectFile("README.md");
    });

    expect(result.current.openFiles.map((file) => file.path)).toEqual(["src/App.tsx", "README.md"]);
    expect(result.current.activeFile?.path).toBe("README.md");

    act(() => result.current.activateFile("src/App.tsx"));
    expect(result.current.activeFile?.path).toBe("src/App.tsx");

    act(() => result.current.closeFile("src/App.tsx"));
    expect(result.current.openFiles.map((file) => file.path)).toEqual(["README.md"]);
    expect(result.current.activeFile?.path).toBe("README.md");
  });

  it("searches the open workspace", async () => {
    const { result } = renderHook(() => useWorkspace());

    await act(async () => {
      await result.current.search("app");
    });

    expect(result.current.searchResults).toHaveLength(1);
  });

  it("loads an unloaded directory once and merges its immediate children", async () => {
    const rootTree = [{ name: "src", path: "src", kind: "directory" as const }];
    vi.mocked(window.aureum.workspace.open).mockResolvedValueOnce({ root: "/tmp/project", name: "project", tree: rootTree });
    vi.mocked(window.aureum.workspace.readDirectory).mockResolvedValueOnce([
      { name: "App.tsx", path: "src/App.tsx", kind: "file" },
    ]);
    const { result } = renderHook(() => useWorkspace());

    await act(async () => {
      await result.current.openWorkspace();
      await result.current.expandDirectory("src");
      await result.current.expandDirectory("src");
    });

    expect(window.aureum.workspace.readDirectory).toHaveBeenCalledTimes(1);
    expect(result.current.tree[0].children).toEqual([
      { name: "App.tsx", path: "src/App.tsx", kind: "file" },
    ]);
  });

  it("ignores a directory response after switching workspaces", async () => {
    let resolveDirectory: (nodes: typeof tree) => void = () => undefined;
    vi.mocked(window.aureum.workspace.open)
      .mockResolvedValueOnce({ root: "/tmp/alpha", name: "alpha", tree: [{ name: "src", path: "src", kind: "directory" }] })
      .mockResolvedValueOnce({ root: "/tmp/beta", name: "beta", tree: [{ name: "docs", path: "docs", kind: "directory" }] });
    vi.mocked(window.aureum.workspace.readDirectory).mockReturnValueOnce(new Promise((resolve) => {
      resolveDirectory = resolve;
    }));
    const { result } = renderHook(() => useWorkspace());

    await act(async () => {
      await result.current.openWorkspace();
    });
    let expansion: Promise<void>;
    act(() => {
      expansion = result.current.expandDirectory("src");
    });
    await act(async () => {
      await result.current.openWorkspace();
    });
    await act(async () => {
      resolveDirectory(tree);
      await expansion!;
    });

    expect(result.current.rootPath).toBe("/tmp/beta");
    expect(result.current.tree).toEqual([{ name: "docs", path: "docs", kind: "directory" }]);
  });
});
