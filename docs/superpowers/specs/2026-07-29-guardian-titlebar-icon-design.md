# Guardian Permissions, Titlebar, and Icon Design

## Permission Decision

Aureum Atelier keeps Codex in the `workspace-write` sandbox with `approvalPolicy: "on-request"`, but routes approval requests through Codex's built-in Guardian reviewer by setting `approvalsReviewer: "auto_review"` on thread and turn creation.

- Guardian approves routine low- and medium-risk actions without interrupting the user.
- Guardian denials classified as high or critical risk become in-chat approval cards.
- Choosing **Allow once** sends the original Guardian assessment event to the official `thread/approveGuardianDeniedAction` API so Codex can retry the exact denied action with explicit user authorization.
- Choosing **Deny** dismisses the card and leaves Guardian's denial in force.
- Guardian approvals are action-specific; session-wide grants are not offered for high- or critical-risk denials.
- Existing direct app-server approval requests remain supported as a compatibility fallback.

The renderer does not implement a command allowlist or its own risk classifier. Risk level and rationale always come from Guardian.

## Titlebar Decision

Remove the three decorative red, yellow, and green dots from the custom titlebar. They do not control the Electron window and therefore create misleading affordances.

## Icon Decision

Preserve the current burgundy-and-gold Aureum Atelier icon artwork while regenerating every PNG in `build/icon.iconset` and `build/icon.icns` with transparent canvas corners. No white background layer is added.

## Verification

- Protocol tests cover `auto_review` thread/turn parameters, high-risk Guardian cards, dismissing denials, and official override requests.
- Renderer tests confirm the decorative traffic lights are absent and Guardian cards expose action-specific controls.
- Image inspection confirms generated icon corner alpha is zero.
- The full test, typecheck, build, and macOS installer pipeline must pass before release artifacts are replaced.
