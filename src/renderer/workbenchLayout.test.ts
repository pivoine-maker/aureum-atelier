import { describe, expect, it } from "vitest";

import appStyles from "./styles/app.css?raw";
import tokenStyles from "./styles/tokens.css?raw";

describe("workbench panel placement", () => {
  it("keeps the titlebar brand clear of native macOS traffic lights", () => {
    expect(appStyles).toMatch(/\.brand\s*\{[^}]*margin-left:\s*64px;/s);
  });

  it("keeps the daily artwork visible in every focus mode", () => {
    expect(appStyles).not.toMatch(/\.artwork-backdrop--monastic\s+\.artwork-backdrop__image\s*\{[^}]*opacity:\s*0\s*;/s);
  });

  it("keeps gallery surfaces translucent enough to reveal the painting", () => {
    const galleryTokens = tokenStyles.match(/\.theme-gallery\s*\{([^}]*)\}/s)?.[1] ?? "";
    const panelOpacity = Number(galleryTokens.match(/--panel-opacity:\s*([\d.]+)/)?.[1]);
    const editorOpacity = Number(galleryTokens.match(/--editor-opacity:\s*([\d.]+)/)?.[1]);

    expect(panelOpacity).toBe(0.1);
    expect(editorOpacity).toBe(0.1);
    expect(appStyles).toMatch(/\.artwork-backdrop--gallery\s+\.artwork-backdrop__image\s*\{[^}]*opacity:/s);
  });

  it("keeps focus modes translucent instead of replacing the painting with black", () => {
    const atelierTokens = tokenStyles.match(/\.theme-atelier\s*\{([^}]*)\}/s)?.[1] ?? "";
    const monasticTokens = tokenStyles.match(/\.theme-monastic\s*\{([^}]*)\}/s)?.[1] ?? "";
    const token = (styles: string, name: string) => Number(styles.match(new RegExp(`${name}:\\s*([\\d.]+)`))?.[1]);

    expect(token(atelierTokens, "--panel-opacity")).toBeLessThanOrEqual(0.72);
    expect(token(atelierTokens, "--editor-opacity")).toBeLessThanOrEqual(0.78);
    expect(token(monasticTokens, "--panel-opacity")).toBeLessThanOrEqual(0.7);
    expect(token(monasticTokens, "--editor-opacity")).toBeLessThanOrEqual(0.72);
    expect(appStyles).toMatch(/\.artwork-backdrop--monastic\s+\.artwork-backdrop__image\s*\{[^}]*opacity:\s*calc\(0\.[7-9]/s);
  });

  it("pins the permanent activity rail and panels to stable grid columns", () => {
    expect(appStyles).toMatch(/\.activity-rail-shell\s*\{[^}]*grid-column:\s*1;/s);
    expect(appStyles).toMatch(/\.sidebar\s*\{[^}]*grid-column:\s*2;/s);
    expect(appStyles).toMatch(/\.panel-resize-handle--explorer\s*\{[^}]*grid-column:\s*3;/s);
    expect(appStyles).toMatch(/\.editor-workspace\s*\{[^}]*grid-column:\s*4;/s);
    expect(appStyles).toMatch(/\.panel-resize-handle--codex\s*\{[^}]*grid-column:\s*5;/s);
    expect(appStyles).toMatch(/\.codex-panel\s*\{[^}]*grid-column:\s*6;/s);
  });

  it("allocates a dedicated horizontal drag track above the terminal", () => {
    expect(appStyles).toMatch(/\.editor-content-stack\s*\{[^}]*--terminal-height:[^}]*grid-template-rows:[^}]*6px[^}]*var\(--terminal-height\)/s);
    expect(appStyles).toMatch(/\.terminal-resize-handle\s*\{[^}]*cursor:\s*row-resize/s);
  });

  it("removes hidden panel tracks and their adjacent resize handles", () => {
    expect(appStyles).toMatch(/grid-template-columns:\s*41px\s+var\(--explorer-track[^;]+var\(--codex-track[^;]+;/s);
    expect(appStyles).toMatch(/\.panel-explorer-hidden\s+\.panel-resize-handle--explorer[^}]*display:\s*none/s);
    expect(appStyles).toMatch(/\.panel-editor-hidden\s+\.panel-resize-handle[^}]*display:\s*none/s);
    expect(appStyles).toMatch(/\.panel-codex-hidden\s+\.panel-resize-handle--codex[^}]*display:\s*none/s);
    expect(appStyles).toMatch(/\.workbench-panels-hidden\s+\.workbench[^}]*--explorer-track:\s*0px/s);
    expect(appStyles).toMatch(/\.panel-only-explorer\s+\.workbench[^}]*--explorer-track:\s*minmax\(0,\s*1fr\)/s);
    expect(appStyles).toMatch(/\.panel-only-codex\s+\.workbench[^}]*--codex-track:\s*minmax\(0,\s*1fr\)/s);
  });

  it("keeps the activity rail visible on compact layouts", () => {
    const compactStyles = appStyles.match(/@media \(max-width:\s*720px\)\s*\{([\s\S]*?)@media \(prefers-reduced-motion/s)?.[1] ?? "";

    expect(compactStyles).toMatch(/\.workbench\s*\{[^}]*--editor-track:\s*minmax\(0,\s*1fr\)/s);
    expect(compactStyles).not.toMatch(/\.activity-rail-shell[^}]*display:\s*none/s);
    expect(compactStyles).toMatch(/\.sidebar\s*\{[^}]*position:\s*absolute/s);
  });
});
