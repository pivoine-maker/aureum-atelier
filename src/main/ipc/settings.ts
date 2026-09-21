import { app, ipcMain } from "electron";
import { join } from "node:path";

import { settingsChannels } from "../../shared/ipc";
import type { AureumSettingsUpdate } from "../../shared/settings";
import { SettingsStore } from "../settings/settingsStore";

export function registerSettingsHandlers(): void {
  const store = new SettingsStore(join(app.getPath("userData"), "settings.json"));
  for (const channel of Object.values(settingsChannels)) ipcMain.removeHandler(channel);
  ipcMain.handle(settingsChannels.getInitial, () => store.load());
  ipcMain.handle(settingsChannels.update, async (_event, update: AureumSettingsUpdate) => {
    const current = await store.load();
    return store.save({ ...current, ...update });
  });
}
