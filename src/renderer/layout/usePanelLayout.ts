import { useCallback, useEffect, useState } from "react";

export type ResizablePanel = "explorer" | "codex";

export type PanelLayout = {
  explorerWidth: number;
  codexWidth: number;
};

export const panelLayoutStorageKey = "aureum.layout.panels.v1";

export const defaultPanelLayout: PanelLayout = {
  explorerWidth: 280,
  codexWidth: 354,
};

export const panelWidthLimits = {
  explorer: { min: 220, max: 420 },
  codex: { min: 292, max: 560 },
} as const;

export function usePanelLayout() {
  const [layout, setLayout] = useState<PanelLayout>(loadPanelLayout);

  useEffect(() => {
    try {
      window.localStorage?.setItem(panelLayoutStorageKey, JSON.stringify(layout));
    } catch {
      return;
    }
  }, [layout]);

  const resizePanel = useCallback((panel: ResizablePanel, width: number) => {
    setLayout((current) => ({
      ...current,
      [panelWidthKey(panel)]: clampPanelWidth(panel, width),
    }));
  }, []);

  const adjustPanel = useCallback((panel: ResizablePanel, delta: number) => {
    setLayout((current) => ({
      ...current,
      [panelWidthKey(panel)]: clampPanelWidth(panel, current[panelWidthKey(panel)] + delta),
    }));
  }, []);

  const resetPanel = useCallback((panel: ResizablePanel) => {
    setLayout((current) => ({
      ...current,
      [panelWidthKey(panel)]: defaultPanelLayout[panelWidthKey(panel)],
    }));
  }, []);

  return { layout, resizePanel, adjustPanel, resetPanel };
}

function loadPanelLayout(): PanelLayout {
  try {
    const stored = JSON.parse(window.localStorage?.getItem(panelLayoutStorageKey) ?? "null") as Partial<PanelLayout> | null;
    if (!stored || !isValidPanelWidth("explorer", stored.explorerWidth) || !isValidPanelWidth("codex", stored.codexWidth)) {
      return defaultPanelLayout;
    }
    return { explorerWidth: stored.explorerWidth, codexWidth: stored.codexWidth };
  } catch {
    return defaultPanelLayout;
  }
}

function panelWidthKey(panel: ResizablePanel): keyof PanelLayout {
  return panel === "explorer" ? "explorerWidth" : "codexWidth";
}

function clampPanelWidth(panel: ResizablePanel, width: number): number {
  const limits = panelWidthLimits[panel];
  return Math.round(Math.min(limits.max, Math.max(limits.min, width)));
}

function isValidPanelWidth(panel: ResizablePanel, width: unknown): width is number {
  if (typeof width !== "number" || !Number.isFinite(width)) return false;
  const limits = panelWidthLimits[panel];
  return width >= limits.min && width <= limits.max;
}
