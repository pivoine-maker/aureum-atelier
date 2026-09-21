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
