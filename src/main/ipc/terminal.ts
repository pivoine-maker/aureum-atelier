import { BrowserWindow, ipcMain } from "electron";
import os from "node:os";
import pty from "node-pty";

import { terminalChannels } from "../../shared/ipc";
import { buildTerminalLaunchConfig, inheritLoginShellEnvironment } from "../terminal/terminalLaunchConfig";
import { workspaceStore } from "../workspace/workspaceStore";

type TerminalSession = {
  id: string;
  pty: pty.IPty;
  cwd: string;
  shell: string;
};

const sessions = new Map<string, TerminalSession>();

export function registerTerminalHandlers(): void {
  for (const channel of [terminalChannels.create, terminalChannels.write, terminalChannels.resize, terminalChannels.kill]) {
    ipcMain.removeHandler(channel);
  }

  ipcMain.handle(terminalChannels.create, async (_event, input?: { cwd?: string }) => {
    const id = crypto.randomUUID();
    const user = os.userInfo();
    const launchConfig = await inheritLoginShellEnvironment(buildTerminalLaunchConfig({
      env: process.env,
      platform: process.platform,
      userShell: user.shell ?? "",
    }), process.platform);
    const shell = launchConfig.shell;
    const workspaceRoot = workspaceStore.getRoot();
    const cwd = input?.cwd && workspaceRoot
      ? workspaceStore.resolveInsideRoot(input.cwd)
      : workspaceRoot ?? os.homedir();
    const term = pty.spawn(shell, launchConfig.args, {
      name: "xterm-256color",
      cols: 96,
      rows: 24,
      cwd,
      env: launchConfig.env,
    });

    sessions.set(id, { id, pty: term, cwd, shell });

    term.onData((data) => broadcast(terminalChannels.output, { id, data }));
    term.onExit(({ exitCode }) => {
      sessions.delete(id);
      broadcast(terminalChannels.exit, { id, exitCode });
    });

    return { id, cwd, shell: shell.split(/[\\/]/).at(-1) ?? shell };
  });

  ipcMain.handle(terminalChannels.write, (_event, input: { id: string; data: string }) => {
    sessions.get(input.id)?.pty.write(input.data);
  });

  ipcMain.handle(terminalChannels.resize, (_event, input: { id: string; cols: number; rows: number }) => {
    sessions.get(input.id)?.pty.resize(input.cols, input.rows);
  });

  ipcMain.handle(terminalChannels.kill, (_event, id: string) => {
    sessions.get(id)?.pty.kill();
    sessions.delete(id);
  });
}

function broadcast(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(channel, payload);
  }
}
