import { ipcMain } from "electron";

import type { GitCommit, GitStatus } from "../../shared/git";
import { gitChannels } from "../../shared/ipc";
import { GitService } from "../git/gitService";
import { workspaceStore } from "../workspace/workspaceStore";

export function registerGitHandlers(): void {
  for (const channel of Object.values(gitChannels)) ipcMain.removeHandler(channel);

  const service = () => {
    const cwd = workspaceStore.getRoot();
    if (!cwd) throw new Error("Open a workspace before using Git");
    return new GitService(cwd);
  };

  ipcMain.handle(gitChannels.status, async (): Promise<GitStatus> => {
    const cwd = workspaceStore.getRoot();
    if (!cwd) return { branch: null, changes: [], isRepository: false };
    return new GitService(cwd).status();
  });

  ipcMain.handle(gitChannels.log, async (_event, input?: { limit?: number }): Promise<GitCommit[]> => {
    const cwd = workspaceStore.getRoot();
    if (!cwd) return [];
    return new GitService(cwd).log(input?.limit);
  });

  ipcMain.handle(gitChannels.diff, async (_event, input: { path: string; staged: boolean }): Promise<string> => {
    const cwd = workspaceStore.getRoot();
    if (!cwd) return "";
    const { path, staged } = input;
    workspaceStore.resolveInsideRoot(path);
    return new GitService(cwd).diff(path, staged);
  });

  ipcMain.handle(gitChannels.stage, async (_event, path: string) => {
    workspaceStore.resolveInsideRoot(path);
    await service().stage(path);
  });
  ipcMain.handle(gitChannels.unstage, async (_event, path: string) => {
    workspaceStore.resolveInsideRoot(path);
    await service().unstage(path);
  });
  ipcMain.handle(gitChannels.revert, async (_event, input: { path: string; staged: boolean }) => {
    workspaceStore.resolveInsideRoot(input.path);
    await service().revert(input.path, input.staged);
  });
  ipcMain.handle(gitChannels.commit, (_event, message: string) => service().commit(message));
}
