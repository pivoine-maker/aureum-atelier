# Collapsible Workbench Panels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users independently close Explorer, editor/welcome, and Codex panels, then restore them from a permanent left activity rail without losing state.

**Architecture:** `App` owns a three-boolean visibility model and exposes semantic toggle callbacks to the existing panel components. The activity rail is separated from Explorer content and remains permanently mounted, while CSS Grid uses visibility classes to remove hidden panels and their separators without unmounting stateful editor, terminal, or Codex components.

**Tech Stack:** React 19, TypeScript, CSS Grid, Lucide React, Testing Library, Vitest, Electron.

---

### Task 1: Lock down panel visibility behavior

**Files:**
- Modify: `src/renderer/App.test.tsx`
- Modify: `src/renderer/workbenchLayout.test.ts`

- [ ] Add an application test that clicks `Close Explorer panel`, `Close Editor panel`, and `Close Codex panel`, verifies all three regions are hidden while the activity rail remains, then restores each panel through its `aria-pressed` activity button.
- [ ] Add assertions that Search and Codex activity actions restore their required panel before focusing the target input.
- [ ] Add CSS regression assertions for a permanent `activity-rail-shell`, per-panel hidden classes, and separator visibility rules.
- [ ] Run `npm test -- --run src/renderer/App.test.tsx src/renderer/workbenchLayout.test.ts` and confirm the new assertions fail before implementation.

### Task 2: Add the independent visibility model

**Files:**
- Modify: `src/renderer/App.tsx`

- [ ] Replace `sidebarCollapsed` with `{ explorer: true, editor: true, codex: true }` visibility state.
- [ ] Add `setPanelVisible` and `togglePanel` callbacks that change only one panel at a time.
- [ ] Make title-bar Explorer toggling, workspace search focus, and Codex composer focus restore the corresponding panel before focusing.
- [ ] Add visibility classes and `aria-hidden` values without conditionally unmounting `Sidebar`, `EditorPane`, or `CodexPanel`.
- [ ] Render resize handles only through visibility classes so the existing resize state remains intact.

### Task 3: Build the permanent activity rail

**Files:**
- Modify: `src/renderer/components/Sidebar.tsx`
- Modify: `src/renderer/components/EditorPane.tsx`
- Modify: `src/renderer/components/CodexPanel.tsx`

- [ ] Extend `Sidebar` props with panel visibility values, three toggle callbacks, and an Explorer close callback.
- [ ] Add Explorer, Editor, and Codex activity buttons with `aria-controls`, `aria-pressed`, visible active styling, and existing Explorer/Search/Source Control behavior preserved.
- [ ] Add `Close Explorer panel` to the Explorer heading.
- [ ] Add `onClosePanel` to `EditorPane` and render `Close Editor panel` in the tab bar.
- [ ] Add `onClosePanel` to `CodexPanel` and render `Close Codex panel` in the header actions.

### Task 4: Make the grid collapse cleanly

**Files:**
- Modify: `src/renderer/styles/app.css`

- [ ] Move the activity rail into its own fixed-width grid column and let Explorer content occupy a separate conditional column.
- [ ] Define per-panel hidden classes that remove the corresponding grid column visually while preserving mounted component state.
- [ ] Hide Explorer and Codex resize handles when either adjacent panel is closed.
- [ ] Ensure the no-panel state leaves only the rail, no dark workbench surface, and no inaccessible off-screen content.
- [ ] Preserve responsive compact-layout behavior and existing panel width custom properties.

### Task 5: Verify and package

**Files:**
- Modify only if verification finds a scoped defect.

- [ ] Run `npm test -- --run src/renderer/App.test.tsx src/renderer/workbenchLayout.test.ts`.
- [ ] Run `npm test -- --run` and confirm all suites pass.
- [ ] Run `npm run typecheck` and `npm run build`.
- [ ] Package with `npx electron-builder --mac dir`, restart the packaged app, close all three panels, and visually confirm the full artwork with only the left rail remaining.
- [ ] Refresh distribution artifacts with `npx electron-builder --mac dmg zip`.

The project has no Git metadata, so implementation will not create commits.
