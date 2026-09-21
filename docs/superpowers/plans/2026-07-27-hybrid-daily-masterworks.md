# Hybrid Daily Masterworks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an approximately 60-work, public-domain daily masterpiece library with complete offline fallbacks and safe online high-resolution caching.

**Architecture:** The shared layer owns a validated static catalog and deterministic rotation. The Electron main process owns network access and a bounded disk cache, exposed through narrow IPC methods and cache-ready events. The renderer resolves bundled fallbacks synchronously, asks the main process for a cached URL asynchronously, and upgrades the background only after the cached file is ready.

**Tech Stack:** Electron, React 19, TypeScript, Vitest, Node filesystem/fetch, Vite static assets.

---

### Task 1: Catalog contract and validation

**Files:**
- Modify: `src/shared/artwork.ts`
- Modify: `src/shared/artwork.test.ts`
- Create: `src/shared/artworkCatalog.ts`

- [ ] Add failing tests for catalog size, unique IDs, allowed movements/licenses, HTTPS metadata, and next-day rotation.
- [ ] Move curated entries into a focused catalog module and export them as the application artwork library.
- [ ] Keep `fallbackArtworks` as a compatibility alias during migration.
- [ ] Run `npm test -- --run src/shared/artwork.test.ts` until green.

### Task 2: Offline fallback asset coverage

**Files:**
- Modify: `src/renderer/artworkAssets.ts`
- Modify: `src/renderer/artworkAssets.test.ts`
- Create: `src/renderer/assets/artworks/*.jpg`
- Create: `scripts/artworks/download-fallbacks.mjs`

- [ ] Add a failing test requiring a bundled asset for every catalog ID.
- [ ] Add a reproducible download/compression script driven by catalog metadata.
- [ ] Fetch medium-resolution public-domain fallbacks and store deterministic filenames.
- [ ] Generate an explicit asset manifest and make missing IDs a build/test failure.

### Task 3: Main-process artwork cache

**Files:**
- Create: `src/main/artwork/artworkCacheService.ts`
- Create: `src/main/artwork/artworkCacheService.test.ts`
- Modify: `src/main/ipc/artwork.ts`
- Modify: `src/shared/ipc.ts`
- Modify: `src/shared/electron.ts`
- Modify: `src/preload/index.ts`

- [ ] Write failing tests for cache hit, download, validation failures, maximum size, timeout, and in-flight deduplication.
- [ ] Implement bounded HTTPS download and atomic cache writes under Electron `userData`.
- [ ] Add IPC for today's artwork, cached-image resolution, and cache-ready events.
- [ ] Start prefetching today's artwork without blocking startup.

### Task 4: Renderer hybrid upgrade

**Files:**
- Modify: `src/renderer/components/ArtworkBackdrop.tsx`
- Modify: `src/renderer/artworkAssets.ts`
- Create: `src/renderer/artwork/useArtworkImage.ts`
- Create: `src/renderer/artwork/useArtworkImage.test.tsx`

- [ ] Add failing tests for bundled-first rendering, cached upgrade, and failed-cache fallback.
- [ ] Resolve the bundled fallback immediately and request cached media asynchronously.
- [ ] Switch to the file URL only after cache availability and listen for cache-ready events.
- [ ] Preserve current artwork during failures and artwork changes.

### Task 5: Full verification and packaging

**Files:**
- Modify only if scoped verification finds a defect.

- [ ] Run all unit/component tests and TypeScript checks.
- [ ] Build with a stable temporary directory.
- [ ] Package the macOS app and verify fallback assets are included.
- [ ] Run real Electron smoke tests for daily selection and hybrid image upgrade.
- [ ] Generate and verify DMG/ZIP artifacts.
