export type GitChangeStatus = "modified" | "added" | "deleted" | "renamed" | "untracked";
export type GitChangeArea = "index" | "worktree";

export type GitChange = {
  path: string;
  oldPath?: string;
  status: GitChangeStatus;
  area: GitChangeArea;
};

export type GitStatus = {
  branch: string | null;
  changes: GitChange[];
  isRepository: boolean;
};

export type GitCommit = {
  author: string;
  date: string;
  graph: string;
  hash: string;
  parents: string[];
  refs: string[];
  shortHash: string;
  subject: string;
};

export function parseGitStatus(output: string): GitChange[] {
  return output
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      const [indexCode, worktreeCode] = line.slice(0, 2);
      const rawPath = line.slice(3);
      if (indexCode === "?" && worktreeCode === "?") {
        return [{ area: "worktree" as const, path: rawPath, status: "untracked" as const }];
      }

      const pathParts = rawPath.split(" -> ");
      const oldPath = pathParts.length === 2 ? pathParts[0] : undefined;
      const path = pathParts.at(-1) ?? rawPath;
      const changes: GitChange[] = [];
      const indexStatus = toStatus(indexCode);
      const worktreeStatus = toStatus(worktreeCode);
      if (indexStatus) changes.push({ area: "index", path, oldPath, status: indexStatus });
      if (worktreeStatus) changes.push({ area: "worktree", path, oldPath, status: worktreeStatus });
      return changes;
    });
}

function toStatus(code: string): GitChangeStatus | null {
  if (code === "A") return "added";
  if (code === "D") return "deleted";
  if (code === "R") return "renamed";
  if (code === "M" || code === "T" || code === "U") return "modified";
  return null;
}

export function parseGitLog(output: string): GitCommit[] {
  const commits: GitCommit[] = [];
  const graphLines: string[] = [];
  for (const rawLine of output.split("\n")) {
    const line = rawLine.trimEnd();
    if (!line) continue;
    const hashIndex = line.search(/[0-9a-f]{40}\u001f/);
    if (hashIndex < 0) {
      graphLines.push(line);
      continue;
    }
    const graph = [...graphLines, line.slice(0, hashIndex).trimEnd()].filter(Boolean).join("\n");
    graphLines.length = 0;
    const fields = line.slice(hashIndex).split("\u001f");
    const [hash, shortHash, parents, author, date, decorations, subject] = fields;
    if (!hash || !shortHash) continue;
    commits.push({
      author: author ?? "",
      date: date ?? "",
      graph,
      hash,
      parents: parents ? parents.split(" ").filter(Boolean) : [],
      refs: decorations ? decorations.split(", ").filter(Boolean) : [],
      shortHash,
      subject: subject ?? "",
    });
  }
  return commits;
}
