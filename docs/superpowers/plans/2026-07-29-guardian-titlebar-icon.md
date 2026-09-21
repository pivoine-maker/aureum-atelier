# Guardian Permissions, Titlebar, and Icon Implementation Plan

## Task 1: Route approvals through Guardian

- Change thread and turn protocol parameters to `approvalsReviewer: "auto_review"`.
- Normalize completed high- and critical-risk Guardian denials into approval cards.
- Store the original assessment event with the pending approval.
- Send accepted denials through `thread/approveGuardianDeniedAction`.
- Dismiss declined denials without overriding Guardian.
- Keep legacy command and file-change approval request handling intact.

## Task 2: Update approval presentation

- Add Guardian risk metadata to shared approval contracts.
- Label Guardian cards with risk and action details.
- Hide session-wide approval for Guardian denials.
- Update the permission posture text in the Codex composer.

## Task 3: Remove decorative titlebar controls

- Add a shell regression assertion for the absent traffic lights.
- Remove the unused titlebar markup and CSS rules.

## Task 4: Regenerate transparent app assets

- Render iconset PNGs from the SVG with an explicit transparent background.
- Rebuild the ICNS from the regenerated iconset.
- Verify zero alpha at the outer corners and visually inspect the artwork.

## Task 5: Verify, commit, and package

- Run focused tests after each red-green cycle.
- Run `npm run verify` and inspect the final diff.
- Commit source and icon assets.
- Run `npm run dist:mac` and verify the packaged application and artifacts.
