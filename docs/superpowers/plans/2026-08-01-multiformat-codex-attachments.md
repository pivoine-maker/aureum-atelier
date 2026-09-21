# Multi-format Codex Attachments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow Aureum Atelier users to attach common office documents, text/code files, images, and videos to Codex Chat by converting them into Codex-native `text` and `localImage` inputs.

**Architecture:** Keep all file parsing in the Electron main process. Split the current single attachment reader into focused services for format classification, document extraction, media conversion, cache management, and Codex input mapping. The renderer only stores a lightweight attachment manifest and displays per-file conversion errors.

**Tech Stack:** Electron main IPC, TypeScript, Vitest, bundled production Node dependencies (`xlsx`, `mammoth`, `pdf-parse` or `pdfjs-dist`, `sharp`, `ffmpeg-static`), macOS `textutil` fallback for `.doc` and `.rtf`, Codex app-server `UserInput` types (`text`, `localImage`).

---

## File Structure

- Modify `package.json`: add production dependencies and package FFmpeg resources.
- Modify `src/shared/codex.ts`: expand `CodexAttachment`, add attachment conversion error types.
- Create `src/main/codex/attachmentTypes.ts`: extension sets, size limits, MIME-ish format classification, display-name helpers.
- Create `src/main/codex/attachmentCache.ts`: cache directory, stable cache keys, cleanup helper, cached frame paths.
- Create `src/main/codex/documentAttachmentService.ts`: text/code, CSV/TSV, XLSX/XLS, DOCX/DOC/RTF, PDF extraction to text attachments.
- Create `src/main/codex/mediaAttachmentService.ts`: image passthrough/normalization and video keyframe extraction.
- Modify `src/main/codex/codexAttachmentService.ts`: orchestration layer for reading one file and many files with partial failures.
- Modify `src/main/ipc/codex.ts`: expanded picker filters and partial failure IPC response.
- Modify `src/preload/index.ts`: updated `pickAttachments` return type.
- Modify `src/renderer/codex/useCodex.ts`: consume partial attachment results, avoid persisting bulky extracted content after submit, maintain per-session errors.
- Modify `src/renderer/components/CodexPanel.tsx`: display attachment type/metadata and conversion errors.
- Modify `src/renderer/styles/app.css`: style attachment chips, processing/errors, type labels.
- Modify `src/main/codex/codexExecService.ts`: map text/image/video manifests to app-server input items.
- Add/modify tests under `src/main/codex/*.test.ts`, `src/renderer/codex/useCodex.test.tsx`, and `src/renderer/components/CodexPanel.test.tsx`.

---

### Task 1: Add attachment contracts and format classification

**Files:**
- Modify: `src/shared/codex.ts`
- Create: `src/main/codex/attachmentTypes.ts`
- Test: `src/main/codex/attachmentTypes.test.ts`

- [ ] **Step 1: Write failing tests for format classification**

Create `src/main/codex/attachmentTypes.test.ts` with:

```ts
import { describe, expect, it } from "vitest";

import { classifyAttachmentPath, maxBytesForAttachmentKind, supportedAttachmentFilters } from "./attachmentTypes";

describe("attachmentTypes", () => {
  it("classifies common office, media, and text formats", () => {
    expect(classifyAttachmentPath("/tmp/book.xlsx")).toEqual({ kind: "text", format: "xlsx", language: "spreadsheet" });
    expect(classifyAttachmentPath("/tmp/report.pdf")).toEqual({ kind: "text", format: "pdf", language: "pdf" });
    expect(classifyAttachmentPath("/tmp/contract.docx")).toEqual({ kind: "text", format: "docx", language: "document" });
    expect(classifyAttachmentPath("/tmp/photo.heic")).toEqual({ kind: "image", format: "heic", language: "plaintext" });
    expect(classifyAttachmentPath("/tmp/demo.mp4")).toEqual({ kind: "video", format: "mp4", language: "video" });
    expect(classifyAttachmentPath("/tmp/archive.zip")).toBeNull();
  });

  it("exposes size limits by attachment kind", () => {
    expect(maxBytesForAttachmentKind("text")).toBe(10 * 1024 * 1024);
    expect(maxBytesForAttachmentKind("document")).toBe(50 * 1024 * 1024);
    expect(maxBytesForAttachmentKind("image")).toBe(25 * 1024 * 1024);
    expect(maxBytesForAttachmentKind("video")).toBe(500 * 1024 * 1024);
  });

  it("builds picker filters with documents, spreadsheets, images, videos, and text", () => {
    expect(supportedAttachmentFilters()).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Documents" }),
      expect.objectContaining({ name: "Spreadsheets" }),
      expect.objectContaining({ name: "Images" }),
      expect.objectContaining({ name: "Videos" }),
      expect.objectContaining({ name: "Text and code" }),
      expect.objectContaining({ name: "All supported files" }),
    ]));
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- --run src/main/codex/attachmentTypes.test.ts`

Expected: FAIL because `attachmentTypes.ts` does not exist.

- [ ] **Step 3: Expand shared attachment types**

Update `src/shared/codex.ts`:

```ts
export type CodexAttachmentKind = "text" | "image" | "video";

export type CodexAttachment = {
  path: string;
  kind: CodexAttachmentKind;
  language: string;
  content?: string;
  displayName?: string;
  format?: string;
  mediaPaths?: string[];
  metadata?: {
    truncated?: boolean;
    pageCount?: number;
    sheetCount?: number;
    frameCount?: number;
    frameTimestamps?: string[];
    notes?: string[];
  };
};

export type CodexAttachmentError = {
  path: string;
  message: string;
};

export type CodexAttachmentPickResult = {
  attachments: CodexAttachment[];
  errors: CodexAttachmentError[];
};
```

Keep `CodexStartRequest.attachments?: CodexAttachment[]` unchanged.

- [ ] **Step 4: Implement format classifier**

Create `src/main/codex/attachmentTypes.ts`:

```ts
import { extname } from "node:path";

import type { CodexAttachmentKind } from "../../shared/codex";

export type ClassifiedAttachment = {
  kind: CodexAttachmentKind;
  format: string;
  language: string;
};

const textLanguages: Record<string, string> = {
  ".cjs": "javascript",
  ".css": "css",
  ".html": "html",
  ".js": "javascript",
  ".json": "json",
  ".jsonl": "jsonl",
  ".jsx": "javascript",
  ".log": "plaintext",
  ".md": "markdown",
  ".mdx": "markdown",
  ".mjs": "javascript",
  ".py": "python",
  ".rs": "rust",
  ".sh": "shell",
  ".sql": "sql",
  ".toml": "toml",
  ".ts": "typescript",
  ".tsx": "typescript",
  ".txt": "plaintext",
  ".xml": "xml",
  ".yaml": "yaml",
  ".yml": "yaml",
};

const spreadsheetExtensions = new Set([".csv", ".tsv", ".xls", ".xlsx"]);
const documentExtensions = new Set([".doc", ".docx", ".pdf", ".rtf"]);
const imageExtensions = new Set([".bmp", ".gif", ".heic", ".heif", ".jpeg", ".jpg", ".png", ".tif", ".tiff", ".webp"]);
const videoExtensions = new Set([".avi", ".m4v", ".mkv", ".mov", ".mp4", ".webm"]);

const allSupportedExtensions = [
  ...Object.keys(textLanguages),
  ...spreadsheetExtensions,
  ...documentExtensions,
  ...imageExtensions,
  ...videoExtensions,
].map((extension) => extension.slice(1)).sort();

export function classifyAttachmentPath(path: string): ClassifiedAttachment | null {
  const extension = extname(path).toLowerCase();
  const format = extension.replace(/^\./, "");
  if (textLanguages[extension]) return { kind: "text", format, language: textLanguages[extension] };
  if (spreadsheetExtensions.has(extension)) return { kind: "text", format, language: "spreadsheet" };
  if (documentExtensions.has(extension)) return { kind: "text", format, language: extension === ".pdf" ? "pdf" : "document" };
  if (imageExtensions.has(extension)) return { kind: "image", format, language: "plaintext" };
  if (videoExtensions.has(extension)) return { kind: "video", format, language: "video" };
  return null;
}

export function maxBytesForAttachmentKind(kind: CodexAttachmentKind | "document"): number {
  if (kind === "video") return 500 * 1024 * 1024;
  if (kind === "document") return 50 * 1024 * 1024;
  if (kind === "image") return 25 * 1024 * 1024;
  return 10 * 1024 * 1024;
}

export function supportedAttachmentFilters(): Electron.FileFilter[] {
  return [
    { name: "All supported files", extensions: allSupportedExtensions },
    { name: "Documents", extensions: ["doc", "docx", "pdf", "rtf"] },
    { name: "Spreadsheets", extensions: ["csv", "tsv", "xls", "xlsx"] },
    { name: "Images", extensions: ["bmp", "gif", "heic", "heif", "jpeg", "jpg", "png", "tif", "tiff", "webp"] },
    { name: "Videos", extensions: ["avi", "m4v", "mkv", "mov", "mp4", "webm"] },
    { name: "Text and code", extensions: Object.keys(textLanguages).map((extension) => extension.slice(1)).sort() },
    { name: "All files", extensions: ["*"] },
  ];
}

export function isDocumentLike(format: string): boolean {
  return ["csv", "doc", "docx", "pdf", "rtf", "tsv", "xls", "xlsx"].includes(format);
}
```

- [ ] **Step 5: Run tests and commit**

Run: `npm test -- --run src/main/codex/attachmentTypes.test.ts src/shared/codex.test.ts`

Expected: PASS.

Commit:

```bash
git add src/shared/codex.ts src/main/codex/attachmentTypes.ts src/main/codex/attachmentTypes.test.ts
git commit -m "feat: classify multi-format Codex attachments"
```

---

### Task 2: Add parser dependencies and attachment cache

**Files:**
- Modify: `package.json`
- Create: `src/main/codex/attachmentCache.ts`
- Test: `src/main/codex/attachmentCache.test.ts`

- [ ] **Step 1: Add parser dependencies**

Run:

```bash
npm install xlsx mammoth pdf-parse sharp ffmpeg-static
```

Expected: `package.json` and `package-lock.json` include the new production dependencies.

- [ ] **Step 2: Write failing cache tests**

Create `src/main/codex/attachmentCache.test.ts`:

```ts
import { mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { attachmentCacheDirectory, attachmentCacheKey, ensureAttachmentCacheDirectory, videoFramePath } from "./attachmentCache";

describe("attachmentCache", () => {
  it("creates a stable cache key from path, size, mtime, and conversion version", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aureum-cache-source-"));
    const path = join(directory, "demo.mp4");
    await writeFile(path, "video bytes");
    const info = await stat(path);

    expect(attachmentCacheKey(path, info, "video-v1")).toMatch(/^[a-f0-9]{64}$/);
    expect(attachmentCacheKey(path, info, "video-v1")).toBe(attachmentCacheKey(path, info, "video-v1"));
    expect(attachmentCacheKey(path, info, "video-v2")).not.toBe(attachmentCacheKey(path, info, "video-v1"));
  });

  it("creates cache directories and deterministic frame paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "aureum-cache-root-"));
    const cacheDirectory = await ensureAttachmentCacheDirectory(root, "abc123");

    expect(cacheDirectory).toBe(join(root, "codex-attachments", "abc123"));
    expect(await attachmentCacheDirectory(root)).toBe(join(root, "codex-attachments"));
    expect(videoFramePath(cacheDirectory, 2)).toBe(join(cacheDirectory, "frame-002.jpg"));
  });
});
```

- [ ] **Step 3: Run tests and verify failure**

Run: `npm test -- --run src/main/codex/attachmentCache.test.ts`

Expected: FAIL because `attachmentCache.ts` does not exist.

- [ ] **Step 4: Implement cache helpers**

Create `src/main/codex/attachmentCache.ts`:

```ts
import { createHash } from "node:crypto";
import type { Stats } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

export async function attachmentCacheDirectory(userDataPath: string): Promise<string> {
  const directory = join(userDataPath, "codex-attachments");
  await mkdir(directory, { recursive: true });
  return directory;
}

export function attachmentCacheKey(path: string, info: Pick<Stats, "mtimeMs" | "size">, conversionVersion: string): string {
  return createHash("sha256")
    .update(path)
    .update("\0")
    .update(String(info.size))
    .update("\0")
    .update(String(Math.round(info.mtimeMs)))
    .update("\0")
    .update(conversionVersion)
    .digest("hex");
}

export async function ensureAttachmentCacheDirectory(userDataPath: string, key: string): Promise<string> {
  const directory = join(await attachmentCacheDirectory(userDataPath), key);
  await mkdir(directory, { recursive: true });
  return directory;
}

export function videoFramePath(cacheDirectory: string, index: number): string {
  return join(cacheDirectory, `frame-${String(index).padStart(3, "0")}.jpg`);
}
```

- [ ] **Step 5: Run tests and commit**

Run: `npm test -- --run src/main/codex/attachmentCache.test.ts`

Expected: PASS.

Commit:

```bash
git add package.json package-lock.json src/main/codex/attachmentCache.ts src/main/codex/attachmentCache.test.ts
git commit -m "feat: add Codex attachment cache helpers"
```

---

### Task 3: Extract text, spreadsheets, documents, and PDFs

**Files:**
- Create: `src/main/codex/documentAttachmentService.ts`
- Test: `src/main/codex/documentAttachmentService.test.ts`
- Modify: `src/main/codex/codexAttachmentService.ts`
- Modify: `src/main/codex/codexAttachmentService.test.ts`

- [ ] **Step 1: Write failing document extraction tests**

Create `src/main/codex/documentAttachmentService.test.ts`:

```ts
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { readDocumentAttachment } from "./documentAttachmentService";

describe("readDocumentAttachment", () => {
  it("reads UTF-8 text and code files", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aureum-doc-"));
    const path = join(directory, "example.ts");
    await writeFile(path, "export const gilded = true;", "utf8");

    await expect(readDocumentAttachment(path, { format: "ts", language: "typescript" })).resolves.toEqual(expect.objectContaining({
      path,
      kind: "text",
      format: "ts",
      language: "typescript",
      content: "export const gilded = true;",
    }));
  });

  it("converts CSV into labeled tabular text", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aureum-doc-"));
    const path = join(directory, "budget.csv");
    await writeFile(path, "Name,Amount\nGold,42\nFrame,7\n", "utf8");

    const attachment = await readDocumentAttachment(path, { format: "csv", language: "spreadsheet" });

    expect(attachment.content).toContain("Spreadsheet: budget.csv");
    expect(attachment.content).toContain("| Name | Amount |");
    expect(attachment.content).toContain("| Gold | 42 |");
    expect(attachment.metadata?.sheetCount).toBe(1);
  });

  it("converts XLSX sheets into labeled Markdown tables", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aureum-doc-"));
    const path = join(directory, "workbook.xlsx");
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Task", "Done"], ["Attach xlsx", true]]), "Plan");
    XLSX.writeFile(workbook, path);

    const attachment = await readDocumentAttachment(path, { format: "xlsx", language: "spreadsheet" });

    expect(attachment.content).toContain("Sheet: Plan");
    expect(attachment.content).toContain("| Task | Done |");
    expect(attachment.content).toContain("| Attach xlsx | TRUE |");
    expect(attachment.metadata?.sheetCount).toBe(1);
  });

  it("extracts PDF text with page labels", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aureum-doc-"));
    const path = join(directory, "note.pdf");
    await writeFile(path, Buffer.from("%PDF-1.1\n1 0 obj <<>> endobj\ntrailer <<>>\n%%EOF\n"));

    await expect(readDocumentAttachment(path, { format: "pdf", language: "pdf" })).rejects.toThrow(/PDF has no extractable text|Invalid PDF/);
  });
});
```

This uses a deliberately minimal PDF to lock the no-text/error path without needing a binary fixture.

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- --run src/main/codex/documentAttachmentService.test.ts`

Expected: FAIL because `documentAttachmentService.ts` does not exist.

- [ ] **Step 3: Implement document extraction service**

Create `src/main/codex/documentAttachmentService.ts`:

```ts
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { basename } from "node:path";
import { promisify } from "node:util";

import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import * as XLSX from "xlsx";

import type { CodexAttachment } from "../../shared/codex";

const execFileAsync = promisify(execFile);
const maxExtractedCharacters = 250_000;

type DocumentFormat = { format: string; language: string };

export async function readDocumentAttachment(path: string, classification: DocumentFormat): Promise<CodexAttachment> {
  const displayName = basename(path);
  const content = await extractContent(path, classification.format, displayName);
  const normalized = truncateContent(content);
  return {
    path,
    kind: "text",
    language: classification.language,
    format: classification.format,
    displayName,
    content: normalized.content,
    metadata: {
      ...(normalized.truncated ? { truncated: true, notes: ["Content was truncated before sending to Codex."] } : {}),
      ...(classification.language === "spreadsheet" ? { sheetCount: countSheets(content) } : {}),
    },
  };
}

async function extractContent(path: string, format: string, displayName: string): Promise<string> {
  if (["csv", "tsv"].includes(format)) return spreadsheetTextFromWorkbook(XLSX.read(await fs.readFile(path), { type: "buffer" }), displayName);
  if (["xls", "xlsx"].includes(format)) return spreadsheetTextFromWorkbook(XLSX.readFile(path, { cellFormula: true }), displayName);
  if (format === "docx") return docxText(path, displayName);
  if (format === "doc" || format === "rtf") return textutilText(path, displayName);
  if (format === "pdf") return pdfText(path, displayName);
  return utf8Text(path);
}

async function utf8Text(path: string): Promise<string> {
  const buffer = await fs.readFile(path);
  if (buffer.includes(0)) throw new Error(`Unsupported binary file: ${path}`);
  const content = buffer.toString("utf8");
  if (content.includes("\uFFFD")) throw new Error(`Unsupported text encoding: ${path}`);
  return content;
}

function spreadsheetTextFromWorkbook(workbook: XLSX.WorkBook, displayName: string): string {
  const sections = [`Spreadsheet: ${displayName}`];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: "" });
    const nonEmptyRows = rows.filter((row) => row.some((cell) => String(cell).trim()));
    if (nonEmptyRows.length === 0) continue;
    sections.push(`\nSheet: ${sheetName}\n${markdownTable(nonEmptyRows)}`);
  }
  if (sections.length === 1) throw new Error(`Spreadsheet has no readable cells: ${displayName}`);
  return sections.join("\n");
}

function markdownTable(rows: string[][]): string {
  const width = Math.max(...rows.map((row) => row.length));
  const normalizedRows = rows.map((row) => Array.from({ length: width }, (_, index) => sanitizeCell(row[index] ?? "")));
  const [header = [], ...body] = normalizedRows;
  return [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...body.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

function sanitizeCell(value: unknown): string {
  return String(value).replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim();
}

async function docxText(path: string, displayName: string): Promise<string> {
  const result = await mammoth.extractRawText({ path });
  const text = result.value.trim();
  if (!text) throw new Error(`Document has no readable text: ${displayName}`);
  return `Document: ${displayName}\n\n${text}`;
}

async function textutilText(path: string, displayName: string): Promise<string> {
  const { stdout } = await execFileAsync("/usr/bin/textutil", ["-convert", "txt", "-stdout", path], { maxBuffer: 20 * 1024 * 1024 });
  const text = stdout.trim();
  if (!text) throw new Error(`Document has no readable text: ${displayName}`);
  return `Document: ${displayName}\n\n${text}`;
}

async function pdfText(path: string, displayName: string): Promise<string> {
  const data = await pdfParse(await fs.readFile(path));
  const text = data.text.trim();
  if (!text) throw new Error(`PDF has no extractable text: ${displayName}. OCR is not supported yet.`);
  return `PDF: ${displayName}\nPages: ${data.numpages}\n\n${text}`;
}

function truncateContent(content: string): { content: string; truncated: boolean } {
  if (content.length <= maxExtractedCharacters) return { content, truncated: false };
  return { content: `${content.slice(0, maxExtractedCharacters)}\n\n[Attachment truncated before submission.]`, truncated: true };
}

function countSheets(content: string): number | undefined {
  const matches = content.match(/^Sheet: /gm);
  return matches?.length;
}
```

- [ ] **Step 4: Route existing attachment service through document service**

Update `src/main/codex/codexAttachmentService.ts` so it:

```ts
import { promises as fs } from "node:fs";
import { basename } from "node:path";

import type { CodexAttachment, CodexAttachmentError, CodexAttachmentPickResult } from "../../shared/codex";
import { classifyAttachmentPath, isDocumentLike, maxBytesForAttachmentKind } from "./attachmentTypes";
import { readDocumentAttachment } from "./documentAttachmentService";
import { readMediaAttachment } from "./mediaAttachmentService";

export async function readCodexAttachment(path: string, userDataPath = process.cwd()): Promise<CodexAttachment> {
  const classification = classifyAttachmentPath(path);
  if (!classification) throw new Error(`Unsupported attachment format: ${basename(path)}`);
  const info = await fs.stat(path);
  const maxBytes = isDocumentLike(classification.format) ? maxBytesForAttachmentKind("document") : maxBytesForAttachmentKind(classification.kind);
  if (info.size > maxBytes) throw new Error(`${basename(path)} is too large to attach (${Math.ceil(info.size / 1024 / 1024)} MB)`);
  if (classification.kind === "image" || classification.kind === "video") return readMediaAttachment(path, classification, userDataPath, info);
  return readDocumentAttachment(path, classification);
}

export async function readCodexAttachments(paths: string[], userDataPath = process.cwd()): Promise<CodexAttachmentPickResult> {
  const attachments: CodexAttachment[] = [];
  const errors: CodexAttachmentError[] = [];
  for (const path of paths) {
    try {
      attachments.push(await readCodexAttachment(path, userDataPath));
    } catch (error) {
      errors.push({ path, message: error instanceof Error ? error.message : "Could not attach file" });
    }
  }
  return { attachments, errors };
}
```

Do not add `readMediaAttachment` implementation yet; in this task create a temporary minimal `src/main/codex/mediaAttachmentService.ts` that preserves current image behavior and throws for video:

```ts
import { basename } from "node:path";
import type { Stats } from "node:fs";

import type { CodexAttachment } from "../../shared/codex";
import type { ClassifiedAttachment } from "./attachmentTypes";

export async function readMediaAttachment(path: string, classification: ClassifiedAttachment, _userDataPath: string, _info: Stats): Promise<CodexAttachment> {
  if (classification.kind === "image") {
    return { path, kind: "image", language: classification.language, format: classification.format, displayName: basename(path) };
  }
  throw new Error(`Video attachment support is not implemented yet: ${basename(path)}`);
}
```

- [ ] **Step 5: Update existing attachment tests**

Modify `src/main/codex/codexAttachmentService.test.ts` to expect unsupported format errors and partial multi-file behavior:

```ts
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { readCodexAttachment, readCodexAttachments } from "./codexAttachmentService";

describe("readCodexAttachment", () => {
  it("reads a selected local text file as prompt context", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aureum-attachment-"));
    const path = join(directory, "example.ts");
    await writeFile(path, "export const gilded = true;", "utf8");

    await expect(readCodexAttachment(path)).resolves.toEqual(expect.objectContaining({
      path,
      kind: "text",
      language: "typescript",
      format: "ts",
      content: "export const gilded = true;",
    }));
  });

  it("keeps a selected image as a native Codex image path", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aureum-attachment-"));
    const path = join(directory, "reference.png");
    await writeFile(path, new Uint8Array([0x89, 0x50, 0x4e, 0x47]));

    await expect(readCodexAttachment(path)).resolves.toEqual(expect.objectContaining({
      path,
      kind: "image",
      language: "plaintext",
      format: "png",
    }));
  });

  it("reports unsupported binary formats", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aureum-attachment-"));
    const path = join(directory, "archive.bin");
    await writeFile(path, new Uint8Array([1, 0, 2, 3]));

    await expect(readCodexAttachment(path)).rejects.toThrow("Unsupported attachment format");
  });

  it("returns successful attachments and per-file errors for multi-selection", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aureum-attachment-"));
    const textPath = join(directory, "note.txt");
    const binaryPath = join(directory, "archive.bin");
    await writeFile(textPath, "hello", "utf8");
    await writeFile(binaryPath, new Uint8Array([0, 1, 2]));

    await expect(readCodexAttachments([textPath, binaryPath])).resolves.toEqual({
      attachments: [expect.objectContaining({ path: textPath, content: "hello" })],
      errors: [expect.objectContaining({ path: binaryPath, message: expect.stringContaining("Unsupported attachment format") })],
    });
  });
});
```

- [ ] **Step 6: Run tests and commit**

Run: `npm test -- --run src/main/codex/documentAttachmentService.test.ts src/main/codex/codexAttachmentService.test.ts`

Expected: PASS.

Commit:

```bash
git add src/main/codex/documentAttachmentService.ts src/main/codex/mediaAttachmentService.ts src/main/codex/codexAttachmentService.ts src/main/codex/documentAttachmentService.test.ts src/main/codex/codexAttachmentService.test.ts
git commit -m "feat: extract document attachments for Codex"
```

---

### Task 4: Add image normalization and video keyframe extraction

**Files:**
- Modify: `src/main/codex/mediaAttachmentService.ts`
- Test: `src/main/codex/mediaAttachmentService.test.ts`
- Modify: `package.json` if FFmpeg unpack/resource configuration is required by the chosen dependency.

- [ ] **Step 1: Write failing media conversion tests**

Create `src/main/codex/mediaAttachmentService.test.ts`:

```ts
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { readMediaAttachment } from "./mediaAttachmentService";

const tinyPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/luzx4wAAAABJRU5ErkJggg==", "base64");

describe("readMediaAttachment", () => {
  it("passes through Codex-native image formats", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aureum-media-"));
    const path = join(directory, "reference.png");
    await writeFile(path, tinyPng);
    const info = await import("node:fs/promises").then((fs) => fs.stat(path));

    await expect(readMediaAttachment(path, { kind: "image", format: "png", language: "plaintext" }, directory, info)).resolves.toEqual(expect.objectContaining({
      path,
      kind: "image",
      mediaPaths: [path],
      format: "png",
    }));
  });

  it("normalizes non-native image formats into cached PNG files", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aureum-media-"));
    const cacheRoot = join(directory, "cache");
    const path = join(directory, "scan.tiff");
    await writeFile(path, tinyPng);
    const info = await import("node:fs/promises").then((fs) => fs.stat(path));

    const attachment = await readMediaAttachment(path, { kind: "image", format: "tiff", language: "plaintext" }, cacheRoot, info);

    expect(attachment.kind).toBe("image");
    expect(attachment.mediaPaths?.[0]).toMatch(/codex-attachments\/.*\/image\.png$/);
  });

  it("extracts video keyframes as cached images with timestamp metadata", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aureum-media-"));
    const cacheRoot = join(directory, "cache");
    const videoPath = join(directory, "demo.mp4");
    await writeFile(videoPath, "video bytes");
    const info = await import("node:fs/promises").then((fs) => fs.stat(videoPath));
    const frameDirectory = join(cacheRoot, "codex-attachments", "mock-key");
    await mkdir(frameDirectory, { recursive: true });
    const runFfmpeg = vi.fn(async () => [
      { path: join(frameDirectory, "frame-001.jpg"), timestamp: "00:00:01.000" },
      { path: join(frameDirectory, "frame-002.jpg"), timestamp: "00:00:04.000" },
    ]);

    const attachment = await readMediaAttachment(videoPath, { kind: "video", format: "mp4", language: "video" }, cacheRoot, info, { runFfmpeg, cacheKey: () => "mock-key" });

    expect(attachment).toEqual(expect.objectContaining({
      path: videoPath,
      kind: "video",
      format: "mp4",
      mediaPaths: [join(frameDirectory, "frame-001.jpg"), join(frameDirectory, "frame-002.jpg")],
      metadata: expect.objectContaining({ frameCount: 2, frameTimestamps: ["00:00:01.000", "00:00:04.000"] }),
    }));
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- --run src/main/codex/mediaAttachmentService.test.ts`

Expected: FAIL because current `readMediaAttachment` throws for video and lacks normalization options.

- [ ] **Step 3: Implement media conversion**

Update `src/main/codex/mediaAttachmentService.ts` with these exported functions and dependency injection points:

```ts
import { execFile } from "node:child_process";
import type { Stats } from "node:fs";
import { access, mkdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { promisify } from "node:util";

import ffmpegPath from "ffmpeg-static";
import sharp from "sharp";

import type { CodexAttachment } from "../../shared/codex";
import { attachmentCacheKey, ensureAttachmentCacheDirectory, videoFramePath } from "./attachmentCache";
import type { ClassifiedAttachment } from "./attachmentTypes";

const execFileAsync = promisify(execFile);
const nativeImageFormats = new Set(["bmp", "gif", "jpeg", "jpg", "png", "webp"]);
const maxVideoFrames = 12;
const mediaConversionVersion = "media-v1";

type ExtractedFrame = { path: string; timestamp: string };
type MediaOptions = {
  runFfmpeg?: (input: string, cacheDirectory: string) => Promise<ExtractedFrame[]>;
  cacheKey?: (path: string, info: Stats, version: string) => string;
};

export async function readMediaAttachment(
  path: string,
  classification: ClassifiedAttachment,
  userDataPath: string,
  info: Stats,
  options: MediaOptions = {},
): Promise<CodexAttachment> {
  const displayName = basename(path);
  if (classification.kind === "image") {
    const mediaPaths = nativeImageFormats.has(classification.format)
      ? [path]
      : [await normalizeImage(path, userDataPath, info, options.cacheKey)];
    return { path, kind: "image", language: classification.language, format: classification.format, displayName, mediaPaths };
  }

  const key = (options.cacheKey ?? attachmentCacheKey)(path, info, mediaConversionVersion);
  const cacheDirectory = await ensureAttachmentCacheDirectory(userDataPath, key);
  const frames = await (options.runFfmpeg ?? extractVideoFrames)(path, cacheDirectory);
  if (frames.length === 0) throw new Error(`Could not extract keyframes from video: ${displayName}`);
  return {
    path,
    kind: "video",
    language: "video",
    format: classification.format,
    displayName,
    mediaPaths: frames.map((frame) => frame.path),
    metadata: { frameCount: frames.length, frameTimestamps: frames.map((frame) => frame.timestamp) },
  };
}

async function normalizeImage(path: string, userDataPath: string, info: Stats, cacheKey = attachmentCacheKey): Promise<string> {
  const key = cacheKey(path, info, mediaConversionVersion);
  const directory = await ensureAttachmentCacheDirectory(userDataPath, key);
  const output = join(directory, "image.png");
  try {
    await access(output);
    return output;
  } catch {
    await sharp(path, { pages: 1 }).png().toFile(output);
    return output;
  }
}

async function extractVideoFrames(path: string, cacheDirectory: string): Promise<ExtractedFrame[]> {
  await mkdir(cacheDirectory, { recursive: true });
  const binary = ffmpegPath || "/opt/homebrew/bin/ffmpeg";
  const pattern = join(cacheDirectory, "frame-%03d.jpg");
  await execFileAsync(binary, [
    "-hide_banner",
    "-y",
    "-i", path,
    "-vf", `select='gt(scene,0.32)',scale='min(1280,iw)':-2`,
    "-vsync", "vfr",
    "-frames:v", String(maxVideoFrames),
    pattern,
  ], { maxBuffer: 10 * 1024 * 1024 });
  const frames = await existingFrames(cacheDirectory);
  if (frames.length >= 3) return frames;
  return extractUniformFrames(binary, path, cacheDirectory);
}

async function extractUniformFrames(binary: string, path: string, cacheDirectory: string): Promise<ExtractedFrame[]> {
  const pattern = join(cacheDirectory, "frame-%03d.jpg");
  await execFileAsync(binary, [
    "-hide_banner",
    "-y",
    "-i", path,
    "-vf", `fps=${maxVideoFrames}/duration,scale='min(1280,iw)':-2`,
    "-frames:v", String(maxVideoFrames),
    pattern,
  ], { maxBuffer: 10 * 1024 * 1024 });
  return existingFrames(cacheDirectory);
}

async function existingFrames(cacheDirectory: string): Promise<ExtractedFrame[]> {
  const frames: ExtractedFrame[] = [];
  for (let index = 1; index <= maxVideoFrames; index += 1) {
    const path = videoFramePath(cacheDirectory, index);
    try {
      await access(path);
      frames.push({ path, timestamp: `frame ${index}` });
    } catch {
      break;
    }
  }
  return frames;
}
```

If `ffmpeg-static` cannot be imported in the main build without unpacking, add it to `build.asarUnpack` in `package.json`:

```json
"asarUnpack": [
  "node_modules/node-pty/**",
  "node_modules/ffmpeg-static/**"
]
```

- [ ] **Step 4: Run tests and commit**

Run: `npm test -- --run src/main/codex/mediaAttachmentService.test.ts src/main/codex/codexAttachmentService.test.ts`

Expected: PASS.

Commit:

```bash
git add package.json package-lock.json src/main/codex/mediaAttachmentService.ts src/main/codex/mediaAttachmentService.test.ts
git commit -m "feat: extract media attachments for Codex"
```

---

### Task 5: Update IPC picker for partial failures

**Files:**
- Modify: `src/main/ipc/codex.ts`
- Modify: `src/preload/index.ts`
- Modify: tests if there are IPC handler tests; otherwise cover through renderer hook tests in Task 6.

- [ ] **Step 1: Update preload type contract**

Change `src/preload/index.ts`:

```ts
import type { CodexApprovalResponse, CodexAttachmentPickResult, CodexRoutedEvent, CodexSetGoalRequest, CodexSkill, CodexStartRequest, CodexThreadGoal, CodexThreadRequest, CodexWorkspaceRequest } from "../shared/codex";
```

Then update the API type:

```ts
pickAttachments: () => Promise<CodexAttachmentPickResult>;
```

- [ ] **Step 2: Update IPC handler**

Modify `src/main/ipc/codex.ts`:

```ts
import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { readCodexAttachments } from "../codex/codexAttachmentService";
import { supportedAttachmentFilters } from "../codex/attachmentTypes";
```

Then replace the picker handler with:

```ts
ipcMain.handle(codexChannels.pickAttachments, async () => {
  const result = await dialog.showOpenDialog({
    title: "Attach files to Codex",
    properties: ["openFile", "multiSelections"],
    filters: supportedAttachmentFilters(),
  });
  if (result.canceled) return { attachments: [], errors: [] };
  return readCodexAttachments(result.filePaths, app.getPath("userData"));
});
```

- [ ] **Step 3: Run targeted typecheck**

Run: `npm run typecheck`

Expected: FAIL until renderer is updated in Task 6. Do not commit yet if this fails.

---

### Task 6: Update renderer state, error UI, and attachment chips

**Files:**
- Modify: `src/renderer/codex/useCodex.ts`
- Modify: `src/renderer/codex/useCodex.test.tsx`
- Modify: `src/renderer/components/CodexPanel.tsx`
- Modify: `src/renderer/components/CodexPanel.test.tsx`
- Modify: `src/renderer/styles/app.css`

- [ ] **Step 1: Write failing hook tests for partial failures and cleanup**

Add to `src/renderer/codex/useCodex.test.tsx`:

```ts
it("keeps successful attachments and reports per-file attachment failures", async () => {
  vi.mocked(window.aureum.codex.pickAttachments).mockResolvedValueOnce({
    attachments: [{
      path: "/Users/test/Desktop/report.pdf",
      content: "PDF: report.pdf\n\nHello",
      language: "pdf",
      kind: "text",
      format: "pdf",
      displayName: "report.pdf",
    }],
    errors: [{ path: "/Users/test/Desktop/archive.zip", message: "Unsupported attachment format: archive.zip" }],
  });
  const { result } = renderHook(() => useCodex(workspaceRoot, workspaceName));

  await act(async () => {
    await result.current.pickAttachments();
  });

  expect(result.current.attachments[0]?.displayName).toBe("report.pdf");
  expect(result.current.error).toContain("archive.zip");
});

it("clears submitted attachments after Codex starts successfully", async () => {
  vi.mocked(window.aureum.codex.pickAttachments).mockResolvedValueOnce({
    attachments: [{
      path: "/Users/test/Desktop/report.pdf",
      content: "PDF text",
      language: "pdf",
      kind: "text",
      format: "pdf",
      displayName: "report.pdf",
    }],
    errors: [],
  });
  const { result } = renderHook(() => useCodex(workspaceRoot, workspaceName));

  await act(async () => {
    await result.current.pickAttachments();
    await result.current.submitPrompt("review");
  });

  expect(window.aureum.codex.start).toHaveBeenCalledWith(expect.objectContaining({ attachments: [expect.objectContaining({ displayName: "report.pdf" })] }));
  expect(result.current.attachments).toHaveLength(0);
});
```

Update existing mocks from `pickAttachments: vi.fn().mockResolvedValue([])` to `pickAttachments: vi.fn().mockResolvedValue({ attachments: [], errors: [] })`.

- [ ] **Step 2: Run hook tests and verify failure**

Run: `npm test -- --run src/renderer/codex/useCodex.test.tsx`

Expected: FAIL because `pickAttachments` still expects an array and attachments are not cleared after submit.

- [ ] **Step 3: Implement hook changes**

In `src/renderer/codex/useCodex.ts`:

- Update `isCodexAttachment` to allow `kind === "video"` and `mediaPaths` arrays.
- Update `pickAttachments`:

```ts
const result = await window.aureum.codex.pickAttachments();
if (result.errors.length > 0) {
  updateSession(sessionId, (session) => ({
    ...session,
    error: result.errors.map((error) => `${error.path.split(/[\\/]/).at(-1)}: ${error.message}`).join("\n"),
    updatedAt: new Date().toISOString(),
  }));
}
if (result.attachments.length === 0) return;
updateSession(sessionId, (session) => ({
  ...session,
  attachments: [
    ...session.attachments.filter((attachment) => !result.attachments.some((picked) => picked.path === attachment.path)),
    ...result.attachments,
  ],
  updatedAt: new Date().toISOString(),
}));
```

- Update successful submit cleanup:

```ts
updateSession(session.id, (current) => ({ ...current, attachments: [], selectedSkills: [], updatedAt: new Date().toISOString() }));
```

- [ ] **Step 4: Update panel chips**

In `src/renderer/components/CodexPanel.tsx`, render label text:

```tsx
const attachmentLabel = (attachment: CodexAttachment) => attachment.displayName ?? attachment.path.split(/[\\/]/).at(-1) ?? attachment.path;
const attachmentKindLabel = (attachment: CodexAttachment) => attachment.kind === "video"
  ? `${attachment.format ?? "video"}${attachment.metadata?.frameCount ? ` · ${attachment.metadata.frameCount} frames` : ""}`
  : attachment.format ?? attachment.kind;
```

Use inside the chip:

```tsx
<Paperclip size={10} />
<strong>{attachmentLabel(attachment)}</strong>
<small>{attachmentKindLabel(attachment)}</small>
```

- [ ] **Step 5: Add chip/error styles**

Update `src/renderer/styles/app.css` around `.composer-attachments`:

```css
.composer-attachments > span strong {
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.composer-attachments > span small {
  color: var(--ink-faint);
  font-size: 10px;
  text-transform: uppercase;
}
```

- [ ] **Step 6: Run renderer tests and commit**

Run: `npm test -- --run src/renderer/codex/useCodex.test.tsx src/renderer/components/CodexPanel.test.tsx && npm run typecheck`

Expected: PASS.

Commit:

```bash
git add src/preload/index.ts src/main/ipc/codex.ts src/renderer/codex/useCodex.ts src/renderer/codex/useCodex.test.tsx src/renderer/components/CodexPanel.tsx src/renderer/components/CodexPanel.test.tsx src/renderer/styles/app.css
git commit -m "feat: surface multi-format attachment results"
```

---

### Task 7: Map expanded attachments into Codex app-server input

**Files:**
- Modify: `src/main/codex/codexExecService.ts`
- Modify: `src/main/codex/codexExecService.test.ts`

- [ ] **Step 1: Write failing app-server payload tests**

Add to `src/main/codex/codexExecService.test.ts` near existing attachment tests:

```ts
it("passes converted video keyframes through the app-server turn input", async () => {
  const process = createProcess();
  const service = new CodexExecService(vi.fn().mockReturnValue(process));

  service.start({
    sessionId: "session-a",
    cwd: "/tmp/project",
    prompt: "review video",
    attachments: [{
      path: "/tmp/project/demo.mp4",
      kind: "video",
      language: "video",
      format: "mp4",
      displayName: "demo.mp4",
      mediaPaths: ["/tmp/cache/frame-001.jpg", "/tmp/cache/frame-002.jpg"],
      metadata: { frameCount: 2, frameTimestamps: ["00:00:01.000", "00:00:04.000"] },
    }],
    onEvent: vi.fn(),
  });
  replyTo(process, "initialize", { userAgent: "test" });
  await replyToGuardianConfig(process);
  await vi.waitFor(() => expect(writtenMessages(process).some((message) => message.method === "thread/start")).toBe(true));
  replyTo(process, "thread/start", { thread: { id: "thread-1" } });
  await vi.waitFor(() => expect(writtenMessages(process).some((message) => message.method === "turn/start")).toBe(true));

  expect(writtenMessages(process)).toContainEqual(expect.objectContaining({
    method: "turn/start",
    params: expect.objectContaining({
      input: [
        { type: "text", text: "review video", text_elements: [] },
        { type: "text", text: expect.stringContaining("Attached video: demo.mp4"), text_elements: [] },
        { type: "localImage", path: "/tmp/cache/frame-001.jpg" },
        { type: "localImage", path: "/tmp/cache/frame-002.jpg" },
      ],
    }),
  }));
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- --run src/main/codex/codexExecService.test.ts`

Expected: FAIL because `buildAttachmentInputs` does not handle `video` or `mediaPaths` yet.

- [ ] **Step 3: Update app-server input mapping**

In `src/main/codex/codexExecService.ts`, update `buildAttachmentInputs`:

```ts
function buildAttachmentInputs(attachments: CodexAttachment[], legacyImagePaths: string[]) {
  const imagePaths = new Set<string>();
  const inputs: Array<Record<string, unknown>> = [];

  const pushImage = (path: string) => {
    if (imagePaths.has(path)) return;
    imagePaths.add(path);
    inputs.push({ type: "localImage", path });
  };

  for (const attachment of attachments) {
    if (attachment.kind === "image") {
      for (const mediaPath of attachment.mediaPaths?.length ? attachment.mediaPaths : [attachment.path]) pushImage(mediaPath);
      continue;
    }

    if (attachment.kind === "video") {
      inputs.push({
        type: "text",
        text: [
          `Attached video: ${attachment.displayName ?? attachment.path}`,
          `Source path: ${attachment.path}`,
          `Format: ${attachment.format ?? "video"}`,
          `Keyframes: ${attachment.mediaPaths?.length ?? 0}`,
          attachment.metadata?.frameTimestamps?.length ? `Timestamps: ${attachment.metadata.frameTimestamps.join(", ")}` : undefined,
        ].filter(Boolean).join("\n"),
        text_elements: [],
      });
      for (const mediaPath of attachment.mediaPaths ?? []) pushImage(mediaPath);
      continue;
    }

    inputs.push({
      type: "text",
      text: [
        `Attached file: ${attachment.displayName ?? attachment.path}`,
        `Source path: ${attachment.path}`,
        `Format: ${attachment.format ?? attachment.language}`,
        `Language: ${attachment.language}`,
        "",
        `\`\`\`${attachment.language}`,
        attachment.content ?? "",
        "```",
      ].join("\n"),
      text_elements: [],
    });
  }

  for (const path of legacyImagePaths) pushImage(path);
  return inputs;
}
```

- [ ] **Step 4: Run tests and commit**

Run: `npm test -- --run src/main/codex/codexExecService.test.ts`

Expected: PASS.

Commit:

```bash
git add src/main/codex/codexExecService.ts src/main/codex/codexExecService.test.ts
git commit -m "feat: send video keyframes to Codex"
```

---

### Task 8: End-to-end fixture tests and verification

**Files:**
- Test updates only unless a previous task missed a behavior.

- [ ] **Step 1: Add a smoke test for representative attachments**

Add to `src/main/codex/codexAttachmentService.test.ts`:

```ts
it("accepts representative supported extensions", async () => {
  const directory = await mkdtemp(join(tmpdir(), "aureum-attachment-"));
  const paths = ["note.txt", "data.csv", "photo.png"].map((name) => join(directory, name));
  await writeFile(paths[0], "hello", "utf8");
  await writeFile(paths[1], "A,B\n1,2\n", "utf8");
  await writeFile(paths[2], new Uint8Array([0x89, 0x50, 0x4e, 0x47]));

  const result = await readCodexAttachments(paths, directory);

  expect(result.errors).toEqual([]);
  expect(result.attachments.map((attachment) => attachment.format)).toEqual(["txt", "csv", "png"]);
});
```

- [ ] **Step 2: Run all targeted attachment tests**

Run:

```bash
npm test -- --run \
  src/main/codex/attachmentTypes.test.ts \
  src/main/codex/attachmentCache.test.ts \
  src/main/codex/documentAttachmentService.test.ts \
  src/main/codex/mediaAttachmentService.test.ts \
  src/main/codex/codexAttachmentService.test.ts \
  src/main/codex/codexExecService.test.ts \
  src/renderer/codex/useCodex.test.tsx \
  src/renderer/components/CodexPanel.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run full verification**

Run: `npm run verify`

Expected: PASS.

- [ ] **Step 4: Commit final test cleanup if needed**

If Step 1 changed tests after previous commits:

```bash
git add src/main/codex/codexAttachmentService.test.ts
git commit -m "test: cover representative Codex attachment formats"
```

---

### Task 9: Package and install updated app

**Files:**
- No source changes unless packaging verification fails.

- [ ] **Step 1: Build release artifacts**

Run: `npm run dist:mac`

Expected: `release/Aureum-Atelier-0.1.0-arm64.dmg` and `.zip` are rebuilt.

- [ ] **Step 2: Install to Applications**

Run:

```bash
pkill -f '/Aureum Atelier.app/Contents/MacOS/Aureum Atelier' || true
sleep 2
ditto 'release/mac-arm64/Aureum Atelier.app' '/Applications/Aureum Atelier.app'
open -a '/Applications/Aureum Atelier.app'
```

Expected: AA starts from `/Applications/Aureum Atelier.app`.

- [ ] **Step 3: Verify package markers**

Run:

```bash
grep -a 'Attached video:' '/Applications/Aureum Atelier.app/Contents/Resources/app.asar' | head -1
grep -a 'codex-attachments' '/Applications/Aureum Atelier.app/Contents/Resources/app.asar' | head -1
shasum -a 256 release/Aureum-Atelier-0.1.0-arm64.dmg release/Aureum-Atelier-0.1.0-arm64.zip
```

Expected: marker strings are present and SHA-256 hashes print.

- [ ] **Step 4: Final status**

Run: `git status --short && git log -5 --oneline`

Expected: clean worktree and recent multi-format attachment commits visible.

---

## Self-review

- Spec coverage: format classification covers documents, spreadsheets, text/code, images, and videos; document and media services cover conversion; Codex input mapping covers `text` and `localImage`; renderer updates cover chips and per-file errors; packaging task covers installer verification.
- Placeholder scan: no `TBD`, no broad “handle errors” steps without explicit behavior, and each task has concrete commands and expected results.
- Type consistency: `CodexAttachment.kind` is consistently `text | image | video`; `mediaPaths`, `displayName`, `format`, and `metadata.frameTimestamps` are introduced in Task 1 and reused later.
