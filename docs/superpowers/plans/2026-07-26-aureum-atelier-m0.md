# Aureum Atelier M0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first runnable Aureum Atelier desktop shell with a gilded React UI, deterministic daily artwork rotation, typed Electron IPC, and automated tests.

**Architecture:** The app uses Electron Main for window/process control, Preload for a narrow typed IPC bridge, and React Renderer for the IDE shell. The M0 scope intentionally avoids Codex, Monaco, terminal, and Git implementation; it creates the stable shell and visual/artwork foundation those later milestones will reuse.

**Tech Stack:** Electron, React, TypeScript, Vite, Vitest, Testing Library, Zod, CSS custom properties.

---

## File Structure

- `package.json`: root npm scripts and dependencies.
- `tsconfig.json`: shared TypeScript strict settings.
- `tsconfig.node.json`: Electron/Vite config compilation settings.
- `index.html`: renderer mount document.
- `vite.config.ts`: renderer build and Vitest config.
- `electron.vite.config.ts`: Electron main/preload build config.
- `src/main/index.ts`: creates the BrowserWindow and handles app lifecycle.
- `src/main/ipc/settings.ts`: validates and returns initial app settings.
- `src/main/ipc/artwork.ts`: exposes today's artwork through IPC.
- `src/preload/index.ts`: exposes `window.aureum` typed APIs.
- `src/shared/artwork.ts`: artwork schema, fallback library, deterministic picker.
- `src/shared/settings.ts`: settings schema and defaults.
- `src/shared/theme.ts`: theme mode types and labels.
- `src/renderer/main.tsx`: React entrypoint.
- `src/renderer/App.tsx`: M0 IDE shell composition.
- `src/renderer/components/*`: focused shell UI components.
- `src/renderer/styles/*.css`: global, theme token, and component styles.
- `src/**/*.test.ts(x)`: unit/component tests.

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `index.html`
- Create: `vite.config.ts`
- Create: `electron.vite.config.ts`
- Create: `.gitignore`

- [ ] **Step 1: Create npm/Electron scaffold files**

Use npm workspaces later if needed; M0 stays single-package for speed.

- [ ] **Step 2: Install dependencies**

Run: `npm install`
Expected: dependencies install and `package-lock.json` is created.

- [ ] **Step 3: Verify TypeScript config loads**

Run: `npm run typecheck`
Expected: initially fails until source files exist; after Task 2 it passes.

## Task 2: Shared Settings And Theme Types

**Files:**
- Create: `src/shared/theme.ts`
- Create: `src/shared/settings.ts`
- Create: `src/shared/settings.test.ts`

- [ ] **Step 1: Write failing settings tests**

Tests assert default mode is `atelier`, intensity is clamped through schema validation, and labels exist for all modes.

- [ ] **Step 2: Run settings tests and verify RED**

Run: `npm test -- src/shared/settings.test.ts`
Expected: FAIL because modules do not exist.

- [ ] **Step 3: Implement theme and settings modules**

Add `ThemeMode`, `themeModeLabels`, `SettingsSchema`, `defaultSettings`, and `parseSettings`.

- [ ] **Step 4: Run settings tests and verify GREEN**

Run: `npm test -- src/shared/settings.test.ts`
Expected: PASS.

## Task 3: Daily Artwork Foundation

**Files:**
- Create: `src/shared/artwork.ts`
- Create: `src/shared/artwork.test.ts`

- [ ] **Step 1: Write failing artwork tests**

Tests assert deterministic same-day selection, different-day rotation, movement filtering, skipped ID handling, and fallback behavior.

- [ ] **Step 2: Run artwork tests and verify RED**

Run: `npm test -- src/shared/artwork.test.ts`
Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement artwork schema and picker**

Add public-domain fallback records and `pickDailyArtwork(date, library, preferences)`.

- [ ] **Step 4: Run artwork tests and verify GREEN**

Run: `npm test -- src/shared/artwork.test.ts`
Expected: PASS.

## Task 4: Typed Electron IPC

**Files:**
- Create: `src/main/ipc/settings.ts`
- Create: `src/main/ipc/artwork.ts`
- Create: `src/preload/index.ts`
- Create: `src/preload/global.d.ts`

- [ ] **Step 1: Add main-process IPC handlers**

Register `settings:getInitial` and `artwork:getToday` handlers.

- [ ] **Step 2: Add preload bridge**

Expose `window.aureum.settings.getInitial()` and `window.aureum.artwork.getToday()`.

- [ ] **Step 3: Typecheck IPC boundary**

Run: `npm run typecheck`
Expected: PASS after renderer files exist in Task 5.

## Task 5: React Shell And Design System

**Files:**
- Create: `src/renderer/main.tsx`
- Create: `src/renderer/App.tsx`
- Create: `src/renderer/components/ArtworkBackdrop.tsx`
- Create: `src/renderer/components/Sidebar.tsx`
- Create: `src/renderer/components/EditorMock.tsx`
- Create: `src/renderer/components/CodexPanelMock.tsx`
- Create: `src/renderer/components/StatusBar.tsx`
- Create: `src/renderer/App.test.tsx`
- Create: `src/renderer/styles/tokens.css`
- Create: `src/renderer/styles/global.css`
- Create: `src/renderer/styles/app.css`

- [ ] **Step 1: Write failing App test**

Test renders through a mocked `window.aureum` API and asserts app title, today's artwork, mode buttons, shell regions, and status metadata.

- [ ] **Step 2: Run App test and verify RED**

Run: `npm test -- src/renderer/App.test.tsx`
Expected: FAIL because App does not exist.

- [ ] **Step 3: Implement shell components**

Build static but realistic M0 layout with three theme modes and daily artwork background.

- [ ] **Step 4: Run App test and verify GREEN**

Run: `npm test -- src/renderer/App.test.tsx`
Expected: PASS.

## Task 6: Electron Main Window

**Files:**
- Create: `src/main/index.ts`

- [ ] **Step 1: Implement BrowserWindow creation**

Create secure BrowserWindow settings with `contextIsolation: true`, `nodeIntegration: false`, and preload path.

- [ ] **Step 2: Wire IPC handlers**

Call settings and artwork handler registration before creating the window.

- [ ] **Step 3: Build Electron bundles**

Run: `npm run build`
Expected: renderer, main, and preload bundles build successfully.

## Task 7: Verification

**Files:**
- Modify: `docs/superpowers/plans/2026-07-26-aureum-atelier-m0.md`

- [ ] **Step 1: Run all tests**

Run: `npm test -- --run`
Expected: all tests pass.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: no TypeScript errors.

- [ ] **Step 3: Run production build**

Run: `npm run build`
Expected: Electron and renderer bundles build.

- [ ] **Step 4: Inspect project status**

Run: `git status --short`
Expected: new M0 project files listed.

## Self-Review

- Spec coverage: M0 covers app shell, secure IPC, visual modes, design token foundation, and deterministic artwork foundation. Workspace IDE, Codex, terminal, Git, source adapters, and packaging remain in M1-M4 by design.
- Placeholder scan: no TODO/TBD/FIXME placeholders are used as implementation instructions.
- Type consistency: `ThemeMode`, `AureumSettings`, `Artwork`, and `pickDailyArtwork` are defined before renderer usage.
