# Workspace-Bound Sessions and Home Directory Design

## Scope

- Bind every Codex session to exactly one workspace root.
- Show and activate only sessions belonging to the currently open workspace.
- Prevent a session from executing if its recorded workspace no longer matches the active main-process workspace.
- Migrate the existing global session collection once to the workspace restored when the application upgrades.
- Make large roots such as `/Users/you` open reliably by replacing eager recursive tree scans with lazy directory loading.
- Preserve concurrent Codex execution, session persistence, attachments, Markdown output, editor behavior, and existing visual styling.

## Workspace-Bound Session Model

Extend each persisted session with required workspace identity:

```ts
type CodexSession = {
  id: string;
  workspaceRoot: string;
  workspaceName: string;
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

- `workspaceRoot` is the canonical absolute root returned by the main process.
- `workspaceName` is display metadata only; equality and execution checks use `workspaceRoot`.
- The Codex hook receives `workspaceRoot` and `workspaceName` from the workspace hook.
- The panel derives a filtered session list for the active root and never exposes sessions from another root.
- Each workspace stores its own last active session id so switching back restores the previous tab.
- Opening a workspace with no sessions creates and activates one empty session for that workspace.
- With no workspace open, the panel has no active session, shows a workspace-required empty state, and disables composing, attachments, new-session creation, and sending.

## Switching and Background Execution

- Switching workspaces does not stop sessions that are already running in another workspace.
- Routed main-process events continue updating the owning session by global session id even while it is filtered out of the current panel.
- The running count displayed in the current panel counts only sessions owned by the active workspace.
- Switching back exposes completed output and the prior active session for that workspace.
- Deleting and stopping operate only on sessions visible in the current workspace.

## Strict Execution Guard

Add `workspaceRoot` to `CodexStartRequest`.

- The renderer refuses submission unless the active session's root equals the current workspace root.
- The main-process IPC handler compares `request.workspaceRoot` to `workspaceStore.getRoot()` before spawning Codex.
- A mismatch fails with a clear error and no process is started.
- The child process `cwd` remains the root stored in the main process, not an untrusted renderer path.
- Attachments remain selected from the local machine, while their prompt context belongs to the owning session.

## One-Time Legacy Migration

- Continue reading the existing `aureum.codex.sessions.v1` payload.
- Sessions that already contain a valid workspace root retain it.
- Legacy sessions without workspace identity remain pending until the application restores or opens its first workspace after upgrade.
- At that moment, all pending legacy sessions are assigned to that workspace root and name in one persisted update.
- For the current installation this means the sessions migrate to the restored recent workspace, expected to be `/Users/you/Downloads`.
- Migration never repeats after workspace fields have been written.
- Persisted `running` sessions continue to normalize to `ready` on application restart.

## Lazy Workspace Tree

Replace eager recursive `readWorkspaceTree` with one-level reads:

- Opening or restoring a workspace reads only its immediate children.
- Directory nodes use `children: undefined` for not-yet-loaded state and `children: []` for a successfully loaded empty or inaccessible directory.
- Add `workspace:readDirectory(path)` IPC. The path is workspace-relative and is validated through `workspaceStore.resolveInsideRoot`.
- Expanding an unloaded directory requests one level, merges those children into the renderer tree, and then expands it.
- Collapsing and re-expanding a loaded directory does not reread it during the same workspace session.
- Directory rows expose loading state and remain usable when another branch is loading.
- Changing workspaces clears the loaded tree and stale in-flight responses are ignored when their workspace root no longer matches.

## Home Directory Reliability

- Failure to read one directory does not fail opening the workspace.
- Permission-denied, disappearing, or unreadable child directories resolve to an empty child list when expanded.
- Symbolic links and unsupported filesystem entries are omitted to avoid traversal loops and special-file handling.
- Hidden entries remain omitted except `.env.example`.
- Existing ignored names such as `.git`, `node_modules`, `out`, `dist`, and cache/build directories remain filtered.
- Home roots receive additional filtering for large generated or system-managed locations where appropriate, without hiding normal user folders such as Desktop, Documents, Downloads, Movies, Music, and Pictures.
- Explorer rendering uses truncation and stable row sizing so long Home-directory names do not overlap.

## Search Behavior

- Filename search can no longer depend on a fully materialized renderer tree.
- Ripgrep content search remains rooted at the active workspace with existing ignore globs.
- Filename matches come from ripgrep file enumeration or the currently loaded tree, so lazy loading does not silently remove search coverage.
- Search failures caused by unreadable Home subdirectories return the available results rather than breaking the workspace.

## IPC and Preload Changes

- Add `workspaceChannels.readDirectory`.
- Expose `workspace.readDirectory(path)` from preload.
- Add `workspaceRoot` to the shared Codex start request.
- Keep all filesystem path validation and Codex working-directory selection in the main process.

## Verification

- Hook tests prove sessions are created, filtered, activated, migrated, updated, stopped, and deleted only within their owning workspace.
- Hook tests prove an off-workspace running session keeps receiving routed output without appearing in the current panel.
- IPC/service tests prove a workspace mismatch never spawns Codex.
- Workspace tests prove the initial open reads one level, expansion merges one level, empty/inaccessible directories are stable, and stale expansion responses are ignored after switching roots.
- Component tests prove unloaded directories can expand and loading state is accessible.
- A real packaged-app smoke test opens `/Users/you`, expands multiple directories, switches workspaces, and verifies separate Codex session sets.
- Run the full test suite, typecheck, production build, rebuild DMG/ZIP, and verify both artifacts.
