import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it, vi } from "vitest";

import { fallbackArtworks } from "../../shared/artwork";
import { ArtworkCacheService } from "./artworkCacheService";

const artwork = fallbackArtworks[0];
const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);

let temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(temporaryDirectories.map((directory) => rm(directory, { recursive: true, force: true })));
  temporaryDirectories = [];
});

describe("ArtworkCacheService", () => {
  it("returns an existing cached file without downloading", async () => {
    const directory = await tempDirectory();
    const service = new ArtworkCacheService({ cacheDirectory: directory });
    const cachedPath = join(directory, `${artwork.id}.jpg`);
    await writeFile(cachedPath, jpegBytes);
    const fetcher = vi.fn();

    const result = await service.resolveCachedImage(artwork, { fetcher });

    expect(result).toBe(pathToFileUrl(cachedPath));
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("replaces an invalid existing cache file", async () => {
    const directory = await tempDirectory();
    const service = new ArtworkCacheService({ cacheDirectory: directory });
    const cachedPath = join(directory, `${artwork.id}.jpg`);
    await writeFile(cachedPath, new Uint8Array([1, 2, 3]));
    const fetcher = vi.fn().mockResolvedValue(response(jpegBytes));

    await service.resolveCachedImage(artwork, { fetcher });

    expect(fetcher).toHaveBeenCalledOnce();
    await expect(readFile(cachedPath)).resolves.toEqual(Buffer.from(jpegBytes));
  });

  it("downloads and atomically caches a valid image", async () => {
    const directory = await tempDirectory();
    const service = new ArtworkCacheService({ cacheDirectory: directory });
    const fetcher = vi.fn().mockResolvedValue(response(jpegBytes));

    const result = await service.resolveCachedImage(artwork, { fetcher });

    expect(result).toBe(pathToFileUrl(join(directory, `${artwork.id}.jpg`)));
    await expect(readFile(join(directory, `${artwork.id}.jpg`))).resolves.toEqual(Buffer.from(jpegBytes));
  });

  it("rejects non-image downloads and leaves no cache file", async () => {
    const directory = await tempDirectory();
    const service = new ArtworkCacheService({ cacheDirectory: directory });
    const fetcher = vi.fn().mockResolvedValue(response(new Uint8Array([1, 2, 3]), { contentType: "text/html" }));

    await expect(service.resolveCachedImage(artwork, { fetcher })).resolves.toBeNull();
    await expect(stat(join(directory, `${artwork.id}.jpg`))).rejects.toThrow();
  });

  it("rejects image responses with an invalid file signature", async () => {
    const directory = await tempDirectory();
    const service = new ArtworkCacheService({ cacheDirectory: directory });
    const fetcher = vi.fn().mockResolvedValue(response(new Uint8Array([1, 2, 3, 4])));

    await expect(service.resolveCachedImage(artwork, { fetcher })).resolves.toBeNull();
    await expect(stat(join(directory, `${artwork.id}.jpg`))).rejects.toThrow();
  });

  it("rejects oversized downloads", async () => {
    const directory = await tempDirectory();
    const service = new ArtworkCacheService({ cacheDirectory: directory, maxBytes: 4 });
    const fetcher = vi.fn().mockResolvedValue(response(jpegBytes));

    await expect(service.resolveCachedImage(artwork, { fetcher })).resolves.toBeNull();
    await expect(stat(join(directory, `${artwork.id}.jpg`))).rejects.toThrow();
  });

  it("shares one in-flight download for concurrent requests", async () => {
    const directory = await tempDirectory();
    const service = new ArtworkCacheService({ cacheDirectory: directory });
    const fetcher = vi.fn().mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return response(jpegBytes);
    });

    const [first, second] = await Promise.all([
      service.resolveCachedImage(artwork, { fetcher }),
      service.resolveCachedImage(artwork, { fetcher }),
    ]);

    expect(first).toBe(second);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

async function tempDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "aureum-artwork-cache-"));
  temporaryDirectories.push(directory);
  return directory;
}

function response(bytes: Uint8Array, options: { contentType?: string; ok?: boolean } = {}): Response {
  const body = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(body).set(bytes);
  return new Response(body, {
    status: options.ok === false ? 500 : 200,
    headers: {
      "content-type": options.contentType ?? "image/jpeg",
      "content-length": String(bytes.byteLength),
    },
  });
}

function pathToFileUrl(path: string): string {
  return new URL(`file://${path}`).toString();
}
