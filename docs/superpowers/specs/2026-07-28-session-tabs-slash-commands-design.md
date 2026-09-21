# Session Tabs and Slash Commands

## Session tab lifecycle

- Closing a Session only removes it from the open tab strip.
- Closing does not delete messages, attachments, goal metadata, Codex thread IDs, or workspace binding.
- Closed Sessions remain in the local workspace history and appear under `Recent sessions`.
- Reopening a recent Session restores it to the tab strip and makes it active.
- A running Session may be closed without stopping its active turn; output and approvals continue routing to that Session.
- Permanent deletion remains a separate menu action and stays disabled while a Session is running.

## Slash menu

- Typing `/` in the Codex composer opens a keyboard-accessible command menu.
- Up and Down move selection, Enter executes, and Escape closes the menu.
- The first command set is `/skills`, `/goal`, `/goal set`, `/goal clear`, `/new`, `/close`, and `/help`.
- `/new`, `/close`, and `/help` are local workbench commands.
- `/skills` calls the native Codex `skills/list` app-server method. Selecting a skill adds a removable skill chip to the current Session composer; the next submitted turn includes a native `UserInput` item with `type: "skill"`.
- `/goal`, `/goal set <objective>`, and `/goal clear` call the native thread goal app-server methods.
- If `/goal set` is used before the Session has a Codex thread, AA creates the thread without starting an empty turn, persists its thread ID, then sets the goal.

## Scope and safety

- Skills, selected skill chips, goals, and commands are scoped to the active Session and its bound workspace.
- Main-process handlers reject native Codex operations when the requested workspace does not match the active workspace.
- The default model remains controlled by the user's Codex configuration.
- Existing `workspace-write` and `on-request` approval behavior remains unchanged.
