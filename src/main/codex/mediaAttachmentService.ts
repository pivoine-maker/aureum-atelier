import { execFile } from "node:child_process";
import type { Stats } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
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
const frameManifestName = "frames.json";

type ExtractedFrame = { path: string; timestamp: string };
type FileSignature = Pick<Stats, "mtimeMs" | "size">;
type MediaOptions = {
  runFfmpeg?: (input: string, cacheDirectory: string) => Promise<ExtractedFrame[]>;
  cacheKey?: (path: string, info: FileSignature, version: string) => string;
};

export async function readMediaAttachment(
  path: string,
  classification: ClassifiedAttachment,
  userDataPath: string,
  info: FileSignature,
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
  const cachedFrames = await readFrameManifest(cacheDirectory);
  const frames = cachedFrames ?? await (options.runFfmpeg ?? extractVideoFrames)(path, cacheDirectory);
  if (frames.length === 0) throw new Error(`Could not extract keyframes from video: ${displayName}`);
  if (!cachedFrames) await writeFrameManifest(cacheDirectory, frames);
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

async function normalizeImage(
  path: string,
  userDataPath: string,
  info: FileSignature,
  cacheKey = attachmentCacheKey,
): Promise<string> {
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
  await extractSceneFrames(binary, path, cacheDirectory);
  const sceneFrames = await existingFrames(cacheDirectory);
  if (sceneFrames.length >= 3) return sceneFrames;
  return extractUniformFrames(binary, path, cacheDirectory);
}

async function extractSceneFrames(binary: string, path: string, cacheDirectory: string): Promise<void> {
  const pattern = videoFramePath(cacheDirectory, 1).replace("frame-001.jpg", "frame-%03d.jpg");
  await execFileAsync(binary, [
    "-hide_banner",
    "-y",
    "-i", path,
    "-vf", "select='gt(scene,0.32)',scale='min(1280,iw)':-2",
    "-vsync", "vfr",
    "-frames:v", String(maxVideoFrames),
    pattern,
  ], { maxBuffer: 10 * 1024 * 1024 }).catch(() => undefined);
}

async function extractUniformFrames(binary: string, path: string, cacheDirectory: string): Promise<ExtractedFrame[]> {
  const duration = await videoDurationSeconds(binary, path);
  if (!duration || duration <= 0) return [];
  const frameCount = Math.min(maxVideoFrames, Math.max(1, Math.floor(duration)));
  const frames: ExtractedFrame[] = [];
  for (let index = 1; index <= frameCount; index += 1) {
    const timestampSeconds = duration * (index / (frameCount + 1));
    const output = videoFramePath(cacheDirectory, index);
    await execFileAsync(binary, [
      "-hide_banner",
      "-y",
      "-ss", String(timestampSeconds),
      "-i", path,
      "-frames:v", "1",
      "-vf", "scale='min(1280,iw)':-2",
      output,
    ], { maxBuffer: 10 * 1024 * 1024 });
    frames.push({ path: output, timestamp: formatTimestamp(timestampSeconds) });
  }
  return frames;
}

async function videoDurationSeconds(binary: string, path: string): Promise<number | null> {
  const { stderr } = await execFileAsync(binary, ["-hide_banner", "-i", path], { maxBuffer: 10 * 1024 * 1024 }).catch((error: unknown) => {
    const record = error as { stderr?: string };
    return { stderr: record.stderr ?? "" };
  });
  const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
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

async function readFrameManifest(cacheDirectory: string): Promise<ExtractedFrame[] | null> {
  try {
    const parsed = JSON.parse(await readFile(join(cacheDirectory, frameManifestName), "utf8")) as unknown;
    if (!Array.isArray(parsed)) return null;
    const frames = parsed.filter(isExtractedFrame);
    return frames.length > 0 ? frames : null;
  } catch {
    return null;
  }
}

async function writeFrameManifest(cacheDirectory: string, frames: ExtractedFrame[]): Promise<void> {
  await writeFile(join(cacheDirectory, frameManifestName), JSON.stringify(frames, null, 2));
}

function isExtractedFrame(value: unknown): value is ExtractedFrame {
  return Boolean(value)
    && typeof value === "object"
    && typeof (value as Partial<ExtractedFrame>).path === "string"
    && typeof (value as Partial<ExtractedFrame>).timestamp === "string";
}

function formatTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${remaining.toFixed(3).padStart(6, "0")}`;
}
