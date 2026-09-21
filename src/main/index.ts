import { app, BrowserWindow, shell } from "electron";
import { join } from "node:path";

import { registerArtworkHandlers } from "./ipc/artwork";
import { registerCodexHandlers } from "./ipc/codex";
import { registerGitHandlers } from "./ipc/git";
import { registerSettingsHandlers } from "./ipc/settings";
import { registerTerminalHandlers } from "./ipc/terminal";
import { registerWorkspaceHandlers } from "./ipc/workspace";

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 860,
    minHeight: 620,
    backgroundColor: "#080604",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 18, y: 20 },
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.once("ready-to-show", () => window.show());
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return window;
}

app.whenReady().then(() => {
  registerSettingsHandlers();
  registerArtworkHandlers({ userDataPath: app.getPath("userData") });
  registerWorkspaceHandlers();
  registerCodexHandlers();
  registerTerminalHandlers();
  registerGitHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
