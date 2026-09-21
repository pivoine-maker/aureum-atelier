export type WorkspaceTreeNode = {
  name: string;
  path: string;
  kind: "file" | "directory";
  children?: WorkspaceTreeNode[];
};

export type WorkspaceFile = {
  path: string;
  content: string;
  language: string;
  kind: WorkspaceFileKind;
  mimeType?: string;
};

export type WorkspaceFileKind = "text" | "markdown" | "image";

export type RecentWorkspace = {
  root: string;
  name: string;
  lastOpenedAt: string;
};

export type SearchResult = {
  path: string;
  line: number;
  column: number;
  preview: string;
};

export type OpenWorkspaceResult = {
  root: string;
  name: string;
  tree: WorkspaceTreeNode[];
};

export function sortWorkspaceNodes(nodes: WorkspaceTreeNode[]): WorkspaceTreeNode[] {
  return [...nodes].sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === "directory" ? -1 : 1;
    return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
  });
}

export function toDisplayPath(path: string): string {
  return path.replaceAll("\\", "/");
}

const imageExtensions = new Set(["bmp", "gif", "jpeg", "jpg", "png", "svg", "webp"]);

export function getWorkspaceFileKind(path: string): WorkspaceFileKind {
  const extension = path.split(".").at(-1)?.toLowerCase() ?? "";
  if (extension === "md" || extension === "mdx") return "markdown";
  if (imageExtensions.has(extension)) return "image";
  return "text";
}

export function searchWorkspaceTreeByName(nodes: WorkspaceTreeNode[], query: string): SearchResult[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return [];

  const results: SearchResult[] = [];
  const visit = (node: WorkspaceTreeNode) => {
    if (node.kind === "file" && (node.name.toLowerCase().includes(normalizedQuery) || node.path.toLowerCase().includes(normalizedQuery))) {
      results.push({
        path: node.path,
        line: 1,
        column: 1,
        preview: node.name,
      });
    }

    node.children?.forEach(visit);
  };

  nodes.forEach(visit);
  return results;
}
