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
  const maxBytes = isDocumentLike(classification.format)
    ? maxBytesForAttachmentKind("document")
    : maxBytesForAttachmentKind(classification.kind);
  if (info.size > maxBytes) throw new Error(`${basename(path)} is too large to attach (${Math.ceil(info.size / 1024 / 1024)} MB)`);
  if (classification.kind === "image" || classification.kind === "video") {
    return readMediaAttachment(path, classification, userDataPath, info);
  }
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
