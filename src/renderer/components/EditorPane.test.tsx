import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { WorkspaceFile } from "../../shared/workspace";
import { EditorPane } from "./EditorPane";

vi.mock("@monaco-editor/react", () => ({
  default: ({ value }: { value: string }) => <div data-testid="monaco-editor">{value}</div>,
}));
vi.mock("./TerminalPanel", () => ({ TerminalPanel: () => <div data-testid="terminal-panel" /> }));

const files: WorkspaceFile[] = [
  { path: "src/App.tsx", content: "export const app = true", language: "typescript", kind: "text" },
  { path: "README.md", content: "# Aureum\n\n- Golden workspace", language: "markdown", kind: "markdown" },
];

describe("EditorPane", () => {
  it("renders switchable and closable editor tabs", () => {
    const activate = vi.fn();
    const close = vi.fn();
    render(
      <EditorPane
        activeFile={files[0]}
        activePath={files[0].path}
        dirtyPaths={new Set([files[1].path])}
        isBusy={false}
        onActivateFile={activate}
        onChange={vi.fn()}
        onCloseFile={close}
        onOpenWorkspace={vi.fn()}
        onSave={vi.fn()}
        openFiles={files}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: /README.md/ }));
    expect(activate).toHaveBeenCalledWith("README.md");
    fireEvent.click(screen.getByRole("button", { name: "Close README.md" }));
    expect(close).toHaveBeenCalledWith("README.md");
  });

  it("renders markdown as a safe structured preview", () => {
    render(
      <EditorPane
        activeFile={files[1]}
        activePath={files[1].path}
        dirtyPaths={new Set()}
        isBusy={false}
        onActivateFile={vi.fn()}
        onChange={vi.fn()}
        onCloseFile={vi.fn()}
        onOpenWorkspace={vi.fn()}
        onSave={vi.fn()}
        openFiles={[files[1]]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Preview Markdown" }));
    expect(screen.getByRole("heading", { name: "Aureum" })).toBeInTheDocument();
    expect(screen.getByText("Golden workspace")).toBeInTheDocument();
  });

  it("places an adjustable separator between the welcome area and terminal", () => {
    render(
      <EditorPane
        activeFile={null}
        activePath={null}
        dirtyPaths={new Set()}
        isBusy={false}
        onActivateFile={vi.fn()}
        onChange={vi.fn()}
        onCloseFile={vi.fn()}
        onOpenWorkspace={vi.fn()}
        onSave={vi.fn()}
        openFiles={[]}
      />,
    );

    expect(screen.getByRole("separator", { name: "Resize terminal height" })).toBeInTheDocument();
  });
});
