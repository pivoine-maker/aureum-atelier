import type { Artwork } from "../shared/artwork";

const bundledArtworkModules = import.meta.glob<string>(
  "./assets/artworks/*.jpg",
  { eager: true, import: "default" },
);

const bundledArtworkImages = Object.fromEntries(
  Object.entries(bundledArtworkModules).map(([path, image]) => [
    path.slice(path.lastIndexOf("/") + 1, -4),
    image,
  ]),
);

export function hasBundledArtworkImage(artworkId: string): boolean {
  return artworkId in bundledArtworkImages;
}

export function resolveArtworkImage(artwork: Artwork): string {
  return bundledArtworkImages[artwork.id] ?? artwork.imageUrl;
}
