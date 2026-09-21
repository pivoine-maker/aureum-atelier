import { describe, expect, it } from "vitest";

import { fallbackArtworks } from "../shared/artwork";
import { hasBundledArtworkImage, resolveArtworkImage } from "./artworkAssets";

describe("resolveArtworkImage", () => {
  it("uses a bundled image for curated fallback artworks", () => {
    const image = resolveArtworkImage(fallbackArtworks[0]);

    expect(image).not.toBe(fallbackArtworks[0].imageUrl);
  });

  it("ships a distinct offline fallback for every catalog entry", () => {
    for (const artwork of fallbackArtworks) {
      expect(hasBundledArtworkImage(artwork.id), artwork.id).toBe(true);
    }
  });

  it("keeps the remote URL for artwork without a bundled asset", () => {
    const image = resolveArtworkImage({
      ...fallbackArtworks[0],
      id: "remote-only",
      imageUrl: "https://example.com/artwork.jpg",
    });

    expect(image).toBe("https://example.com/artwork.jpg");
  });
});
