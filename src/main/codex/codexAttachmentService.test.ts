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
});
