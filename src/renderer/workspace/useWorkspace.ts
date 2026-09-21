import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  SearchResult,
  RecentWorkspace,
  WorkspaceFile,
  WorkspaceTreeNode,
} from "../../shared/workspace";

export function useWorkspace() {
  const [rootName, setRootName] = useState<string | null>(null);
  const [rootPath, setRootPath] = useState<string | null>(null);
  const [tree, setTree] = useState<WorkspaceTreeNode[]>([]);
  const [openFiles, setOpenFiles] = useState<WorkspaceFile[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [dirtyPaths, setDirtyPaths] = useState<Set<string>>(() => new Set());
  const [recentWorkspaces, setRecentWorkspaces] = useState<RecentWorkspace[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingDirectoryPaths, setLoadingDirectoryPaths] = useState<Set<string>>(() => new Set());
  const rootPathRef = useRef<string | null>(null);
  const loadingDirectoryPathsRef = useRef(new Set<string>());
  const loadedDirectoryPathsRef = useRef(new Set<string>());

  const activeFile = useMemo(
    () => openFiles.find((file) => file.path === activePath) ?? null,
    [activePath, openFiles],
  );
  const isDirty = activePath ? dirtyPaths.has(activePath) : false;

  const applyWorkspace = useCallback((opened: { root: string; name: string; tree: WorkspaceTreeNode[] }) => {
    setRootName(opened.name);
    setRootPath(opened.root);
    rootPathRef.current = opened.root;
    setTree(opened.tree);
    setOpenFiles([]);
    setActivePath(null);
    setDirtyPaths(new Set());
    setSearchResults([]);
    setLoadingDirectoryPaths(new Set());
    loadingDirectoryPathsRef.current = new Set();
    loadedDirectoryPathsRef.current = collectLoadedDirectoryPaths(opened.tree);
    setRecentWorkspaces((current) => [
      { root: opened.root, name: opened.name, lastOpenedAt: new Date().toISOString() },
      ...current.filter((entry) => entry.root !== opened.root),
    ].slice(0, 10));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [recent, restored] = await Promise.all([
          window.aureum.workspace.getRecent(),
          window.aureum.workspace.restoreLast(),
        ]);
        if (cancelled) return;
        setRecentWorkspaces(recent);
        if (restored) applyWorkspace(restored);
      } catch (caughtError) {
        if (!cancelled) setError(getErrorMessage(caughtError));
      }
    })();
    return () => { cancelled = true; };
  }, [applyWorkspace]);

  const expandDirectory = useCallback(async (path: string) => {
    const requestedRoot = rootPathRef.current;
    if (!requestedRoot || loadingDirectoryPathsRef.current.has(path) || loadedDirectoryPathsRef.current.has(path)) return;
    loadingDirectoryPathsRef.current.add(path);
    setLoadingDirectoryPaths((current) => new Set(current).add(path));
    try {
      const children = await window.aureum.workspace.readDirectory(path);
      if (rootPathRef.current !== requestedRoot) return;
      loadedDirectoryPathsRef.current.add(path);
      setTree((currentTree) => mergeDirectoryChildren(currentTree, path, children));
    } catch (caughtError) {
      if (rootPathRef.current === requestedRoot) {
        loadedDirectoryPathsRef.current.add(path);
        setError(getErrorMessage(caughtError));
        setTree((currentTree) => mergeDirectoryChildren(currentTree, path, []));
      }
    } finally {
      if (rootPathRef.current === requestedRoot) {
        loadingDirectoryPathsRef.current.delete(path);
        setLoadingDirectoryPaths((current) => {
          const next = new Set(current);
          next.delete(path);
          return next;
        });
      }
    }
  }, []);

  const openWorkspace = useCallback(async () => {
    setIsBusy(true);
    setError(null);

    try {
      const opened = await window.aureum.workspace.open();
      if (!opened) return;

      applyWorkspace(opened);
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
    } finally {
      setIsBusy(false);
    }
  }, [applyWorkspace]);

  const openRecentWorkspace = useCallback(async (root: string) => {
    setIsBusy(true);
    setError(null);
    try {
      const opened = await window.aureum.workspace.openRecent(root);
      if (opened) applyWorkspace(opened);
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
    } finally {
      setIsBusy(false);
    }
  }, [applyWorkspace]);

  const selectFile = useCallback(async (path: string) => {
    if (openFiles.some((file) => file.path === path)) {
      setActivePath(path);
      return;
    }
    setIsBusy(true);
    setError(null);

    try {
      const file = await window.aureum.workspace.readFile(path);
      setOpenFiles((current) => [...current, file]);
      setActivePath(file.path);
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
    } finally {
      setIsBusy(false);
    }
  }, [openFiles]);

  const activateFile = useCallback((path: string) => setActivePath(path), []);

  const closeFile = useCallback((path: string) => {
    setDirtyPaths((current) => {
      const next = new Set(current);
      next.delete(path);
      return next;
    });
    setOpenFiles((current) => {
      const closingIndex = current.findIndex((file) => file.path === path);
      const next = current.filter((file) => file.path !== path);
      setActivePath((currentActivePath) => {
        if (currentActivePath !== path) return currentActivePath;
        return next[Math.min(closingIndex, next.length - 1)]?.path ?? null;
      });
      return next;
    });
  }, []);

  const updateActiveContent = useCallback((content: string) => {
    if (!activePath) return;
    setOpenFiles((current) => current.map((file) => file.path === activePath ? { ...file, content } : file));
    setDirtyPaths((current) => new Set(current).add(activePath));
  }, [activePath]);

  const saveActiveFile = useCallback(async () => {
    if (!activeFile) return;
    setIsBusy(true);
    setError(null);

    try {
      await window.aureum.workspace.writeFile({
        path: activeFile.path,
        content: activeFile.content,
      });
      setDirtyPaths((current) => {
        const next = new Set(current);
        next.delete(activeFile.path);
        return next;
      });
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
    } finally {
      setIsBusy(false);
    }
  }, [activeFile]);

  const search = useCallback(async (query: string) => {
    setSearchQuery(query);
    setError(null);

    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    try {
      setSearchResults(await window.aureum.workspace.search(query));
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
    }
  }, []);

  return {
    rootName,
    rootPath,
    tree,
    activeFile,
    activePath,
    openFiles,
    dirtyPaths,
    recentWorkspaces,
    isDirty,
    isBusy,
    error,
    searchQuery,
    searchResults,
    loadingDirectoryPaths,
    openWorkspace,
    openRecentWorkspace,
    expandDirectory,
    selectFile,
    activateFile,
    closeFile,
    updateActiveContent,
    saveActiveFile,
    search,
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The workspace operation failed";
}

function mergeDirectoryChildren(nodes: WorkspaceTreeNode[], path: string, children: WorkspaceTreeNode[]): WorkspaceTreeNode[] {
  return nodes.map((node) => {
    if (node.path === path && node.kind === "directory") return { ...node, children };
    if (node.children) return { ...node, children: mergeDirectoryChildren(node.children, path, children) };
    return node;
  });
}

function collectLoadedDirectoryPaths(nodes: WorkspaceTreeNode[]): Set<string> {
  const paths = new Set<string>();
  const visit = (node: WorkspaceTreeNode) => {
    if (node.kind === "directory" && Array.isArray(node.children)) paths.add(node.path);
    node.children?.forEach(visit);
  };
  nodes.forEach(visit);
  return paths;
}
