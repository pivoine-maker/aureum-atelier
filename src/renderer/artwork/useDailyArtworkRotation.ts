import { useEffect } from "react";

import type { Artwork, ArtworkPreferences } from "../../shared/artwork";

type DailyArtworkApi = {
  getToday: (preferences?: ArtworkPreferences) => Promise<Artwork>;
};

export function useDailyArtworkRotation(
  currentArtwork: Artwork,
  preferences: ArtworkPreferences,
  selectArtwork: (artwork: Artwork) => void,
  artworkApi: DailyArtworkApi | undefined = window.aureum?.artwork,
): void {
  useEffect(() => {
    if (!artworkApi) return undefined;

    let cancelled = false;
    const timeout = window.setTimeout(() => {
      void artworkApi.getToday(preferences)
        .then((dailyArtwork) => {
          if (!cancelled && dailyArtwork.id !== currentArtwork.id) selectArtwork(dailyArtwork);
        })
        .catch(() => undefined);
    }, millisecondsUntilNextLocalDay());

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [
    artworkApi,
    currentArtwork.id,
    preferences.enabledMovements,
    preferences.maxLuminance,
    preferences.rotationSalt,
    preferences.skippedArtworkIds,
    selectArtwork,
  ]);
}

function millisecondsUntilNextLocalDay(date = new Date()): number {
  const nextDay = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 0, 0, 0, 100);
  return Math.max(1_000, nextDay.getTime() - date.getTime());
}
