import { promises as fs } from "node:fs";
import { relative, resolve } from "node:path";

import { sortWorkspaceNodes, toDisplayPath, type WorkspaceTreeNode } from "../../shared/workspace";

const ignoredDirectoryNames = new Set([
  ".git",
  ".idea",
  ".next",
  ".turbo",
  ".vscode",
  "coverage",
  "dist",
  "node_modules",
  "out",
]);

type DirectoryEntry = {
  name: string;
  isDirectory: () => boolean;
  isFile: () => boolean;
};

type ReadEntries = (directory: string) => Promise<DirectoryEntry[]>;

const readEntries: ReadEntries = async (directory) => fs.readdir(directory, { withFileTypes: true });

export async function readWorkspaceDirectory(
  root: string,
  directory: string,
  readDirectoryEntries: ReadEntries = readEntries,
  homeDirectory?: string,
): Promise<WorkspaceTreeNode[]> {
  let entries: DirectoryEntry[];
  try {
    entries = await readDirectoryEntries(directory);
  } catch (error) {
    if (isUnreadableDirectoryError(error)) return [];
    throw error;
  }

  const nodes: WorkspaceTreeNode[] = [];
  for (const entry of entries) {
    if (homeDirectory && resolve(root) === resolve(homeDirectory) && resolve(directory) === resolve(root) && entry.name === "Library") continue;
    if (entry.name.startsWith(".") && entry.name !== ".env.example") continue;
    if (entry.isDirectory() && ignoredDirectoryNames.has(entry.name)) continue;
    if (!entry.isDirectory() && !entry.isFile()) continue;

    const absolutePath = resolve(directory, entry.name);
    const path = toDisplayPath(relative(root, absolutePath));
    nodes.push({
      name: entry.name,
      path,
      kind: entry.isDirectory() ? "directory" : "file",
    });
  }

  return sortWorkspaceNodes(nodes);
}

function isUnreadableDirectoryError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as NodeJS.ErrnoException).code;
  return code === "EACCES" || code === "EPERM" || code === "ENOENT" || code === "ENOTDIR";
}
