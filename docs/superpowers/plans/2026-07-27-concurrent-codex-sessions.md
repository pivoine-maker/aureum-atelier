# Concurrent Codex Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run multiple isolated Codex chat sessions concurrently, remove the activity-rail badge, and always use the Codex CLI default model.

**Architecture:** Renderer sessions own all per-session UI state and consume IPC events routed by `sessionId`. The main process owns a map of child processes keyed by the same id, so starts, output, failures, and stops cannot affect another session. The Codex panel presents sessions as accessible tabs and removes all model-selection state and controls.

**Tech Stack:** React 19, TypeScript, Electron IPC, Node child processes, Testing Library, Vitest.

---

### Task 1: Lock down the routed IPC contract

**Files:**
- Modify: `src/shared/codex.test.ts`
- Modify: `src/shared/codex.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/test/setup.ts`

- [ ] Add type-level and parser-adjacent tests expecting `CodexStartRequest.sessionId`, `CodexRoutedEvent`, and no request model field.
- [ ] Run `npm test -- --run src/shared/codex.test.ts` and confirm the new contract fails before implementation.
- [ ] Define the routed event wrapper and session-aware start/stop API.
- [ ] Update preload and renderer test mocks to send and receive the routed structure.

### Task 2: Make the main service concurrent

**Files:**
- Modify: `src/main/codex/codexExecService.test.ts`
- Modify: `src/main/codex/codexExecService.ts`
- Modify: `src/main/ipc/codex.ts`

- [ ] Add failing tests for two simultaneous session ids, duplicate start rejection for one id, independent close handling, and targeted stop.
- [ ] Run `npm test -- --run src/main/codex/codexExecService.test.ts` and confirm failures.
- [ ] Replace the single child-process field with `Map<string, SpawnedProcess>` and keep buffers inside each `start` call.
- [ ] Remove model argument handling so spawned commands never contain `--model`.
- [ ] Route IPC events and stop requests with their session ids.
- [ ] Re-run the focused service tests until they pass.

### Task 3: Move state into each renderer session

**Files:**
- Modify: `src/renderer/codex/useCodex.test.tsx`
- Modify: `src/renderer/codex/useCodex.ts`

- [ ] Add failing hook tests that run two sessions, switch while running, process interleaved routed events, stop one id, preserve per-session drafts/attachments, and normalize persisted running state.
- [ ] Replace global `isRunning`, `error`, `attachments`, and `model` state with fields on `CodexSession`.
- [ ] Add an id-based session updater and route every IPC event with `sessionId`.
- [ ] Send `{ sessionId, prompt, approvalMode, threadId }` on start and `sessionId` on stop.
- [ ] Allow new/select session during background execution; prevent deletion or re-submission only for the affected running session.
- [ ] Re-run hook tests until they pass.

### Task 4: Add session tabs and remove model controls

**Files:**
- Modify: `src/renderer/components/CodexPanel.test.tsx`
- Modify: `src/renderer/components/CodexPanel.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/styles/app.css`

- [ ] Add failing component tests for accessible tabs, running indicators, new-session availability during background work, targeted stop, per-session draft changes, and absence of a model picker.
- [ ] Render a compact tab strip using the session array and active id.
- [ ] Bind composer value, attachments, error, status, send, and stop to the active session.
- [ ] Remove imports, props, local state, CSS, and controls related to model selection.
- [ ] Preserve the existing session actions menu for full titles and deletion.
- [ ] Re-run Codex panel and App tests until they pass.

### Task 5: Remove the activity badge

**Files:**
- Modify: `src/renderer/App.test.tsx`
- Modify: `src/renderer/components/Sidebar.tsx`
- Modify: `src/renderer/styles/app.css`

- [ ] Add an assertion that the Codex activity button contains no badge text or badge class.
- [ ] Remove the hard-coded `3` badge and its unused styling.
- [ ] Re-run `npm test -- --run src/renderer/App.test.tsx`.

### Task 6: Verify and commit

**Files:**
- Modify only if verification finds a scoped defect.

- [ ] Run `npm test -- --run`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build`.
- [ ] Confirm `release/` remains unchanged and ignored.
- [ ] Commit the implementation as `feat: support concurrent Codex sessions`.

Do not run Electron Builder or recreate DMG/ZIP artifacts for this iteration.
