import { describe, expect, it } from "vitest";

import { defaultSettings, parseSettings } from "./settings";
import { themeModeLabels } from "./theme";

describe("Aureum settings", () => {
  it("starts in atelier mode", () => {
    expect(defaultSettings.themeMode).toBe("atelier");
    expect(defaultSettings.backgroundIntensity).toBe(42);
    expect(defaultSettings.favoriteArtworkIds).toEqual([]);
  });

  it("clamps background intensity into the supported range", () => {
    expect(parseSettings({ backgroundIntensity: 150 }).backgroundIntensity).toBe(100);
    expect(parseSettings({ backgroundIntensity: -12 }).backgroundIntensity).toBe(0);
  });

  it("provides a display label for every visual mode", () => {
    expect(themeModeLabels).toEqual({
      gallery: "Gallery",
      atelier: "Atelier",
      monastic: "Monastic",
    });
  });
});
