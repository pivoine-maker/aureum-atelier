# Resizable Workspace Panels and Markdown Chat Design

## Scope

- Make Explorer, editor/welcome workspace, and Codex chat widths adjustable.
- Add a separator between Explorer and editor, plus a separator between editor and Codex.
- Persist Explorer and Codex widths in local storage and restore them on launch.
- Keep the editor as the flexible center panel with minimum usable width.
- Render assistant output as Markdown with GFM tables, task lists, links, block quotes, lists, and fenced code.

## Interaction

- Drag separators horizontally with the pointer.
- Operate separators from the keyboard with Left/Right arrows; use larger steps with Shift.
- Double-click a separator to reset its associated panel width.
- Expose separators with `role="separator"`, current/min/max values, and visible hover/focus states.
- Clamp widths so no panel can make the center editor unusable.

## Rendering and Safety

- Use `react-markdown` and `remark-gfm` only for assistant messages.
- Do not enable raw HTML parsing.
- Open external links in a new tab/window with `noopener noreferrer`.
- Preserve user prompts and tool events as plain text.
- Style Markdown using the existing gilded design tokens, including scrollable code blocks and tables.

## Persistence

Store `{ explorerWidth, codexWidth }` under `aureum.layout.panels.v1`. Invalid or out-of-range persisted values fall back to defaults.
