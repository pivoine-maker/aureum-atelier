import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PanelResizeHandle } from "./PanelResizeHandle";

describe("PanelResizeHandle", () => {
  it("resizes from pointer movement and resets on double click", () => {
    Object.defineProperty(window, "PointerEvent", {
      configurable: true,
      value: MouseEvent,
    });
    const onResize = vi.fn();
    const onReset = vi.fn();
    render(
      <PanelResizeHandle
        ariaLabel="Resize Codex panel"
        direction={-1}
        max={560}
        min={292}
        onReset={onReset}
        onResize={onResize}
        value={354}
      />,
    );

    const handle = screen.getByRole("separator", { name: "Resize Codex panel" });
    fireEvent.pointerDown(handle, { button: 0, clientX: 900, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 840, pointerId: 1 });
    fireEvent.pointerUp(window, { clientX: 840, pointerId: 1 });

    expect(onResize).toHaveBeenCalledWith(414);
    expect(document.body).not.toHaveClass("panel-resizing");

    fireEvent.doubleClick(handle);
    expect(onReset).toHaveBeenCalledOnce();
  });

  it("supports Home and End keyboard bounds", () => {
    const onResize = vi.fn();
    render(
      <PanelResizeHandle
        ariaLabel="Resize Explorer panel"
        direction={1}
        max={420}
        min={220}
        onReset={vi.fn()}
        onResize={onResize}
        value={280}
      />,
    );

    const handle = screen.getByRole("separator", { name: "Resize Explorer panel" });
    fireEvent.keyDown(handle, { key: "Home" });
    fireEvent.keyDown(handle, { key: "End" });

    expect(onResize).toHaveBeenNthCalledWith(1, 220);
    expect(onResize).toHaveBeenNthCalledWith(2, 420);
  });
});
