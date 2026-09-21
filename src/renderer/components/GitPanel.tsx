import { Check, ChevronDown, ChevronRight, FileDiff, GitCommitHorizontal, Minus, Plus, RefreshCw, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { GitChange, GitCommit, GitStatus } from "../../shared/git";

type GitPanelProps = {
  status: GitStatus;
  repositoryKey?: string | null;
  onRefresh: () => Promise<void> | void;
  onNotice: (message: string) => void;
};

const statusLabels: Record<GitChange["status"], string> = {
  added: "A",
  deleted: "D",
  modified: "M",
  renamed: "R",
  untracked: "U",
};

export function GitPanel({ status, repositoryKey = null, onRefresh, onNotice }: GitPanelProps) {
  const [commitMessage, setCommitMessage] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [diff, setDiff] = useState<{ path: string; content: string } | null>(null);
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [graphCollapsed, setGraphCollapsed] = useState(false);
  const [graphState, setGraphState] = useState<"idle" | "loading" | "error">("idle");
  const staged = status.changes.filter((change) => change.area === "index");
  const worktree = status.changes.filter((change) => change.area === "worktree");

  const loadGraph = useCallback(async () => {
    if (!status.isRepository) {
      setCommits([]);
      return;
    }
    setGraphState("loading");
    try {
      setCommits(await window.aureum.git.log({ limit: 30 }));
      setGraphState("idle");
    } catch (error) {
      setCommits([]);
      setGraphState("error");
      onNotice(error instanceof Error ? error.message : "Could not load Git history");
    }
  }, [onNotice, repositoryKey, status.branch, status.isRepository]);

  useEffect(() => { void loadGraph(); }, [loadGraph]);

  const refreshAll = async () => {
    await onRefresh();
    await loadGraph();
  };

  const run = async (key: string, operation: () => Promise<unknown>, success?: string) => {
    setBusyKey(key);
    try {
      await operation();
      await refreshAll();
      if (success) onNotice(success);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Git operation failed");
    } finally {
      setBusyKey(null);
    }
  };

  const openDiff = async (change: GitChange) => {
    const key = `diff:${change.area}:${change.path}`;
    setBusyKey(key);
    try {
      const content = await window.aureum.git.diff({ path: change.path, staged: change.area === "index" });
      setDiff({ path: change.path, content: content || "No textual diff is available for this file." });
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Could not open diff");
    } finally {
      setBusyKey(null);
    }
  };

  const commit = () => run("commit", async () => {
    const result = await window.aureum.git.commit(commitMessage);
    setCommitMessage("");
    onNotice(result || "Changes committed");
  });

  if (!status.isRepository) {
    return (
      <div className="git-panel git-panel--empty">
        <GitCommitHorizontal size={24} />
        <strong>No Git repository</strong>
        <span>Open a folder initialized with Git to use source control.</span>
        <button className="aureum-small-button" onClick={() => void refreshAll()} type="button"><RefreshCw size={12} /> Refresh</button>
      </div>
    );
  }

  return (
    <div className="git-panel">
      <div className="git-panel__branch">
        <span><GitCommitHorizontal size={13} /> {status.branch ?? "Detached HEAD"}</span>
        <button aria-label="Refresh source control" className="icon-button" onClick={() => void refreshAll()} type="button"><RefreshCw size={12} /></button>
      </div>

      <GitCommitGraph
        collapsed={graphCollapsed}
        commits={commits}
        state={graphState}
        onToggle={() => setGraphCollapsed((current) => !current)}
      />

      <label className="git-commit-box">
        <textarea
          aria-label="Commit message"
          onChange={(event) => setCommitMessage(event.target.value)}
          placeholder="Commit message"
          value={commitMessage}
        />
        <button
          aria-label="Commit staged changes"
          className="aureum-small-button"
          disabled={!commitMessage.trim() || staged.length === 0 || busyKey === "commit"}
          onClick={() => void commit()}
          type="button"
        >
          <Check size={12} /> Commit {staged.length || ""}
        </button>
      </label>

      <GitChangeGroup
        busyKey={busyKey}
        changes={staged}
        label="Staged Changes"
        onAction={(change) => run(`unstage:${change.path}`, () => window.aureum.git.unstage(change.path))}
        onDiff={openDiff}
      />
      <GitChangeGroup
        busyKey={busyKey}
        changes={worktree}
        label="Changes"
        onAction={(change) => run(`stage:${change.path}`, () => window.aureum.git.stage(change.path))}
        onDiff={openDiff}
        onRevert={(change) => {
          if (!window.confirm(`Discard changes in ${change.path}? This cannot be undone.`)) return;
          void run(`revert:${change.path}`, () => window.aureum.git.revert({ path: change.path, staged: false }), `Reverted ${change.path}`);
        }}
      />

      {status.changes.length === 0 ? <div className="git-clean"><Check size={14} /> Working tree is clean</div> : null}
      {diff ? <DiffViewer content={diff.content} onClose={() => setDiff(null)} path={diff.path} /> : null}
    </div>
  );
}

type GitCommitGraphProps = {
  collapsed: boolean;
  commits: GitCommit[];
  state: "idle" | "loading" | "error";
  onToggle: () => void;
};

function GitCommitGraph({ collapsed, commits, state, onToggle }: GitCommitGraphProps) {
  return (
    <section className="git-graph" aria-label="Commit graph">
      <button
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Expand commit graph" : "Collapse commit graph"}
        className="git-graph__header"
        onClick={onToggle}
        type="button"
      >
        <span>{collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />} <h3>Commit Graph</h3></span>
        <small>{state === "loading" ? "Loading" : `${commits.length} commits`}</small>
      </button>
      {collapsed ? null : (
        <div className="git-graph__body">
          {state === "error" ? <div className="git-graph__empty">Could not load commit history</div> : null}
          {state !== "error" && state !== "loading" && commits.length === 0 ? <div className="git-graph__empty">No commits yet</div> : null}
          {commits.map((commit) => <GitCommitRow commit={commit} key={commit.hash} />)}
        </div>
      )}
    </section>
  );
}

function GitCommitRow({ commit }: { commit: GitCommit }) {
  return (
    <article className="git-graph-row" title={commit.hash}>
      <code className="git-graph-row__rail" aria-label="Graph rail">{commit.graph || "*"}</code>
      <div className="git-graph-row__content">
        <div className="git-graph-row__line">
          <code>{commit.shortHash}</code>
          <strong>{commit.subject || "Untitled commit"}</strong>
        </div>
        <div className="git-graph-row__meta">
          <span>{commit.author || "Unknown author"}</span>
          <span>{formatRelativeTime(commit.date)}</span>
        </div>
        {commit.refs.length > 0 ? (
          <div className="git-graph-row__refs">
            {commit.refs.map((ref) => <span key={`${commit.hash}:${ref}`}>{ref}</span>)}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function formatRelativeTime(value: string): string {
  const time = Date.parse(value);
  if (Number.isNaN(time)) return "unknown time";
  const diffSeconds = Math.max(0, Math.floor((Date.now() - time) / 1000));
  const units = [
    { label: "year", seconds: 31_536_000 },
    { label: "month", seconds: 2_592_000 },
    { label: "day", seconds: 86_400 },
    { label: "hour", seconds: 3_600 },
    { label: "minute", seconds: 60 },
  ];
  for (const unit of units) {
    const count = Math.floor(diffSeconds / unit.seconds);
    if (count > 0) return `${count} ${unit.label}${count === 1 ? "" : "s"} ago`;
  }
  return "just now";
}

type GitChangeGroupProps = {
  label: string;
  changes: GitChange[];
  busyKey: string | null;
  onDiff: (change: GitChange) => void;
  onAction: (change: GitChange) => void;
  onRevert?: (change: GitChange) => void;
};

function GitChangeGroup({ label, changes, busyKey, onDiff, onAction, onRevert }: GitChangeGroupProps) {
  return (
    <section className="git-change-group">
      <header><span><ChevronDown size={12} /> {label}</span><small>{changes.length}</small></header>
      {changes.map((change) => (
        <div className="git-change-row" key={`${change.area}:${change.path}`}>
          <button aria-label={`Open diff for ${change.path}`} className="git-change-row__file" onClick={() => void onDiff(change)} title={change.path} type="button">
            <span>{statusLabels[change.status]}</span><strong>{change.path.split("/").at(-1)}</strong><small>{change.path.includes("/") ? change.path.slice(0, change.path.lastIndexOf("/")) : ""}</small>
          </button>
          {onRevert ? <button aria-label={`Revert ${change.path}`} className="icon-button" disabled={busyKey === `revert:${change.path}`} onClick={() => onRevert(change)} type="button"><RotateCcw size={11} /></button> : null}
          <button
            aria-label={`${change.area === "index" ? "Unstage" : "Stage"} ${change.path}`}
            className="icon-button"
            disabled={busyKey === `${change.area === "index" ? "unstage" : "stage"}:${change.path}`}
            onClick={() => void onAction(change)}
            type="button"
          >
            {change.area === "index" ? <Minus size={12} /> : <Plus size={12} />}
          </button>
        </div>
      ))}
    </section>
  );
}

function DiffViewer({ path, content, onClose }: { path: string; content: string; onClose: () => void }) {
  const rows = useMemo(() => parseDiffRows(content), [content]);
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section aria-label={`Diff ${path}`} aria-modal="true" className="diff-viewer aureum-panel" onMouseDown={(event) => event.stopPropagation()} role="dialog">
        <header className="modal-header">
          <div><span className="panel-kicker">Side-by-side diff</span><h2>{path}</h2></div>
          <button aria-label="Close diff" className="icon-button" onClick={onClose} type="button"><X size={16} /></button>
        </header>
        <div className="diff-viewer__columns"><span>Original</span><span>Modified</span></div>
        <div className="diff-viewer__body">
          {rows.map((row, index) => (
            <div className={`diff-row diff-row--${row.kind}`} key={`${row.left}:${row.right}:${index}`}>
              <code>{row.left}</code><code>{row.right}</code>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function parseDiffRows(content: string): Array<{ left: string; right: string; kind: "context" | "changed" | "meta" }> {
  const rows: Array<{ left: string; right: string; kind: "context" | "changed" | "meta" }> = [];
  let pendingRemoved: string[] = [];
  const flushRemoved = () => {
    for (const line of pendingRemoved) rows.push({ left: line, right: "", kind: "changed" });
    pendingRemoved = [];
  };
  for (const line of content.split("\n")) {
    if (line.startsWith("---") || line.startsWith("+++") || line.startsWith("diff ") || line.startsWith("index ")) continue;
    if (line.startsWith("@@")) {
      flushRemoved();
      rows.push({ left: line, right: line, kind: "meta" });
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      pendingRemoved.push(line.slice(1));
    } else if (line.startsWith("+") && !line.startsWith("+++")) {
      const removed = pendingRemoved.shift() ?? "";
      rows.push({ left: removed, right: line.slice(1), kind: "changed" });
    } else {
      flushRemoved();
      const value = line.startsWith(" ") ? line.slice(1) : line;
      rows.push({ left: value, right: value, kind: "context" });
    }
  }
  flushRemoved();
  return rows;
}
