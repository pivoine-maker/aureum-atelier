import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import {
  defaultTerminalHeight,
  terminalHeightLimits,
  terminalLayoutStorageKey,
  useTerminalLayout,
} from "./useTerminalLayout";

describe("useTerminalLayout", () => {
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

  it("restores a persisted terminal height and rejects invalid values", () => {
    storage.set(terminalLayoutStorageKey, JSON.stringify({ height: 318 }));
    const persisted = renderHook(() => useTerminalLayout());
    expect(persisted.result.current.height).toBe(318);
    persisted.unmount();

    storage.set(terminalLayoutStorageKey, JSON.stringify({ height: 9999 }));
    const fallback = renderHook(() => useTerminalLayout());
    expect(fallback.result.current.height).toBe(defaultTerminalHeight);
  });

  it("clamps, persists, and resets the terminal height", () => {
    const { result } = renderHook(() => useTerminalLayout());

    act(() => result.current.resize(9999));
    expect(result.current.height).toBe(terminalHeightLimits.max);
    expect(JSON.parse(storage.get(terminalLayoutStorageKey)!)).toEqual({ height: terminalHeightLimits.max });

    act(() => result.current.resize(-9999));
    expect(result.current.height).toBe(terminalHeightLimits.min);

    act(() => result.current.reset());
    expect(result.current.height).toBe(defaultTerminalHeight);
  });
});
