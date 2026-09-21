import { BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";

import { fallbackArtworks, pickDailyArtwork, type Artwork, type ArtworkPreferences } from "../../shared/artwork";
import { artworkChannels } from "../../shared/ipc";
import { defaultSettings } from "../../shared/settings";
import { ArtworkCacheService } from "../artwork/artworkCacheService";

type ArtworkRegistrationOptions = {
  userDataPath: string;
};

export function registerArtworkHandlers(options: ArtworkRegistrationOptions): void {
  const cacheService = new ArtworkCacheService({ cacheDirectory: join(options.userDataPath, "artwork-cache") });

  ipcMain.removeHandler(artworkChannels.getToday);
  ipcMain.removeHandler(artworkChannels.resolveCachedImage);
  ipcMain.handle(artworkChannels.getToday, (_event, preferences?: ArtworkPreferences) =>
    pickDailyArtwork(new Date(), fallbackArtworks, preferences ?? defaultSettings),
  );
  ipcMain.handle(artworkChannels.resolveCachedImage, async (_event, artworkId: string) => {
    const artwork = fallbackArtworks.find((entry) => entry.id === artworkId);
    if (!artwork) return null;
    const fileUrl = await cacheService.resolveCachedImage(artwork);
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send(artworkChannels.cacheReady, { artworkId: artwork.id, fileUrl });
    });
    return fileUrl;
  });

  void cacheService.resolveCachedImage(pickDailyArtwork(new Date(), fallbackArtworks, defaultSettings));
}
