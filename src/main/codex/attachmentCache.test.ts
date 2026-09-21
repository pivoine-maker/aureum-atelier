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
