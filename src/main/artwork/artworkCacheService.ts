import { mkdir, open, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import type { Artwork } from "../../shared/artwork";

export type ArtworkFetcher = (url: string, init?: RequestInit) => Promise<Response>;

export type ArtworkCacheServiceOptions = {
  cacheDirectory: string;
  maxBytes?: number;
  timeoutMs?: number;
};

export type ResolveCachedImageOptions = {
  fetcher?: ArtworkFetcher;
};

export class ArtworkCacheService {
  private readonly cacheDirectory: string;
  private readonly maxBytes: number;
  private readonly timeoutMs: number;
  private readonly inFlight = new Map<string, Promise<string | null>>();

  constructor(options: ArtworkCacheServiceOptions) {
    this.cacheDirectory = options.cacheDirectory;
    this.maxBytes = options.maxBytes ?? 20 * 1024 * 1024;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  resolveCachedImage(artwork: Artwork, options: ResolveCachedImageOptions = {}): Promise<string | null> {
    const existing = this.inFlight.get(artwork.id);
    if (existing) return existing;

    const promise = this.resolveCachedImageInternal(artwork, options)
      .finally(() => this.inFlight.delete(artwork.id));
    this.inFlight.set(artwork.id, promise);
    return promise;
  }

  private async resolveCachedImageInternal(artwork: Artwork, options: ResolveCachedImageOptions): Promise<string | null> {
    await mkdir(this.cacheDirectory, { recursive: true });
    const cachePath = this.cachePathFor(artwork);

    if (await isUsableCacheFile(cachePath)) return pathToFileURL(cachePath).toString();
    await rm(cachePath, { force: true });

    const temporaryPath = `${cachePath}.${Date.now()}.tmp`;
    try {
      const fetcher = options.fetcher ?? fetch;
      const response = await fetcher(artwork.imageUrl, { signal: AbortSignal.timeout(this.timeoutMs) });
      if (!response.ok) return null;
      if (!response.headers.get("content-type")?.startsWith("image/")) return null;

      const declaredLength = Number(response.headers.get("content-length") ?? 0);
      if (declaredLength > this.maxBytes) return null;

      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > this.maxBytes || !hasImageSignature(bytes)) return null;

      await writeFile(temporaryPath, bytes);
      await rename(temporaryPath, cachePath);
      return pathToFileURL(cachePath).toString();
    } catch {
      return null;
    } finally {
      await rm(temporaryPath, { force: true });
    }
  }

  private cachePathFor(artwork: Artwork): string {
    return join(this.cacheDirectory, `${artwork.id}.jpg`);
  }
}

async function isUsableCacheFile(path: string): Promise<boolean> {
  try {
    if ((await stat(path)).size < 4) return false;
    const handle = await open(path, "r");
    try {
      const header = Buffer.alloc(12);
      const { bytesRead } = await handle.read(header, 0, header.length, 0);
      return hasImageSignature(header.subarray(0, bytesRead));
    } finally {
      await handle.close();
    }
  } catch {
    return false;
  }
}

function hasImageSignature(bytes: Uint8Array): boolean {
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const isWebp = Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF"
    && Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP";
  return isJpeg || isPng || isWebp;
}
