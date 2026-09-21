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
