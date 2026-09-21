import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TerminalResizeHandle } from "./TerminalResizeHandle";

describe("TerminalResizeHandle", () => {
  it("increases terminal height when dragged upward and resets on double click", () => {
    Object.defineProperty(window, "PointerEvent", {
      configurable: true,
      value: MouseEvent,
    });
    const onResize = vi.fn();
    const onReset = vi.fn();
    render(
      <TerminalResizeHandle
        max={560}
        min={130}
        onReset={onReset}
        onResize={onResize}
        value={220}
      />,
    );

    const handle = screen.getByRole("separator", { name: "Resize terminal height" });
    fireEvent.pointerDown(handle, { button: 0, clientY: 600, pointerId: 1 });
    fireEvent.pointerMove(window, { clientY: 540, pointerId: 1 });
    fireEvent.pointerUp(window, { clientY: 540, pointerId: 1 });

    expect(onResize).toHaveBeenCalledWith(280);
    expect(document.body).not.toHaveClass("terminal-resizing");

    fireEvent.doubleClick(handle);
    expect(onReset).toHaveBeenCalledOnce();
  });

  it("supports arrow keys and boundary shortcuts", () => {
    const onResize = vi.fn();
    render(
      <TerminalResizeHandle
        max={560}
        min={130}
        onReset={vi.fn()}
        onResize={onResize}
        value={220}
      />,
    );

    const handle = screen.getByRole("separator", { name: "Resize terminal height" });
    fireEvent.keyDown(handle, { key: "ArrowUp" });
    fireEvent.keyDown(handle, { key: "ArrowDown", shiftKey: true });
    fireEvent.keyDown(handle, { key: "Home" });
    fireEvent.keyDown(handle, { key: "End" });

    expect(onResize).toHaveBeenNthCalledWith(1, 236);
    expect(onResize).toHaveBeenNthCalledWith(2, 172);
    expect(onResize).toHaveBeenNthCalledWith(3, 130);
    expect(onResize).toHaveBeenNthCalledWith(4, 560);
  });
});
