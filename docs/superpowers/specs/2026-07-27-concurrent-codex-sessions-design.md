# Concurrent Codex Sessions Design

## Scope

- Remove the hard-coded red `3` badge from the Codex activity-rail icon.
- Allow multiple Codex sessions to run concurrently inside the existing right-hand Codex panel.
- Keep each session's messages, attachments, error, running state, and CLI thread id isolated.
- Remove user-facing model selection and always execute through the Codex CLI default model.
- Keep the current panel collapsing, Markdown rendering, workspace permissions, and local session persistence behavior.

## Session Interaction

- Add a compact session tab strip below the Codex header.
- Each tab shows its title and a state indicator: ready, running, failed, or completed.
- A plus button creates and activates a new session even while other sessions are running.
- Selecting a tab switches immediately even while that or another session is running.
- Each session has its own composer draft and attachments so switching sessions does not discard prepared input.
- The active session's composer is disabled only while that same session is running.
- Stop terminates only the active session's process.
- Deleting a running session is disabled; ready or completed sessions can be deleted.
- The existing session actions menu remains available for longer recent-session titles and deletion controls.

## Renderer State

Extend each persisted `CodexSession` with:

```ts
type CodexSessionStatus = "ready" | "running" | "failed" | "completed";

type CodexSession = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: CodexMessage[];
  attachments: CodexAttachment[];
  draft: string;
  status: CodexSessionStatus;
  error: string | null;
  threadId?: string;
};
```

- Persist messages, attachments, drafts, status, errors, and thread ids under the existing local-storage key.
- On application restore, normalize a persisted `running` status to `ready` because its process cannot survive an app restart.
- Route every incoming event by `sessionId`; never use the currently selected session as the destination for asynchronous output.
- Submitting in an already running session is ignored, while other sessions remain independently submit-capable.

## IPC Contract

```ts
type CodexStartRequest = {
  sessionId: string;
  prompt: string;
  approvalMode: "workspace-write";
  threadId?: string;
};

type CodexRoutedEvent = {
  sessionId: string;
  event: CodexUiEvent;
};
```

- `codex:start` receives `sessionId` and always uses the CLI default model by omitting `--model`.
- `codex:stop` receives a `sessionId` string.
- `codex:event` sends `{ sessionId, event }` to the renderer.

## Main Process Isolation

- Replace the single `activeProcess` field with `Map<string, SpawnedProcess>`.
- Reject a second start only when the same `sessionId` already has an active process.
- Allow starts for different session ids without terminating or blocking existing processes.
- Keep stdout buffers, stderr buffers, terminal events, and event callbacks scoped to each invocation.
- On close or error, remove only the matching process entry.
- `stop(sessionId)` sends `SIGTERM` only to that process and emits no synthetic completion for unrelated sessions.
- `isRunning(sessionId)` reports a single session; `runningCount()` supports service-level verification.

## Default Model

- Remove `codexModels`, `CodexModel`, `model`, `setModel`, `onSetModel`, and the model menu from renderer-facing code.
- Do not include a `model` property in `CodexStartRequest`.
- Do not add a `--model` CLI argument; the installed Codex configuration chooses the default model.

## Accessibility and Visual State

- Session tabs use `role="tablist"` and `role="tab"` with `aria-selected`.
- New, close, and stop buttons retain explicit accessible names.
- Running indicators do not rely on color alone; tabs include a visible status label or accessible title.
- The activity rail contains no numeric badge when idle or running.

## Verification

- Hook tests start two sessions, deliver interleaved routed events, and verify messages/status remain isolated.
- Hook tests stop one session and verify the other remains running.
- Service tests run two child processes concurrently, reject duplicate starts for one id, and stop by id.
- Component tests verify session tabs, per-session running controls, and absence of the model picker.
- App tests verify the Codex activity icon has no badge.
- Run the full test suite, typecheck, and production build; do not rebuild DMG/ZIP for this iteration.
