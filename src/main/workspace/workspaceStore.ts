import { isAbsolute, relative, resolve } from "node:path";

export class WorkspaceStore {
  private root: string | null = null;

  setRoot(root: string): void {
    this.root = resolve(root);
  }

  getRoot(): string | null {
    return this.root;
  }

  clearRoot(): void {
    this.root = null;
  }

  resolveInsideRoot(requestedPath: string): string {
    if (!this.root) throw new Error("No workspace is open");

    const candidate = isAbsolute(requestedPath)
      ? resolve(requestedPath)
      : resolve(this.root, requestedPath);
    const relativePath = relative(this.root, candidate);

    if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
      throw new Error("Requested path is outside the workspace");
    }

    return candidate;
  }
}

export const workspaceStore = new WorkspaceStore();
