# Hybrid Daily Masterworks Design

## Goal

Expand Aureum Atelier from a six-item fallback rotation into a curated daily world-masterpiece gallery that remains useful offline and upgrades to cached high-resolution images online.

## Scope

- Keep the existing movement taxonomy strictly limited to classicism, neoclassicism, baroque, and romanticism.
- Curate approximately 60 public-domain or openly licensed paintings across those four movements.
- Preserve artist, year, movement, museum, source page, image URL, license, composition, luminance, dominant colors, and tags for every work.
- Keep the existing next, favorite, skip, history, movement filter, and luminance filter behavior.

## Daily Rotation

- Derive the daily work from the user's local calendar date, enabled movements, skipped works, luminance ceiling, and rotation salt.
- Return the same work throughout the same local day.
- Choose a different eligible work on the next day when at least two eligible works exist.
- Continue to permit manual next, history selection, favorite, and skip without rewriting the deterministic daily choice.

## Hybrid Image Pipeline

1. Resolve a cached image from Electron `userData/artwork-cache` when available.
2. Otherwise show the bundled offline fallback immediately.
3. In the main process, download the configured open-access high-resolution image in the background.
4. Validate response status, content type, and a bounded file size before atomically storing it.
5. Notify the renderer when the cache is ready so the backdrop upgrades without restarting.
6. On network, validation, or filesystem failure, retain the bundled fallback without interrupting application startup.

## Offline Assets

- Bundle a compressed fallback image for every curated work so the entire catalog works without a network connection.
- Prefer medium-resolution JPEG/WebP assets suitable for a darkened desktop background rather than archival originals.
- Keep the package-size increase bounded and verify every catalog ID has a bundled asset.

## Sources and Licensing

- Use only public-domain, CC0, or compatible CC-BY image sources.
- Prefer stable museum open-access endpoints and Wikimedia Commons file redirects when an institution does not expose a stable direct image.
- Preserve the original museum or collection page in `sourceUrl` and expose license information in the status bar.
- Do not use APIs requiring user keys.

## Failure Handling

- Invalid cache files are ignored and replaced on a future fetch.
- Downloads time out and use bounded redirects/size.
- Concurrent requests for the same artwork share one in-flight promise.
- Renderer errors never remove the current background; they fall back to bundled assets.

## Verification

- Catalog validation tests cover count, uniqueness, allowed movements/licenses, HTTPS sources, and bundled image coverage.
- Daily-selection tests cover stability and day-to-day rotation.
- Cache service tests cover cache hit, successful download, invalid content, oversize rejection, and offline fallback.
- Packaged Electron smoke verifies startup, daily metadata, bundled fallback, cache upgrade, and zero renderer exceptions.
