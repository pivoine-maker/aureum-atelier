# Workspace-Bound Sessions and Home Directory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strictly isolate Codex sessions by workspace and make large Home directories open through lazy, fault-tolerant tree loading.

**Architecture:** Keep one persisted renderer session store, but add required workspace identity and derive the visible/active collection from the current workspace. Add a renderer and main-process execution guard for workspace equality. Replace recursive workspace reads with one-level IPC reads that are merged into the renderer tree on expansion.

**Tech Stack:** Electron IPC, React hooks, TypeScript, Vitest, Testing Library, electron-builder.

---

### Task 1: Workspace-Bound Session State

**Files:**
- Modify: `src/renderer/codex/useCodex.ts`
- Test: `src/renderer/codex/useCodex.test.tsx`

- [ ] Add failing hook tests that open two workspace roots and prove each root sees only its own sessions and restores its own active tab.
- [ ] Add a failing migration test that loads legacy sessions without workspace fields and binds all of them to the first restored workspace.
- [ ] Run `npm test -- --run src/renderer/codex/useCodex.test.tsx` and confirm the new tests fail because `useCodex` has no workspace arguments.
- [ ] Add `workspaceRoot` and `workspaceName` to `CodexSession`, accept current workspace identity in `useCodex`, maintain active ids per root, and filter all panel-facing data.
- [ ] Persist `activeSessionIdsByWorkspace`; retain legacy records until the first workspace is available, then migrate once.
- [ ] Run the focused hook tests and commit with `feat: bind Codex sessions to workspaces`.

### Task 2: Strict Execution Guard and Panel Wiring

**Files:**
- Modify: `src/shared/codex.ts`
- Modify: `src/main/ipc/codex.ts`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/components/CodexPanel.tsx`
- Test: `src/main/ipc/codex.test.ts`
- Test: `src/renderer/App.test.tsx`
- Test: `src/renderer/components/CodexPanel.test.tsx`

- [ ] Add a failing IPC test proving a mismatched `workspaceRoot` does not call `codexExecService.start`.
- [ ] Add failing UI tests for a workspace-required empty state and disabled composer controls when no workspace is open.
- [ ] Pass workspace identity into `useCodex`, include `workspaceRoot` in `CodexStartRequest`, and validate it against `workspaceStore.getRoot()` before spawn.
- [ ] Disable new session, attachment, composer, and send behavior without an active workspace while preserving hidden background sessions.
- [ ] Run the focused IPC, App, and component tests and commit with `fix: guard Codex workspace execution`.

### Task 3: One-Level Workspace Directory API

**Files:**
- Modify: `src/shared/ipc.ts`
- Modify: `src/shared/workspace.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/main/ipc/workspace.ts`
- Test: `src/main/ipc/workspace.test.ts`
- Test: `src/shared/workspace.test.ts`

- [ ] Add failing tests proving workspace open reads only immediate children and unreadable nested directories do not fail the root.
- [ ] Add `workspace:readDirectory` and expose `workspace.readDirectory(path)` from preload.
- [ ] Replace recursive reads with a one-level reader that omits ignored, hidden, symbolic-link, and special entries and returns unloaded directories with `children: undefined`.
- [ ] Treat directory read failures as empty results while keeping invalid outside-root paths rejected.
- [ ] Decouple filename search from a recursively materialized tree and retain available ripgrep results for large roots.
- [ ] Run focused main/shared tests and commit with `feat: lazily read workspace directories`.

### Task 4: Explorer Lazy Expansion

**Files:**
- Modify: `src/renderer/workspace/useWorkspace.ts`
- Modify: `src/renderer/components/Sidebar.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/styles.css`
- Test: `src/renderer/workspace/useWorkspace.test.tsx`
- Test: `src/renderer/App.test.tsx`

- [ ] Add failing hook tests for one-time expansion merging, inaccessible empty directories, and stale response rejection after workspace switching.
- [ ] Add failing UI coverage that clicks an unloaded folder and observes its loaded children.
- [ ] Implement `expandDirectory(path)` with per-path loading state and immutable tree merging scoped to the root that initiated the request.
- [ ] Make directory nodes collapsed by default, load on first expansion, expose `aria-busy`, and reuse loaded children on later expansion.
- [ ] Add row overflow/truncation styles so long Home-directory entries remain stable and non-overlapping.
- [ ] Run focused renderer tests and commit with `feat: lazily expand Explorer folders`.

### Task 5: Verification and Distribution

**Files:**
- Verify: all changed files
- Build output: `release/Aureum-Atelier-0.1.0-arm64.dmg`
- Build output: `release/Aureum-Atelier-0.1.0-arm64.zip`

- [ ] Run `git diff --check` and `npm run verify`.
- [ ] Launch the packaged application with a minimal GUI-like PATH and an isolated data directory.
- [ ] Open `/Users/you`, expand multiple first-level directories, switch to another workspace, and verify separate Codex session lists.
- [ ] Send a Codex prompt from the owning workspace and verify a completed response without cross-workspace execution.
- [ ] Run `npm run dist:mac`, `hdiutil verify`, and `unzip -tq`.
- [ ] Record SHA-256 hashes, confirm a clean Git status, and report the new commits and installer paths.
