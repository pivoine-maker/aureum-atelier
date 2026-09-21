import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TerminalPanel } from "./TerminalPanel";

const terminalInstances: Array<{ focus: ReturnType<typeof vi.fn>; write: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }> = [];

vi.mock("@xterm/addon-fit", () => ({ FitAddon: class { fit = vi.fn(); } }));
vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    cols = 96;
    rows = 24;
    focus = vi.fn();
    write = vi.fn();
    writeln = vi.fn();
    dispose = vi.fn();
    loadAddon = vi.fn();
    open = vi.fn();
    onData = vi.fn(() => ({ dispose: vi.fn() }));
    constructor() { terminalInstances.push(this); }
  },
}));

let nextId = 0;

describe("TerminalPanel", () => {
  beforeEach(() => {
    nextId = 0;
    terminalInstances.length = 0;
    Reflect.set(window, "aureum", {
      terminal: {
        create: vi.fn().mockImplementation(async () => {
          nextId += 1;
          return { id: `terminal-${nextId}`, cwd: "/tmp/project", shell: "zsh" };
        }),
        write: vi.fn().mockResolvedValue(undefined),
        resize: vi.fn().mockResolvedValue(undefined),
        kill: vi.fn().mockResolvedValue(undefined),
        onOutput: vi.fn().mockReturnValue(vi.fn()),
        onExit: vi.fn().mockReturnValue(vi.fn()),
      },
    });
  });

  it("creates independent terminal tabs without killing previous sessions", async () => {
    render(<TerminalPanel />);
    await waitFor(() => expect(window.aureum.terminal.create).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "New terminal" }));
    await waitFor(() => expect(window.aureum.terminal.create).toHaveBeenCalledTimes(2));

    expect(window.aureum.terminal.kill).not.toHaveBeenCalled();
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    expect(screen.getByRole("tab", { name: /Terminal 2/ })).toHaveAttribute("aria-selected", "true");

    fireEvent.click(screen.getByRole("tab", { name: /Terminal 1/ }));
    expect(screen.getByRole("tab", { name: /Terminal 1/ })).toHaveAttribute("aria-selected", "true");
  });

  it("restarts and closes only the active terminal", async () => {
    render(<TerminalPanel />);
    await waitFor(() => expect(window.aureum.terminal.create).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Restart terminal" }));
    await waitFor(() => expect(window.aureum.terminal.kill).toHaveBeenCalledWith("terminal-1"));
    await waitFor(() => expect(window.aureum.terminal.create).toHaveBeenCalledTimes(2));
    expect(screen.getAllByRole("tab")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Kill terminal" }));
    await waitFor(() => expect(window.aureum.terminal.kill).toHaveBeenCalledWith("terminal-2"));
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
  });
});
