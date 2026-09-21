import {
  Bot,
  ChevronDown,
  ChevronRight,
  FileCode2,
  FileJson2,
  FileText,
  Files,
  Folder,
  FolderOpen,
  GitBranch,
  PanelTop,
  Search,
  Settings,
  Sparkles,
  X,
} from "lucide-react";
import { useState } from "react";

import type { GitStatus } from "../../shared/git";
import type { SearchResult, WorkspaceTreeNode } from "../../shared/workspace";
import { GitPanel } from "./GitPanel";

type SidebarProps = {
  rootName: string | null;
  rootPath: string | null;
  tree: WorkspaceTreeNode[];
  activePath: string | null;
  searchQuery: string;
  searchResults: SearchResult[];
  onOpenWorkspace: () => void;
  onSelectFile: (path: string) => void;
  onExpandDirectory: (path: string) => Promise<void>;
  loadingDirectoryPaths: Set<string>;
  onSearch: (query: string) => void;
  explorerVisible: boolean;
  editorVisible: boolean;
  codexVisible: boolean;
  onCloseExplorer: () => void;
  onShowExplorer: () => void;
  onToggleExplorer: () => void;
  onToggleEditor: () => void;
  onToggleCodex: () => void;
  onOpenSettings: () => void;
  gitStatus: GitStatus;
  onRefreshGit: () => Promise<void> | void;
  onNotice: (message: string) => void;
};

export function Sidebar({
  rootName,
  rootPath,
  tree,
  activePath,
  searchQuery,
  searchResults,
  explorerVisible,
  editorVisible,
  codexVisible,
  onCloseExplorer,
  onOpenWorkspace,
  onSelectFile,
  onExpandDirectory,
  loadingDirectoryPaths,
  onSearch,
  onShowExplorer,
  onToggleExplorer,
  onToggleEditor,
  onToggleCodex,
  onOpenSettings,
  gitStatus,
  onRefreshGit,
  onNotice,
}: SidebarProps) {
  const [activeView, setActiveView] = useState<"explorer" | "git">("explorer");
  return (
    <>
      <nav
        aria-label="Workspace navigation"
        className="activity-rail activity-rail-shell aureum-panel"
      >
        <button
          aria-controls="explorer-panel"
          aria-label="Explorer"
          aria-pressed={explorerVisible}
          className={`activity-rail__button${explorerVisible && activeView === "explorer" ? " activity-rail__button--active" : ""}`}
          onClick={() => {
            if (!explorerVisible || activeView === "explorer") onToggleExplorer();
            setActiveView("explorer");
          }}
          type="button"
        >
          <Files size={19} />
        </button>
        <button
          aria-controls="editor-panel"
          aria-label="Editor"
          aria-pressed={editorVisible}
          className={`activity-rail__button${editorVisible ? " activity-rail__button--active" : ""}`}
          onClick={onToggleEditor}
          type="button"
        >
          <PanelTop size={19} />
        </button>
        <button
          aria-label="Search"
          className="activity-rail__button"
          onClick={() => {
            setActiveView("explorer");
            onShowExplorer();
            const focusSearch = () => document.querySelector<HTMLInputElement>('[aria-label="Search workspace"]')?.focus();
            if (explorerVisible && activeView === "explorer") focusSearch();
            else setTimeout(focusSearch);
          }}
          type="button"
        >
          <Search size={19} />
        </button>
        <button
          aria-label="Source control"
          className={`activity-rail__button${activeView === "git" ? " activity-rail__button--active" : ""}`}
          onClick={() => { setActiveView("git"); onShowExplorer(); }}
          type="button"
        >
          <GitBranch size={19} />
        </button>
        <button
          aria-controls="codex-panel"
          aria-label="Codex tasks"
          aria-pressed={codexVisible}
          className={`activity-rail__button${codexVisible ? " activity-rail__button--active" : ""}`}
          onClick={onToggleCodex}
          type="button"
        >
          <Bot size={19} />
        </button>
        <span className="activity-rail__spacer" />
        <button
          aria-label="Settings"
          className="activity-rail__button"
          onClick={onOpenSettings}
          type="button"
        >
          <Settings size={18} />
        </button>
      </nav>

      <aside
        aria-hidden={!explorerVisible}
        aria-label="Explorer panel"
        className="sidebar aureum-panel"
        hidden={!explorerVisible}
        id="explorer-panel"
      >

      {activeView === "explorer" ? <div className="explorer">
        <div className="panel-kicker">
          <span>Explorer</span>
          <span className="panel-kicker__actions">
            <button
              className="aureum-small-button"
              onClick={onOpenWorkspace}
              type="button"
            >
              Open
            </button>
            <button aria-label="Close Explorer panel" className="icon-button panel-close-button" onClick={onCloseExplorer} type="button">
              <X size={13} />
            </button>
          </span>
        </div>

        <div className="workspace-heading">
          <ChevronDown size={13} />
          <span>{rootName ?? "NO WORKSPACE"}</span>
        </div>

        <label className="workspace-search">
          <Search size={13} />
          <input
            aria-label="Search workspace"
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Search workspace"
            value={searchQuery}
          />
        </label>

        <div className="file-tree">
          {tree.length > 0 ? (
            tree.map((node) => (
              <WorkspaceNode
                activePath={activePath}
                key={`${rootPath ?? "no-workspace"}:${node.path}`}
                node={node}
                onSelectFile={onSelectFile}
                onExpandDirectory={onExpandDirectory}
                loadingDirectoryPaths={loadingDirectoryPaths}
              />
            ))
          ) : (
            <div className="empty-tree">
              <FolderOpen size={18} />
              <p>Open a folder to populate the workspace tree.</p>
            </div>
          )}
        </div>

        {searchResults.length > 0 ? (
          <div className="search-results">
            <span className="search-results__heading">Search results</span>
            {searchResults.map((result) => (
              <button
                key={`${result.path}:${result.line}:${result.column}`}
                onClick={() => onSelectFile(result.path)}
                type="button"
              >
                <strong>{result.path}</strong>
                <span>{result.line}:{result.column} · {result.preview}</span>
              </button>
            ))}
          </div>
        ) : null}

        <div className="sidebar-insight">
          <Sparkles size={14} />
          <div>
            <span className="sidebar-insight__label">Atelier note</span>
            <p>{rootName ? "Files are ready for editing." : "Choose a workspace to start."}</p>
          </div>
        </div>
      </div> : <div className="explorer source-control-view">
        <div className="panel-kicker"><span>Source Control</span></div>
        <GitPanel onNotice={onNotice} onRefresh={onRefreshGit} repositoryKey={rootPath} status={gitStatus} />
      </div>}
      </aside>
    </>
  );
}

type WorkspaceNodeProps = {
  node: WorkspaceTreeNode;
  activePath: string | null;
  onSelectFile: (path: string) => void;
  onExpandDirectory: (path: string) => Promise<void>;
  loadingDirectoryPaths: Set<string>;
  depth?: number;
};

function WorkspaceNode({ node, activePath, onSelectFile, onExpandDirectory, loadingDirectoryPaths, depth = 0 }: WorkspaceNodeProps) {
  const isActive = activePath === node.path;
  const [isExpanded, setIsExpanded] = useState(false);

  if (node.kind === "directory") {
    const isLoading = loadingDirectoryPaths.has(node.path);
    const isLoaded = Array.isArray(node.children);

    return (
      <div className="file-tree__group">
        <button
          aria-busy={isLoading}
          aria-expanded={isExpanded}
          className="file-tree__row file-tree__row--directory"
          onClick={() => {
            if (isExpanded) {
              setIsExpanded(false);
              return;
            }
            setIsExpanded(true);
            if (!isLoaded) void onExpandDirectory(node.path);
          }}
          style={{ paddingInlineStart: `${12 + depth * 14}px` }}
          title={node.path}
          type="button"
        >
          {isExpanded ? <ChevronDown className="file-tree__chevron" size={13} /> : <ChevronRight className="file-tree__chevron" size={13} />}
          <Folder className="file-tree__icon" size={13} />
          <span>{node.name}</span>
        </button>
        {isExpanded ? node.children?.map((child) => (
          <WorkspaceNode
            activePath={activePath}
            depth={depth + 1}
            key={child.path}
            node={child}
            onSelectFile={onSelectFile}
            onExpandDirectory={onExpandDirectory}
            loadingDirectoryPaths={loadingDirectoryPaths}
          />
        )) : null}
      </div>
    );
  }

  return (
    <button
      className={`file-tree__row${isActive ? " file-tree__row--active" : ""}`}
      onClick={() => onSelectFile(node.path)}
      style={{ paddingInlineStart: `${12 + depth * 14}px` }}
      title={node.path}
      type="button"
    >
      <FileIcon name={node.name} />
      <span>{node.name}</span>
      {isActive ? <span className="file-tree__modified" /> : null}
    </button>
  );
}

function FileIcon({ name }: { name: string }) {
  if (name.endsWith(".json")) return <FileJson2 size={13} />;
  if (name.endsWith(".md") || name.endsWith(".txt")) return <FileText size={13} />;
  return <FileCode2 size={13} />;
}
