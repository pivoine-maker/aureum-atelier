import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fallbackArtworks } from "../shared/artwork";
import { defaultSettings } from "../shared/settings";
import { App } from "./App";

const workspaceTree = [
  { name: "src", path: "src", kind: "directory" as const, children: [
    { name: "main", path: "src/main", kind: "directory" as const, children: [
      { name: "index.ts", path: "src/main/index.ts", kind: "file" as const },
    ] },
    { name: "renderer", path: "src/renderer", kind: "directory" as const, children: [
      { name: "App.tsx", path: "src/renderer/App.tsx", kind: "file" as const },
    ] },
  ] },
];

describe("Aureum Atelier shell", () => {
  beforeEach(() => {
    let terminalId = 0;
    const storage = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    });
    window.aureum = {
      settings: {
        getInitial: vi.fn().mockResolvedValue(defaultSettings),
        update: vi.fn().mockImplementation(async (update) => ({ ...defaultSettings, ...update })),
      },
      artwork: {
        getToday: vi.fn().mockResolvedValue(fallbackArtworks[0]),
        resolveCachedImage: vi.fn().mockResolvedValue(null),
        onCacheReady: vi.fn().mockReturnValue(vi.fn()),
      },
      workspace: {
        open: vi.fn().mockResolvedValue({ root: "/tmp/project", name: "project", tree: workspaceTree }),
        restoreLast: vi.fn().mockResolvedValue(null),
        openRecent: vi.fn().mockResolvedValue(null),
        getRecent: vi.fn().mockResolvedValue([]),
        getTree: vi.fn().mockResolvedValue(workspaceTree),
        readDirectory: vi.fn().mockResolvedValue([]),
        readFile: vi.fn(),
        writeFile: vi.fn().mockResolvedValue(undefined),
        search: vi.fn().mockResolvedValue([{ path: "src/renderer/App.tsx", line: 3, column: 12, preview: "export function App()" }]),
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
        create: vi.fn().mockImplementation(async () => ({ id: `terminal-${++terminalId}`, cwd: "/tmp/project", shell: "zsh" })),
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

  it("renders the daily gallery workspace", async () => {
    await act(async () => {
      render(<App />);
    });

    expect(screen.getByRole("heading", { name: "Aureum Atelier" })).toBeInTheDocument();
    expect(document.querySelector(".window-controls")).toBeNull();
    expect(screen.getByRole("navigation", { name: "Workspace navigation" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Codex tasks" })).not.toHaveTextContent("3");
    expect(screen.getByRole("button", { name: "Codex tasks" }).querySelector(".activity-rail__badge")).toBeNull();
    expect(screen.getByRole("region", { name: "Editor workspace" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Codex panel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gallery" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Atelier" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Monastic" })).toBeInTheDocument();
    expect(screen.getByText("Blind Orion Searching for the Rising Sun")).toBeInTheDocument();
    expect(screen.getByText(/Nicolas Poussin/)).toBeInTheDocument();
    expect(screen.getByRole("separator", { name: "Resize Explorer panel" })).toHaveAttribute("aria-valuenow", "280");
    expect(screen.getByRole("separator", { name: "Resize Codex panel" })).toHaveAttribute("aria-valuenow", "354");
  });

  it("resizes workspace panels with accessible keyboard controls", async () => {
    await act(async () => {
      render(<App />);
    });

    const app = screen.getByTestId("aureum-app");
    const explorerHandle = screen.getByRole("separator", { name: "Resize Explorer panel" });
    const codexHandle = screen.getByRole("separator", { name: "Resize Codex panel" });

    fireEvent.keyDown(explorerHandle, { key: "ArrowRight" });
    expect(app.style.getPropertyValue("--explorer-width")).toBe("296px");
    expect(explorerHandle).toHaveAttribute("aria-valuenow", "296");

    fireEvent.keyDown(codexHandle, { key: "ArrowRight", shiftKey: true });
    expect(app.style.getPropertyValue("--codex-width")).toBe("306px");
    expect(codexHandle).toHaveAttribute("aria-valuenow", "306");

    fireEvent.doubleClick(codexHandle);
    expect(app.style.getPropertyValue("--codex-width")).toBe("354px");
  });

  it("collapses every workspace panel to the activity rail and restores them without unmounting", async () => {
    await act(async () => {
      render(<App />);
    });

    const app = screen.getByTestId("aureum-app");
    const explorerPanel = screen.getByRole("complementary", { name: "Explorer panel" });
    const editorPanel = screen.getByRole("region", { name: "Editor workspace" });
    const codexPanel = screen.getByRole("complementary", { name: "Codex panel" });

    fireEvent.click(screen.getByRole("button", { name: "Close Explorer panel" }));
    fireEvent.click(screen.getByRole("button", { name: "Close Editor panel" }));
    fireEvent.click(screen.getByRole("button", { name: "Close Codex panel" }));

    expect(app).toHaveClass("panel-explorer-hidden", "panel-editor-hidden", "panel-codex-hidden", "workbench-panels-hidden");
    expect(screen.getByRole("navigation", { name: "Workspace navigation" })).toBeVisible();
    expect(explorerPanel).toHaveAttribute("hidden");
    expect(editorPanel).toHaveAttribute("hidden");
    expect(codexPanel).toHaveAttribute("hidden");
    expect(screen.getByRole("button", { name: "Explorer" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Editor" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Codex tasks" })).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(screen.getByRole("button", { name: "Explorer" }));
    expect(app).toHaveClass("panel-only-explorer");
    fireEvent.click(screen.getByRole("button", { name: "Editor" }));
    fireEvent.click(screen.getByRole("button", { name: "Codex tasks" }));

    expect(explorerPanel).not.toHaveAttribute("hidden");
    expect(editorPanel).not.toHaveAttribute("hidden");
    expect(codexPanel).not.toHaveAttribute("hidden");
    expect(screen.getByRole("separator", { name: "Resize Explorer panel" })).toBeVisible();
    expect(screen.getByRole("separator", { name: "Resize Codex panel" })).toBeVisible();
  });

  it("restores hidden panels before focusing Search and Codex", async () => {
    await act(async () => {
      render(<App />);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Open workspace" }));
    });

    fireEvent.click(screen.getByRole("button", { name: "Close Explorer panel" }));
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Search workspace" })).toHaveFocus());

    fireEvent.click(screen.getByRole("button", { name: "Close Codex panel" }));
    fireEvent.click(screen.getByRole("button", { name: "Codex tasks" }));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Message Codex" })).toHaveFocus());
  });

  it("wires the primary workspace controls", async () => {
    await act(async () => {
      render(<App />);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Open workspace" }));
    });
    expect(window.aureum.workspace.open).toHaveBeenCalledOnce();

    const app = screen.getByTestId("aureum-app");
    fireEvent.click(screen.getByRole("button", { name: "Toggle sidebar" }));
    expect(app).toHaveClass("panel-explorer-hidden");

    fireEvent.click(screen.getByRole("button", { name: "Explorer" }));
    expect(app).not.toHaveClass("panel-explorer-hidden");

    fireEvent.change(screen.getByRole("searchbox", { name: "Search files or ask Codex" }), { target: { value: "App" } });
    expect(window.aureum.workspace.search).toHaveBeenCalledWith("App");

    fireEvent.click(screen.getByRole("button", { name: "Gallery" }));
    expect(screen.getByRole("button", { name: "Gallery" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(screen.getByRole("textbox", { name: "Search workspace" })).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: "Close Codex panel" }));
    fireEvent.click(screen.getByRole("button", { name: "Codex tasks" }));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Message Codex" })).toHaveFocus());

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Maximize terminal" }));
    expect(screen.getByRole("region", { name: "Integrated terminal" })).toHaveClass("terminal-panel--maximized");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "New terminal" }));
    });
    await waitFor(() => expect(window.aureum.terminal.create).toHaveBeenCalledTimes(2));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Kill terminal" }));
    });
    expect(window.aureum.terminal.kill).toHaveBeenCalled();
  });

  it("searches from the titlebar and folds workspace directories", async () => {
    vi.mocked(window.aureum.workspace.open).mockResolvedValueOnce({
      root: "/tmp/project",
      name: "project",
      tree: [{ name: "src", path: "src", kind: "directory" }],
    });
    vi.mocked(window.aureum.workspace.readDirectory).mockResolvedValueOnce([
      { name: "App.tsx", path: "src/App.tsx", kind: "file" },
    ]);
    await act(async () => {
      render(<App />);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Open workspace" }));
    });

    expect(screen.getByRole("button", { name: "src" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /App.tsx/ })).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "src" }));
    });
    expect(window.aureum.workspace.readDirectory).toHaveBeenCalledWith("src");
    expect(screen.getByRole("button", { name: /App.tsx/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "src" }));
    expect(screen.queryByRole("button", { name: /App.tsx/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "src" }));
    expect(screen.getByRole("button", { name: /App.tsx/ })).toBeInTheDocument();
    expect(window.aureum.workspace.readDirectory).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent.change(screen.getByRole("searchbox", { name: "Search files or ask Codex" }), { target: { value: "App" } });
    });

    expect(window.aureum.workspace.search).toHaveBeenCalledWith("App");
    expect(screen.getByText("src/renderer/App.tsx")).toBeInTheDocument();
  });

  it("opens the command palette from the keyboard", async () => {
    await act(async () => {
      render(<App />);
    });

    fireEvent.keyDown(window, { key: "p", metaKey: true, shiftKey: true });
    expect(screen.getByRole("dialog", { name: "Command palette" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Open settings/ }));
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeInTheDocument();
  });
});
