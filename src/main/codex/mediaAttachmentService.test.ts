import { mkdir, mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

import { readMediaAttachment } from "./mediaAttachmentService";

const tinyPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/luzx4wAAAABJRU5ErkJggg==", "base64");

describe("readMediaAttachment", () => {
  it("passes through Codex-native image formats", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aureum-media-"));
    const path = join(directory, "reference.png");
    await writeFile(path, tinyPng);
    const info = await stat(path);

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
    await writeFile(path, await sharp({
      create: { width: 1, height: 1, channels: 3, background: { r: 210, g: 168, b: 75 } },
    }).tiff().toBuffer());
    const info = await stat(path);

    const attachment = await readMediaAttachment(path, { kind: "image", format: "tiff", language: "plaintext" }, cacheRoot, info);

    expect(attachment.kind).toBe("image");
    expect(attachment.mediaPaths?.[0]).toMatch(/codex-attachments\/.*\/image\.png$/);
  });

  it("extracts video keyframes as cached images with timestamp metadata", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aureum-media-"));
    const cacheRoot = join(directory, "cache");
    const videoPath = join(directory, "demo.mp4");
    await writeFile(videoPath, "video bytes");
    const info = await stat(videoPath);
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

  it("reuses a cached video manifest without invoking FFmpeg again", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aureum-media-"));
    const cacheRoot = join(directory, "cache");
    const videoPath = join(directory, "cached.mp4");
    await writeFile(videoPath, "video bytes");
    const info = await stat(videoPath);
    const frameDirectory = join(cacheRoot, "codex-attachments", "cached-key");
    const framePath = join(frameDirectory, "frame-001.jpg");
    await mkdir(frameDirectory, { recursive: true });
    await writeFile(framePath, tinyPng);
    await writeFile(join(frameDirectory, "frames.json"), JSON.stringify([{ path: framePath, timestamp: "00:00:02.000" }]));
    const runFfmpeg = vi.fn();

    const attachment = await readMediaAttachment(videoPath, { kind: "video", format: "mp4", language: "video" }, cacheRoot, info, { runFfmpeg, cacheKey: () => "cached-key" });

    expect(runFfmpeg).not.toHaveBeenCalled();
    expect(attachment.mediaPaths).toEqual([framePath]);
    expect(attachment.metadata?.frameTimestamps).toEqual(["00:00:02.000"]);
  });
});
