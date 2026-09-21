import { describe, expect, it } from "vitest";

import {
  artworkMovements,
  fallbackArtworks,
  pickNextArtwork,
  pickDailyArtwork,
  type ArtworkPreferences,
} from "./artwork";

const preferences: ArtworkPreferences = {
  enabledMovements: ["classicism", "neoclassicism", "baroque", "romanticism"],
  skippedArtworkIds: [],
  maxLuminance: 0.9,
  rotationSalt: "test-rotation",
};

describe("pickDailyArtwork", () => {
  it("ships a balanced public-domain world-masterpiece catalog", () => {
    expect(fallbackArtworks.length).toBeGreaterThanOrEqual(60);
    expect(new Set(fallbackArtworks.map((artwork) => artwork.id)).size).toBe(fallbackArtworks.length);

    for (const movement of artworkMovements) {
      expect(fallbackArtworks.filter((artwork) => artwork.movement === movement).length).toBeGreaterThanOrEqual(12);
    }

    for (const artwork of fallbackArtworks) {
      expect(artwork.title.trim()).not.toBe("");
      expect(artwork.artist.trim()).not.toBe("");
      expect(artwork.museum.trim()).not.toBe("");
      expect(artwork.sourceUrl).toMatch(/^https:\/\//);
      expect(artwork.imageUrl).toMatch(/^https:\/\//);
      expect(["public-domain", "cc0", "cc-by"]).toContain(artwork.license);
      expect(artwork.luminanceScore).toBeGreaterThanOrEqual(0);
      expect(artwork.luminanceScore).toBeLessThanOrEqual(1);
    }
  });

  it("returns the same artwork throughout the same local day", () => {
    const morning = pickDailyArtwork(new Date(2026, 6, 26, 8), fallbackArtworks, preferences);
    const evening = pickDailyArtwork(new Date(2026, 6, 26, 22), fallbackArtworks, preferences);

    expect(morning.id).toBe(evening.id);
  });

  it("rotates to the next eligible artwork on the following day", () => {
    const first = pickDailyArtwork(new Date(2026, 6, 26), fallbackArtworks, preferences);
    const second = pickDailyArtwork(new Date(2026, 6, 27), fallbackArtworks, preferences);

    expect(second.id).not.toBe(first.id);
  });

  it("respects movement filters and skipped artwork", () => {
    const baroque = fallbackArtworks.filter((artwork) => artwork.movement === "baroque");
    const selected = pickDailyArtwork(new Date(2026, 6, 26), fallbackArtworks, {
      ...preferences,
      enabledMovements: ["baroque"],
      skippedArtworkIds: [baroque[0].id],
    });

    expect(selected.movement).toBe("baroque");
    expect(selected.id).not.toBe(baroque[0].id);
  });

  it("falls back safely when preferences exclude every artwork", () => {
    const selected = pickDailyArtwork(new Date(2026, 6, 26), fallbackArtworks, {
      ...preferences,
      skippedArtworkIds: fallbackArtworks.map((artwork) => artwork.id),
    });

    expect(selected).toEqual(fallbackArtworks[0]);
  });

  it("cycles manually through eligible artworks", () => {
    const first = fallbackArtworks[0];
    const next = pickNextArtwork(first.id, fallbackArtworks, preferences);

    expect(next.id).not.toBe(first.id);
    expect(preferences.enabledMovements).toContain(next.movement);
  });

  it("skips ineligible movements during manual cycling", () => {
    const next = pickNextArtwork(fallbackArtworks[0].id, fallbackArtworks, {
      ...preferences,
      enabledMovements: ["romanticism"],
    });

    expect(next.movement).toBe("romanticism");
  });
});
