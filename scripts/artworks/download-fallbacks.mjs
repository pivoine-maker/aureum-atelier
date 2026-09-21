import { spawn } from "node:child_process";
import { mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import artworkCatalog from "../../src/shared/artworkCatalog.json" with { type: "json" };

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(scriptDirectory, "../..");
const outputDirectory = join(projectRoot, "src/renderer/assets/artworks");
const temporaryDirectory = join(projectRoot, ".artwork-downloads");
const maximumDownloadBytes = 40 * 1024 * 1024;
const concurrency = 1;

await mkdir(outputDirectory, { recursive: true });
await mkdir(temporaryDirectory, { recursive: true });

let nextIndex = 0;
let completed = 0;

async function worker() {
  while (nextIndex < artworkCatalog.length) {
    const artwork = artworkCatalog[nextIndex];
    nextIndex += 1;
    await createFallback(artwork);
    completed += 1;
    process.stdout.write(`[${completed}/${artworkCatalog.length}] ${artwork.title}\n`);
  }
}

async function createFallback(artwork) {
  const outputPath = join(outputDirectory, `${artwork.id}.jpg`);
  if (await isUsableFile(outputPath)) return;

  const sourcePath = join(temporaryDirectory, `${artwork.id}${sourceExtension(artwork.imageUrl)}`);
  const pendingPath = `${outputPath}.pending.jpg`;

  try {
    await downloadImage(fallbackSourceUrl(artwork.imageUrl), sourcePath);
    await run("magick", [
      sourcePath,
      "-auto-orient",
      "-resize", "1600x1200>",
      "-strip",
      "-interlace", "Plane",
      "-sampling-factor", "4:2:0",
      "-quality", "68",
      pendingPath,
    ]);
    await rename(pendingPath, outputPath);
  } finally {
    await rm(sourcePath, { force: true });
    await rm(pendingPath, { force: true });
  }
}

async function downloadImage(url, destination) {
  let response;
  for (let attempt = 0; attempt < 7; attempt += 1) {
    response = await fetch(url, {
      headers: { "user-agent": "AureumAtelier/0.1 offline-artwork-builder (desktop app)" },
      redirect: "follow",
      signal: AbortSignal.timeout(45_000),
    });
    if (response.ok) break;
    if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 6) {
      throw new Error(`Download failed (${response.status}): ${url}`);
    }
    await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 10_000));
  }
  if (!response.headers.get("content-type")?.startsWith("image/")) {
    throw new Error(`Unexpected content type for ${url}`);
  }
  const declaredSize = Number(response.headers.get("content-length") ?? 0);
  if (declaredSize > maximumDownloadBytes) throw new Error(`Image exceeds 40 MB: ${url}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maximumDownloadBytes) throw new Error(`Image exceeds 40 MB: ${url}`);
  await writeFile(destination, bytes);
}

function fallbackSourceUrl(url) {
  if (url.includes("images.metmuseum.org/CRDImages/")) {
    return url;
  }
  if (url.includes("upload.wikimedia.org/wikipedia/commons/")) {
    const sourceUrl = new URL(url);
    const sourcePath = sourceUrl.pathname.includes("/thumb/")
      ? decodeURIComponent(sourceUrl.pathname.replace(/\/\d+px-([^/]+)$/u, "/1920px-$1"))
      : decodeURIComponent(sourceUrl.pathname);
    const parameters = new URLSearchParams({
      url: `${sourceUrl.host}${sourcePath}`,
      w: "1600",
      output: "jpg",
      q: "70",
    });
    return `https://wsrv.nl/?${parameters}`;
  }
  return url;
}

function sourceExtension(url) {
  const extension = basename(new URL(url).pathname).match(/\.(png|jpe?g|webp)$/iu)?.[0];
  return extension?.toLowerCase() ?? ".img";
}

async function isUsableFile(path) {
  try {
    return (await stat(path)).size > 10_000;
  } catch {
    return false;
  }
}

function run(command, arguments_) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, arguments_, { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)));
  });
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));
const expectedFilenames = new Set(artworkCatalog.map((artwork) => `${artwork.id}.jpg`));
for (const filename of await readdir(outputDirectory)) {
  if (filename.endsWith(".jpg") && !expectedFilenames.has(filename)) {
    await rm(join(outputDirectory, filename), { force: true });
  }
}
await rm(temporaryDirectory, { recursive: true, force: true });
