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
