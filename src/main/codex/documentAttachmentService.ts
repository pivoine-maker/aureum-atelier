import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { basename } from "node:path";
import { promisify } from "node:util";

import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import * as XLSX from "xlsx";

import type { CodexAttachment } from "../../shared/codex";

const execFileAsync = promisify(execFile);
const maxExtractedCharacters = 250_000;

type DocumentFormat = { format: string; language: string };

export async function readDocumentAttachment(path: string, classification: DocumentFormat): Promise<CodexAttachment> {
  const displayName = basename(path);
  const extraction = await extractContent(path, classification.format, displayName);
  const normalized = truncateContent(extraction.content);
  const notes = [...(extraction.notes ?? [])];
  if (normalized.truncated) notes.push("Content was truncated before sending to Codex.");

  return {
    path,
    kind: "text",
    language: classification.language,
    format: classification.format,
    displayName,
    content: normalized.content,
    metadata: {
      ...(normalized.truncated ? { truncated: true } : {}),
      ...(extraction.pageCount ? { pageCount: extraction.pageCount } : {}),
      ...(extraction.sheetCount ? { sheetCount: extraction.sheetCount } : {}),
      ...(notes.length > 0 ? { notes } : {}),
    },
  };
}

type ExtractedContent = {
  content: string;
  pageCount?: number;
  sheetCount?: number;
  notes?: string[];
};

async function extractContent(path: string, format: string, displayName: string): Promise<ExtractedContent> {
  if (["csv", "tsv"].includes(format)) {
    const workbook = XLSX.read(await fs.readFile(path), { type: "buffer", raw: false });
    return spreadsheetTextFromWorkbook(workbook, displayName);
  }
  if (["xls", "xlsx"].includes(format)) {
    return spreadsheetTextFromWorkbook(XLSX.readFile(path, { cellFormula: true }), displayName);
  }
  if (format === "docx") return { content: await docxText(path, displayName) };
  if (format === "doc" || format === "rtf") return { content: await textutilText(path, displayName) };
  if (format === "pdf") return pdfText(path, displayName);
  return { content: await utf8Text(path) };
}

async function utf8Text(path: string): Promise<string> {
  const buffer = await fs.readFile(path);
  if (buffer.includes(0)) throw new Error(`Unsupported binary file: ${path}`);
  const content = buffer.toString("utf8");
  if (content.includes("\uFFFD")) throw new Error(`Unsupported text encoding: ${path}`);
  return content;
}

function spreadsheetTextFromWorkbook(workbook: XLSX.WorkBook, displayName: string): ExtractedContent {
  const sections = [`Spreadsheet: ${displayName}`];
  let sheetCount = 0;
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "" });
    const nonEmptyRows = rows.filter((row) => row.some((cell) => String(cell).trim()));
    if (nonEmptyRows.length === 0) continue;
    sheetCount += 1;
    sections.push(`\nSheet: ${sheetName}\n${markdownTable(nonEmptyRows)}`);
  }
  if (sheetCount === 0) throw new Error(`Spreadsheet has no readable cells: ${displayName}`);
  return { content: sections.join("\n"), sheetCount };
}

function markdownTable(rows: unknown[][]): string {
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

async function pdfText(path: string, displayName: string): Promise<ExtractedContent> {
  const parser = new PDFParse({ data: await fs.readFile(path) });
  try {
    const result = await parser.getText({ pageJoiner: "\n\n--- Page {page_number} of {total_number} ---\n\n" });
    const text = result.text.trim();
    if (!text) throw new Error(`PDF has no extractable text: ${displayName}. OCR is not supported yet.`);
    return { content: `PDF: ${displayName}\nPages: ${result.total}\n\n${text}`, pageCount: result.total };
  } catch (error) {
    if (error instanceof Error && error.message.includes("no extractable text")) throw error;
    throw new Error(`Invalid PDF or PDF has no extractable text: ${displayName}. OCR is not supported yet.`);
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

function truncateContent(content: string): { content: string; truncated: boolean } {
  if (content.length <= maxExtractedCharacters) return { content, truncated: false };
  return { content: `${content.slice(0, maxExtractedCharacters)}\n\n[Attachment truncated before submission.]`, truncated: true };
}
