# Collapsible Workbench Panels Design

## Scope

- Make Explorer, editor/welcome workspace, and Codex chat independently collapsible.
- Keep a permanent narrow activity rail at the far left.
- Restore any hidden panel from its activity-rail button.
- Allow all three panels to be hidden simultaneously so the daily artwork is unobstructed.
- Preserve open files, unsaved editor state, terminal sessions, Codex messages, and panel widths while panels are hidden.

## Interaction

- Add Explorer, Editor, and Codex buttons to the activity rail.
- Each activity-rail button toggles its corresponding panel and exposes its current state with `aria-pressed`.
- Add a `Close Explorer panel` button to the Explorer heading, a `Close Editor panel` button to the editor tab bar, and a `Close Codex panel` button to the Codex heading.
- Keep the title-bar sidebar button synchronized with Explorer visibility; it no longer controls a separate all-or-nothing sidebar state.
- Hide a resize separator whenever either adjacent panel is hidden.
- Keep Settings and the existing Explorer/Search/Source Control behaviors available without conflating them with panel visibility.

## Layout

- Split the permanent activity rail from the Explorer content so the rail remains mounted even when Explorer is closed.
- Build the workbench grid from conditional columns:
  - Explorer content width when visible.
  - Explorer separator only when Explorer and Editor are visible.
  - Flexible editor width when visible.
  - Codex separator only when Editor and Codex are visible.
  - Codex width when visible.
- If only one panel is visible, it occupies the available workbench width.
- If no panels are visible, the workbench content grid contributes no opaque surface and only the activity rail remains over the artwork.
- Existing Gallery, Atelier, and Monastic visual tokens remain unchanged.

## State Preservation

- Keep all three panel components mounted and toggle presentation through CSS classes and accessibility attributes.
- Do not persist visibility in settings for this iteration; every new application launch starts with all three panels visible.
- Retain the existing persisted Explorer and Codex width values.

## Accessibility

- Every close button has a unique accessible name.
- Activity-rail panel toggles use `aria-controls` and `aria-pressed`.
- Hidden panels use `aria-hidden` and cannot receive pointer or keyboard interaction.
- Keyboard shortcuts that focus Search or Codex first restore the required panel, then move focus.

## Verification

- Component tests cover closing each panel, restoring it from the activity rail, and hiding all panels.
- CSS regression tests cover the conditional grid and permanent activity rail.
- The packaged Electron app is visually checked with all three panels hidden to confirm that the artwork is fully visible.
