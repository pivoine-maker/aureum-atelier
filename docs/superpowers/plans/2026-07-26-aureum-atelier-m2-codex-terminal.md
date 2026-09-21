# Aureum Atelier M2 Codex And Terminal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a functional Codex prompt stream and integrated terminal to the workspace IDE.

**Architecture:** Electron Main supervises one Codex JSONL child process and PTY sessions. Preload forwards typed commands and events. Renderer hooks convert JSONL events and PTY bytes into UI state without exposing Node APIs.

**Tech Stack:** Codex CLI `exec --json`, Electron IPC, node-pty, xterm.js, React hooks, Vitest.

---

## Task 1: Codex Event Parser

- Create `src/shared/codex.ts` and `src/shared/codex.test.ts`.
- Test parsing assistant deltas, command/tool events, final messages, malformed lines, and process status.
- Implement a small UI-focused event model independent of raw Codex versions.

## Task 2: Codex Main Bridge

- Add Codex IPC channels in `src/shared/ipc.ts`.
- Create `src/main/codex/codexExecService.ts` and tests for lifecycle state.
- Create `src/main/ipc/codex.ts` to start/stop `codex exec --json -C <workspace>` and broadcast events.
- Expose typed preload methods and event subscription.

## Task 3: Codex Renderer Hook

- Create `src/renderer/codex/useCodex.ts` and hook tests.
- Support prompt submission, streamed events, busy/error state, and stop.
- Replace `CodexPanelMock` with a functional panel that displays messages and events.

## Task 4: PTY Terminal

- Install `node-pty`, `@xterm/xterm`, and `@xterm/addon-fit`.
- Add terminal IPC channels and `src/main/ipc/terminal.ts`.
- Add preload terminal API with create/write/resize/kill and output subscription.
- Create `TerminalPanel.tsx` using xterm.js and fit addon.

## Task 5: Verification

- Run all Vitest tests.
- Run TypeScript typecheck.
- Run Electron production build.
- Capture a real Electron preview without CSP, preload, or runtime errors.
