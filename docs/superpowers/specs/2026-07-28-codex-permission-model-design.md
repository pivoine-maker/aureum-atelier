# Aureum Atelier Codex Permission Model

## Decision

Aureum Atelier runs Codex sessions with the same day-to-day permission posture as the local Codex desktop experience:

- Renderer security remains enabled with `contextIsolation: true`, `nodeIntegration: false`, and Chromium `sandbox: true`.
- The packaged app does not enable the macOS App Sandbox, because AA is a local IDE that must open arbitrary user-selected workspaces and launch developer tools.
- Every Codex session is launched through Codex `app-server` with `sandbox: "workspace-write"`.
- Every Codex session is launched through Codex `app-server` with `approvalPolicy: "on-request"` and `approvalsReviewer: "auto_review"`.
- Codex Guardian automatically approves low- and medium-risk actions; high- and critical-risk denials require explicit in-chat confirmation through `thread/approveGuardianDeniedAction`.
- AA never passes `--dangerously-bypass-approvals-and-sandbox`.

## Permission Boundaries

### Electron Renderer Sandbox

The renderer stays isolated from Node and OS APIs. All filesystem, terminal, Git, and Codex operations must continue to go through the preload bridge and main-process IPC handlers.

### Codex Execution Sandbox

`workspace-write` lets Codex read the working root and write inside the active workspace. Guardian reviews requests outside the default sandbox: routine low- and medium-risk actions proceed automatically, while high- and critical-risk actions request approval through the in-app chat panel before continuing.

AA also keeps the strict Session ↔ Workspace binding: a Codex session can only start when its stored workspace root matches the active workspace root.

### macOS System Permissions

macOS TCC permissions are separate from Codex's execution sandbox. Full Disk Access, Accessibility, Automation, Screen Recording, microphone, camera, and similar permissions cannot be inherited from ChatGPT/Codex and cannot be granted automatically by AA.

For stable permission persistence, distribution builds should eventually use Developer ID signing, Hardened Runtime, and notarization. The current local ad-hoc package may not retain macOS authorization identity across rebuilds.

## Follow-ups

- Add a Settings permissions panel that explains required macOS permissions and deep-links to System Settings where possible.
- Configure Developer ID signing and notarization before broad distribution.
