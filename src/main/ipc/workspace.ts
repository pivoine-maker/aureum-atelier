import { app, dialog, ipcMain } from "electron";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { basename, delimiter, extname, join, resolve } from "node:path";

import { workspaceChannels } from "../../shared/ipc";
import {
  getWorkspaceFileKind,
  toDisplayPath,
  type OpenWorkspaceResult,
  type RecentWorkspace,
  type SearchResult,
  type WorkspaceFile,
  type WorkspaceTreeNode,
} from "../../shared/workspace";
import { readWorkspaceDirectory } from "../workspace/workspaceDirectoryService";
import { escapeRipgrepGlob, parseContentSearchResults, parseFileSearchResults } from "../workspace/workspaceSearchService";
import { workspaceStore } from "../workspace/workspaceStore";

const languageByExtension: Record<string, string> = {
  ".css": "css",
  ".html": "html",
  ".js": "javascript",
  ".json": "json",
  ".jsx": "javascript",
  ".md": "markdown",
  ".mjs": "javascript",
  ".py": "python",
  ".rs": "rust",
  ".sh": "shell",
  ".toml": "toml",
  ".ts": "typescript",
  ".tsx": "typescript",
  ".yaml": "yaml",
  ".yml": "yaml",
};

const imageMimeByExtension: Record<string, string> = {
  ".bmp": "image/bmp",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

const maxEditableFileBytes = 10 * 1024 * 1024;
const maxPreviewImageBytes = 25 * 1024 * 1024;

type WorkspaceState = { recent: RecentWorkspace[] };

function getWorkspaceStatePath(): string {
  return join(app.getPath("userData"), "workspace-state.json");
}

async function readWorkspaceState(): Promise<WorkspaceState> {
  try {
    const parsed = JSON.parse(await fs.readFile(getWorkspaceStatePath(), "utf8")) as Partial<WorkspaceState>;
    return { recent: Array.isArray(parsed.recent) ? parsed.recent.slice(0, 10) : [] };
  } catch {
    return { recent: [] };
  }
}

async function rememberWorkspace(root: string): Promise<void> {
  const state = await readWorkspaceState();
  const recent = [
    { root, name: basename(root), lastOpenedAt: new Date().toISOString() },
    ...state.recent.filter((entry) => entry.root !== root),
  ].slice(0, 10);
  await fs.mkdir(app.getPath("userData"), { recursive: true });
  await fs.writeFile(getWorkspaceStatePath(), JSON.stringify({ recent }, null, 2), "utf8");
}

async function openWorkspaceRoot(root: string): Promise<OpenWorkspaceResult | null> {
  try {
    const normalizedRoot = resolve(root);
    const info = await fs.stat(normalizedRoot);
    if (!info.isDirectory()) return null;
    workspaceStore.setRoot(normalizedRoot);
    await rememberWorkspace(normalizedRoot);
    return {
      root: normalizedRoot,
      name: basename(normalizedRoot),
      tree: await readWorkspaceDirectory(normalizedRoot, normalizedRoot, undefined, homedir()),
    };
  } catch {
    return null;
  }
}

export function registerWorkspaceHandlers(): void {
  for (const channel of Object.values(workspaceChannels)) ipcMain.removeHandler(channel);

  ipcMain.handle(workspaceChannels.open, async (): Promise<OpenWorkspaceResult | null> => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"],
      title: "Open a workspace in Aureum Atelier",
    });

    if (result.canceled || !result.filePaths[0]) return null;

    return openWorkspaceRoot(result.filePaths[0]);
  });

  ipcMain.handle(workspaceChannels.restoreLast, async (): Promise<OpenWorkspaceResult | null> => {
    const [last] = (await readWorkspaceState()).recent;
    return last ? openWorkspaceRoot(last.root) : null;
  });

  ipcMain.handle(workspaceChannels.openRecent, async (_event, root: string): Promise<OpenWorkspaceResult | null> => {
    const state = await readWorkspaceState();
    if (!state.recent.some((entry) => entry.root === root)) throw new Error("Workspace is not in recent history");
    return openWorkspaceRoot(root);
  });

  ipcMain.handle(workspaceChannels.getRecent, async (): Promise<RecentWorkspace[]> => {
    const state = await readWorkspaceState();
    const existing: RecentWorkspace[] = [];
    for (const entry of state.recent) {
      try {
        if ((await fs.stat(entry.root)).isDirectory()) existing.push(entry);
      } catch {
        // Missing recent workspaces are omitted from the picker.
      }
    }
    return existing;
  });

  ipcMain.handle(workspaceChannels.getTree, async (): Promise<WorkspaceTreeNode[]> => {
    const root = workspaceStore.getRoot();
    if (!root) return [];
    return readWorkspaceDirectory(root, root, undefined, homedir());
  });

  ipcMain.handle(workspaceChannels.readDirectory, async (_event, path: string): Promise<WorkspaceTreeNode[]> => {
    const root = workspaceStore.getRoot();
    if (!root) return [];
    const directory = workspaceStore.resolveInsideRoot(path);
    return readWorkspaceDirectory(root, directory, undefined, homedir());
  });

  ipcMain.handle(workspaceChannels.readFile, async (_event, path: string): Promise<WorkspaceFile> => {
    const absolutePath = workspaceStore.resolveInsideRoot(path);
    const extension = extname(path).toLowerCase();
    const kind = getWorkspaceFileKind(path);
    const info = await fs.stat(absolutePath);
    const sizeLimit = kind === "image" ? maxPreviewImageBytes : maxEditableFileBytes;
    if (info.size > sizeLimit) throw new Error(`File is too large to open (${Math.ceil(info.size / 1024 / 1024)} MB)`);
    const content = kind === "image"
      ? `data:${imageMimeByExtension[extension] ?? "application/octet-stream"};base64,${(await fs.readFile(absolutePath)).toString("base64")}`
      : await fs.readFile(absolutePath, "utf8");

    return {
      path: toDisplayPath(path),
      content,
      language: languageByExtension[extname(path).toLowerCase()] ?? "plaintext",
      kind,
      mimeType: kind === "image" ? imageMimeByExtension[extension] : "text/plain",
    };
  });

  ipcMain.handle(
    workspaceChannels.writeFile,
    async (_event, input: { path: string; content: string }): Promise<void> => {
      const absolutePath = workspaceStore.resolveInsideRoot(input.path);
      if (getWorkspaceFileKind(input.path) === "image") throw new Error("Image previews cannot be edited as text");
      await fs.writeFile(absolutePath, input.content, "utf8");
    },
  );

  ipcMain.handle(workspaceChannels.search, async (_event, query: string): Promise<SearchResult[]> => {
    const root = workspaceStore.getRoot();
    const normalizedQuery = query.trim();
    if (!root || normalizedQuery.length === 0) return [];
    const [filenameResults, contentResults] = await Promise.all([
      searchWorkspaceFiles(root, normalizedQuery),
      searchWorkspaceContent(root, normalizedQuery),
    ]);
    const seen = new Set<string>();
    return [...filenameResults, ...contentResults]
      .filter((result) => {
        const key = `${result.path}:${result.line}:${result.column}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 250);
  });
}

function searchWorkspaceContent(root: string, query: string): Promise<SearchResult[]> {
  return runRipgrepSearch(root, [
    "--line-number",
    "--column",
    "--no-heading",
    "--color",
    "never",
    "--fixed-strings",
    ...workspaceSearchGlobs(root),
    query,
    ".",
  ], parseContentSearchResults, root === homedir());
}

function searchWorkspaceFiles(root: string, query: string): Promise<SearchResult[]> {
  return runRipgrepSearch(root, [
    "--files",
    "--no-messages",
    ...workspaceSearchGlobs(root),
    "--iglob",
    `*${escapeRipgrepGlob(query)}*`,
    ".",
  ], parseFileSearchResults, root === homedir());
}

function workspaceSearchGlobs(root: string): string[] {
  return [
    "--glob", "!node_modules/**",
    "--glob", "!.git/**",
    "--glob", "!out/**",
    ...(root === homedir() ? ["--glob", "!Library/**"] : []),
  ];
}

function runRipgrepSearch(
  root: string,
  args: string[],
  parseResults: (stdout: string) => SearchResult[],
  tolerateUnreadableDirectories: boolean,
): Promise<SearchResult[]> {
  return new Promise((resolveResults, rejectResults) => {
    const child = spawn(resolveRipgrepExecutable(), args, { cwd: root, stdio: ["ignore", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      if (stdout.length > 1_000_000) child.kill();
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.on("error", rejectResults);
    child.on("close", (code) => {
      if (code === 1) return resolveResults([]);
      if (code !== 0 && !stdout.trim() && !tolerateUnreadableDirectories) {
        return rejectResults(new Error(stderr.trim() || "Workspace search failed"));
      }
      resolveResults(parseResults(stdout));
    });
  });
}

export function resolveRipgrepExecutable(
  env: NodeJS.ProcessEnv = process.env,
  fileExists: (path: string) => boolean = existsSync,
): string {
  const pathCandidates = (env.PATH ?? "")
    .split(delimiter)
    .filter(Boolean)
    .map((directory) => join(directory, process.platform === "win32" ? "rg.exe" : "rg"));
  const fallbackCandidates = process.platform === "darwin"
    ? ["/opt/homebrew/bin/rg", "/usr/local/bin/rg"]
    : [];

  return [...pathCandidates, ...fallbackCandidates].find(fileExists) ?? "rg";
}
