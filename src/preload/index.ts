import { contextBridge, ipcRenderer } from "electron";

import type { Artwork, ArtworkPreferences } from "../shared/artwork";
import type { CodexApprovalResponse, CodexAttachmentPickResult, CodexRoutedEvent, CodexSetGoalRequest, CodexSkill, CodexStartRequest, CodexThreadGoal, CodexThreadRequest, CodexWorkspaceRequest } from "../shared/codex";
import type { GitCommit, GitStatus } from "../shared/git";
import { artworkChannels, codexChannels, gitChannels, settingsChannels, terminalChannels, workspaceChannels } from "../shared/ipc";
import type { AureumSettings, AureumSettingsUpdate } from "../shared/settings";
import type {
  OpenWorkspaceResult,
  RecentWorkspace,
  SearchResult,
  WorkspaceFile,
  WorkspaceTreeNode,
} from "../shared/workspace";

export type AureumDesktopApi = {
  settings: {
    getInitial: () => Promise<AureumSettings>;
    update: (update: AureumSettingsUpdate) => Promise<AureumSettings>;
  };
  artwork: {
    getToday: (preferences?: ArtworkPreferences) => Promise<Artwork>;
    resolveCachedImage: (artworkId: string) => Promise<string | null>;
    onCacheReady: (listener: (event: { artworkId: string; fileUrl: string | null }) => void) => () => void;
  };
  workspace: {
    open: () => Promise<OpenWorkspaceResult | null>;
    restoreLast: () => Promise<OpenWorkspaceResult | null>;
    openRecent: (root: string) => Promise<OpenWorkspaceResult | null>;
    getRecent: () => Promise<RecentWorkspace[]>;
    getTree: () => Promise<WorkspaceTreeNode[]>;
    readDirectory: (path: string) => Promise<WorkspaceTreeNode[]>;
    readFile: (path: string) => Promise<WorkspaceFile>;
    writeFile: (input: { path: string; content: string }) => Promise<void>;
    search: (query: string) => Promise<SearchResult[]>;
  };
  codex: {
    pickAttachments: () => Promise<CodexAttachmentPickResult>;
    listSkills: (request: CodexWorkspaceRequest) => Promise<CodexSkill[]>;
    createThread: (request: CodexWorkspaceRequest) => Promise<string>;
    getGoal: (request: CodexThreadRequest) => Promise<CodexThreadGoal | null>;
    setGoal: (request: CodexSetGoalRequest) => Promise<CodexThreadGoal>;
    clearGoal: (request: CodexThreadRequest) => Promise<boolean>;
    start: (request: CodexStartRequest) => Promise<void>;
    stop: (sessionId: string) => Promise<void>;
    respondToApproval: (response: CodexApprovalResponse) => Promise<void>;
    onEvent: (listener: (event: CodexRoutedEvent) => void) => () => void;
  };
  terminal: {
    create: (input?: { cwd?: string }) => Promise<{ id: string; cwd?: string; shell?: string }>;
    write: (input: { id: string; data: string }) => Promise<void>;
    resize: (input: { id: string; cols: number; rows: number }) => Promise<void>;
    kill: (id: string) => Promise<void>;
    onOutput: (listener: (event: { id: string; data: string }) => void) => () => void;
    onExit: (listener: (event: { id: string; exitCode: number }) => void) => () => void;
  };
  git: {
    status: () => Promise<GitStatus>;
    log: (input?: { limit?: number }) => Promise<GitCommit[]>;
    diff: (input: { path: string; staged: boolean }) => Promise<string>;
    stage: (path: string) => Promise<void>;
    unstage: (path: string) => Promise<void>;
    revert: (input: { path: string; staged: boolean }) => Promise<void>;
    commit: (message: string) => Promise<string>;
  };
};

const api: AureumDesktopApi = {
  settings: {
    getInitial: () => ipcRenderer.invoke(settingsChannels.getInitial),
    update: (update) => ipcRenderer.invoke(settingsChannels.update, update),
  },
  artwork: {
    getToday: (preferences) => ipcRenderer.invoke(artworkChannels.getToday, preferences),
    resolveCachedImage: (artworkId) => ipcRenderer.invoke(artworkChannels.resolveCachedImage, artworkId),
    onCacheReady: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: { artworkId: string; fileUrl: string | null }) => listener(payload);
      ipcRenderer.on(artworkChannels.cacheReady, handler);
      return () => ipcRenderer.off(artworkChannels.cacheReady, handler);
    },
  },
  workspace: {
    open: () => ipcRenderer.invoke(workspaceChannels.open),
    restoreLast: () => ipcRenderer.invoke(workspaceChannels.restoreLast),
    openRecent: (root) => ipcRenderer.invoke(workspaceChannels.openRecent, root),
    getRecent: () => ipcRenderer.invoke(workspaceChannels.getRecent),
    getTree: () => ipcRenderer.invoke(workspaceChannels.getTree),
    readDirectory: (path) => ipcRenderer.invoke(workspaceChannels.readDirectory, path),
    readFile: (path) => ipcRenderer.invoke(workspaceChannels.readFile, path),
    writeFile: (input) => ipcRenderer.invoke(workspaceChannels.writeFile, input),
    search: (query) => ipcRenderer.invoke(workspaceChannels.search, query),
  },
  codex: {
    pickAttachments: () => ipcRenderer.invoke(codexChannels.pickAttachments),
    listSkills: (request) => ipcRenderer.invoke(codexChannels.listSkills, request),
    createThread: (request) => ipcRenderer.invoke(codexChannels.createThread, request),
    getGoal: (request) => ipcRenderer.invoke(codexChannels.getGoal, request),
    setGoal: (request) => ipcRenderer.invoke(codexChannels.setGoal, request),
    clearGoal: (request) => ipcRenderer.invoke(codexChannels.clearGoal, request),
    start: (request) => ipcRenderer.invoke(codexChannels.start, request),
    stop: (sessionId) => ipcRenderer.invoke(codexChannels.stop, sessionId),
    respondToApproval: (response) => ipcRenderer.invoke(codexChannels.respondToApproval, response),
    onEvent: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, codexEvent: CodexRoutedEvent) => listener(codexEvent);
      ipcRenderer.on(codexChannels.event, handler);
      return () => ipcRenderer.off(codexChannels.event, handler);
    },
  },
  terminal: {
    create: (input) => ipcRenderer.invoke(terminalChannels.create, input),
    write: (input) => ipcRenderer.invoke(terminalChannels.write, input),
    resize: (input) => ipcRenderer.invoke(terminalChannels.resize, input),
    kill: (id) => ipcRenderer.invoke(terminalChannels.kill, id),
    onOutput: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: { id: string; data: string }) => listener(payload);
      ipcRenderer.on(terminalChannels.output, handler);
      return () => ipcRenderer.off(terminalChannels.output, handler);
    },
    onExit: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: { id: string; exitCode: number }) => listener(payload);
      ipcRenderer.on(terminalChannels.exit, handler);
      return () => ipcRenderer.off(terminalChannels.exit, handler);
    },
  },
  git: {
    status: () => ipcRenderer.invoke(gitChannels.status),
    log: (input) => ipcRenderer.invoke(gitChannels.log, input),
    diff: (input) => ipcRenderer.invoke(gitChannels.diff, input),
    stage: (path) => ipcRenderer.invoke(gitChannels.stage, path),
    unstage: (path) => ipcRenderer.invoke(gitChannels.unstage, path),
    revert: (input) => ipcRenderer.invoke(gitChannels.revert, input),
    commit: (message) => ipcRenderer.invoke(gitChannels.commit, message),
  },
};

contextBridge.exposeInMainWorld("aureum", api);
