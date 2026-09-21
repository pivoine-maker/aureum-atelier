# Resizable Panels and Markdown Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persistent, accessible horizontal panel resizing and safe Markdown rendering for Codex assistant replies.

**Architecture:** A focused `usePanelLayout` hook owns panel widths, clamping, persistence, pointer drag state, keyboard changes, and reset behavior. `App` maps those values into CSS Grid custom properties and renders semantic separators. `CodexPanel` delegates only assistant message bodies to a small Markdown component powered by `react-markdown` and `remark-gfm`.

**Tech Stack:** React 19, TypeScript, CSS Grid, Testing Library, Vitest, react-markdown, remark-gfm.

---

### Task 1: Lock down Markdown behavior

**Files:**
- Modify: `src/renderer/components/CodexPanel.test.tsx`
- Modify: `package.json`

- [ ] Add a test asserting headings, lists, fenced code, GFM tables, safe links, and literal raw HTML in assistant output.
- [ ] Run `npm test -- --run src/renderer/components/CodexPanel.test.tsx` and confirm failure.
- [ ] Install `react-markdown` and `remark-gfm`.

### Task 2: Implement Markdown output

**Files:**
- Create: `src/renderer/components/MarkdownMessage.tsx`
- Modify: `src/renderer/components/CodexPanel.tsx`
- Modify: `src/renderer/styles/app.css`

- [ ] Render assistant message content through `MarkdownMessage`.
- [ ] Configure safe external links without enabling raw HTML.
- [ ] Add gilded typography, table, quote, inline-code, and code-block styles.
- [ ] Re-run the focused component test until it passes.

### Task 3: Lock down panel sizing behavior

**Files:**
- Create: `src/renderer/layout/usePanelLayout.test.tsx`
- Modify: `src/renderer/App.test.tsx`

- [ ] Test persisted defaults, invalid persistence fallback, clamping, keyboard resize, drag resize, and reset.
- [ ] Test semantic separators and CSS custom property updates in the full shell.
- [ ] Run focused tests and confirm failure.

### Task 4: Implement persistent separators

**Files:**
- Create: `src/renderer/layout/usePanelLayout.ts`
- Create: `src/renderer/components/PanelResizeHandle.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/styles/app.css`

- [ ] Add panel-width constants and safe local-storage parsing.
- [ ] Add pointer capture drag behavior and window-level cleanup.
- [ ] Add keyboard arrow controls and double-click reset.
- [ ] Convert the workbench grid to custom-property widths and insert two handles.
- [ ] Hide the Explorer separator when the sidebar is collapsed.
- [ ] Re-run focused tests until they pass.

### Task 5: Verify and package

**Files:**
- Modify only if verification finds a scoped defect.

- [ ] Run `npm test -- --run`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build` with a stable `TMPDIR` if macOS temp permissions interfere.
- [ ] Package the macOS app and smoke-test dragging, keyboard resizing, persistence, and Markdown in the real Electron window.
