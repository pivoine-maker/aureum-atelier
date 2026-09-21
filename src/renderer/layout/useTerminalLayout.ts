import { useCallback, useEffect, useState } from "react";

export const terminalLayoutStorageKey = "aureum.layout.terminal.v1";
export const defaultTerminalHeight = 220;
export const terminalHeightLimits = { min: 130, max: 640 } as const;

export function useTerminalLayout() {
  const [height, setHeight] = useState(loadTerminalHeight);

  useEffect(() => {
    try {
      window.localStorage?.setItem(terminalLayoutStorageKey, JSON.stringify({ height }));
    } catch {
      return;
    }
  }, [height]);

  const resize = useCallback((nextHeight: number) => {
    setHeight(clampTerminalHeight(nextHeight));
  }, []);

  const reset = useCallback(() => setHeight(defaultTerminalHeight), []);

  return { height, resize, reset };
}

function loadTerminalHeight(): number {
  try {
    const stored = JSON.parse(window.localStorage?.getItem(terminalLayoutStorageKey) ?? "null") as { height?: unknown } | null;
    return isValidTerminalHeight(stored?.height) ? stored.height : defaultTerminalHeight;
  } catch {
    return defaultTerminalHeight;
  }
}

function clampTerminalHeight(height: number): number {
  return Math.round(Math.min(terminalHeightLimits.max, Math.max(terminalHeightLimits.min, height)));
}

function isValidTerminalHeight(height: unknown): height is number {
  return typeof height === "number"
    && Number.isFinite(height)
    && height >= terminalHeightLimits.min
    && height <= terminalHeightLimits.max;
}
