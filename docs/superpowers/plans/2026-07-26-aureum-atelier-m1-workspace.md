# Aureum Atelier M1 Workspace IDE Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the M0 visual shell into a functional local workspace IDE with secure directory opening, file tree browsing, file reading, file saving, Monaco editing, and ripgrep-backed search.

**Architecture:** Electron Main owns all filesystem and process access, Preload exposes a narrow typed workspace API, and React Renderer stores workspace UI state. The renderer never reads arbitrary paths directly; every workspace operation is validated against an opened workspace root in Main.

**Tech Stack:** Electron IPC, React, TypeScript, Monaco Editor, ripgrep child process integration, Vitest.

---

## File Structure

- `src/shared/workspace.ts`: shared workspace schemas, path types, and tree helpers.
- `src/shared/workspace.test.ts`: validates path containment and tree shaping helpers.
- `src/main/workspace/workspaceStore.ts`: main-process workspace root state and path guards.
- `src/main/workspace/workspaceStore.test.ts`: validates safe path resolution without Electron.
- `src/main/ipc/workspace.ts`: Electron IPC handlers for open dialog, tree, file read/write, and search.
- `src/preload/index.ts`: exposes typed workspace API.
- `src/renderer/workspace/useWorkspace.ts`: renderer state hook for opened root, tree, selected file, content, dirty state, and search.
- `src/renderer/components/Sidebar.tsx`: uses real tree and open folder actions.
- `src/renderer/components/EditorPane.tsx`: replaces mock editor with Monaco-backed editor.
- `src/renderer/components/SearchPanel.tsx`: displays search query and results.
- `src/renderer/App.tsx`: wires workspace hook into sidebar/editor/status.

## Task 1: Shared Workspace Types

**Files:**
- Create: `src/shared/workspace.ts`
- Create: `src/shared/workspace.test.ts`

- [ ] **Step 1: Write failing tests**

Test normalized tree sorting, file/dir node shape, and workspace-relative path display.

- [ ] **Step 2: Run RED**

Run: `npm test -- --run src/shared/workspace.test.ts`
Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement shared types/helpers**

Add `WorkspaceTreeNode`, `WorkspaceFile`, `SearchResult`, `sortWorkspaceNodes`, and `toDisplayPath`.

- [ ] **Step 4: Run GREEN**

Run: `npm test -- --run src/shared/workspace.test.ts`
Expected: PASS.

## Task 2: Main Workspace Store

**Files:**
- Create: `src/main/workspace/workspaceStore.ts`
- Create: `src/main/workspace/workspaceStore.test.ts`

- [ ] **Step 1: Write failing path safety tests**

Test that paths under the root resolve, `..` traversal is rejected, sibling prefix tricks are rejected, and root can be reset.

- [ ] **Step 2: Run RED**

Run: `npm test -- --run src/main/workspace/workspaceStore.test.ts`
Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement store and safe resolver**

Add `WorkspaceStore`, `setRoot`, `getRoot`, `clearRoot`, and `resolveInsideRoot`.

- [ ] **Step 4: Run GREEN**

Run: `npm test -- --run src/main/workspace/workspaceStore.test.ts`
Expected: PASS.

## Task 3: Workspace IPC

**Files:**
- Modify: `src/shared/ipc.ts`
- Create: `src/main/ipc/workspace.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/global.d.ts`

- [ ] **Step 1: Add workspace channel names**

Add channels for `open`, `getTree`, `readFile`, `writeFile`, and `search`.

- [ ] **Step 2: Implement main handlers**

Use Electron dialog for folder selection, Node fs for tree/read/write, and ripgrep when available for search.

- [ ] **Step 3: Expose preload methods**

Add `window.aureum.workspace.open`, `getTree`, `readFile`, `writeFile`, and `search`.

- [ ] **Step 4: Typecheck IPC**

Run: `npm run typecheck`
Expected: PASS.

## Task 4: Renderer Workspace State

**Files:**
- Create: `src/renderer/workspace/useWorkspace.ts`
- Create: `src/renderer/workspace/useWorkspace.test.tsx`

- [ ] **Step 1: Write failing hook tests**

Test open workspace loads tree, selecting file loads content, editing marks dirty, saving writes content and clears dirty.

- [ ] **Step 2: Run RED**

Run: `npm test -- --run src/renderer/workspace/useWorkspace.test.tsx`
Expected: FAIL because hook does not exist.

- [ ] **Step 3: Implement workspace hook**

Use injected `window.aureum.workspace` API and keep state local to M1.

- [ ] **Step 4: Run GREEN**

Run: `npm test -- --run src/renderer/workspace/useWorkspace.test.tsx`
Expected: PASS.

## Task 5: Real Sidebar And Editor

**Files:**
- Modify: `package.json`
- Modify: `src/renderer/components/Sidebar.tsx`
- Create: `src/renderer/components/EditorPane.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/styles/app.css`
- Modify: `src/renderer/App.test.tsx`

- [ ] **Step 1: Add Monaco dependency**

Run: `npm install @monaco-editor/react monaco-editor`
Expected: dependencies install.

- [ ] **Step 2: Update App test for functional workspace controls**

Assert Open Workspace button, Save button, editor region, and fallback empty state render.

- [ ] **Step 3: Run RED if components not yet updated**

Run: `npm test -- --run src/renderer/App.test.tsx`
Expected: FAIL until real controls are wired.

- [ ] **Step 4: Implement real UI wiring**

Replace mock editor with Monaco pane and make Sidebar render real tree when available.

- [ ] **Step 5: Run GREEN**

Run: `npm test -- --run src/renderer/App.test.tsx`
Expected: PASS.

## Task 6: Verification

**Files:**
- Modify: `docs/superpowers/plans/2026-07-26-aureum-atelier-m1-workspace.md`

- [ ] **Step 1: Run all tests**

Run: `npm test -- --run`
Expected: all tests pass.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: no TypeScript errors.

- [ ] **Step 3: Run production build**

Run: `npm run build`
Expected: Electron bundles build.

- [ ] **Step 4: Capture preview**

Run: `./node_modules/.bin/electron scripts/capture-preview.cjs`
Expected: `artifacts/m0-preview.png` is regenerated without preload or IPC errors.

## Self-Review

- Spec coverage: M1 covers local workspace opening, file tree, editor read/write, and search foundation. Git, Codex app-server, terminal, and packaging remain future milestones.
- Placeholder scan: no placeholder instructions are present.
- Type consistency: Workspace node, file, and search result shapes are shared across main, preload, and renderer.
