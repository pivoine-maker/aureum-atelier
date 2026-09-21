import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import {
  defaultPanelLayout,
  panelLayoutStorageKey,
  panelWidthLimits,
  usePanelLayout,
} from "./usePanelLayout";

describe("usePanelLayout", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    });
  });

  it("restores valid persisted widths and falls back for invalid values", () => {
    storage.set(panelLayoutStorageKey, JSON.stringify({ explorerWidth: 336, codexWidth: 428 }));
    const persisted = renderHook(() => usePanelLayout());

    expect(persisted.result.current.layout).toEqual({ explorerWidth: 336, codexWidth: 428 });
    persisted.unmount();

    storage.set(panelLayoutStorageKey, JSON.stringify({ explorerWidth: -20, codexWidth: "wide" }));
    const fallback = renderHook(() => usePanelLayout());
    expect(fallback.result.current.layout).toEqual(defaultPanelLayout);
  });

  it("clamps resized panels and persists the result", () => {
    const { result } = renderHook(() => usePanelLayout());

    act(() => result.current.resizePanel("explorer", 9999));
    act(() => result.current.resizePanel("codex", -9999));

    expect(result.current.layout).toEqual({
      explorerWidth: panelWidthLimits.explorer.max,
      codexWidth: panelWidthLimits.codex.min,
    });
    expect(JSON.parse(storage.get(panelLayoutStorageKey)!)).toEqual(result.current.layout);
  });

  it("adjusts with keyboard-sized deltas and resets individual panels", () => {
    const { result } = renderHook(() => usePanelLayout());

    act(() => result.current.adjustPanel("explorer", 16));
    act(() => result.current.adjustPanel("codex", 48));
    expect(result.current.layout).toEqual({
      explorerWidth: defaultPanelLayout.explorerWidth + 16,
      codexWidth: defaultPanelLayout.codexWidth + 48,
    });

    act(() => result.current.resetPanel("explorer"));
    expect(result.current.layout.explorerWidth).toBe(defaultPanelLayout.explorerWidth);
  });
});
