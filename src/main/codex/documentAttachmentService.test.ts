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

  it("reports PDFs without extractable text", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aureum-doc-"));
    const path = join(directory, "note.pdf");
    await writeFile(path, Buffer.from("%PDF-1.1\n1 0 obj <<>> endobj\ntrailer <<>>\n%%EOF\n"));

    await expect(readDocumentAttachment(path, { format: "pdf", language: "pdf" })).rejects.toThrow(/PDF has no extractable text|Invalid PDF/);
  });
});
