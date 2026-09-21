# Session Tabs and Slash Commands Implementation Plan

## Task 1: Persist open and closed Sessions

- Add a persisted `closedAt` marker to `CodexSession`.
- Derive open tabs and recent closed Sessions per workspace.
- Add close and reopen actions without deleting Session data.
- Add Hook tests for closing, reopening, last-tab behavior, running Sessions, and workspace isolation.

## Task 2: Add native Codex command APIs

- Define shared skill, goal, and request/response contracts.
- Extend the app-server service with one-shot `skills/list` and thread goal operations.
- Support creating or resuming a thread before goal updates.
- Add IPC and preload bridge methods with active-workspace validation.
- Add service tests for protocol requests and result normalization.

## Task 3: Add selected skill state

- Persist selected skills per Session.
- Include selected skills as native app-server turn inputs.
- Clear submitted skill selections while preserving them if submission fails.
- Add Hook and service tests for Session scoping and native turn payloads.

## Task 4: Build Session and slash UI

- Add close controls to open Session tabs.
- Split the Session menu into open and recent sections with reopen and permanent-delete actions.
- Add the slash command menu with keyboard navigation and argument parsing.
- Add skill picker, skill chips, and goal/help feedback.
- Add component tests and gilded UI styles.

## Task 5: Verify and package source changes

- Run targeted tests during each red-green cycle.
- Run the complete `npm run verify` suite.
- Perform a production build and review the final diff.
- Commit the implementation without rebuilding installers unless separately requested.
