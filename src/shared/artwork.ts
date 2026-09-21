import { artworkCatalog } from "./artworkCatalog";

export const artworkMovements = ["classicism", "neoclassicism", "baroque", "romanticism"] as const;

export type ArtworkMovement = (typeof artworkMovements)[number];

export type ArtworkLicense = "public-domain" | "cc0" | "cc-by";

export type ArtworkComposition = "landscape" | "portrait" | "square";

export type Artwork = {
  id: string;
  title: string;
  artist: string;
  year?: string;
  movement: ArtworkMovement;
  museum: string;
  sourceUrl: string;
  imageUrl: string;
  license: ArtworkLicense;
  dominantColors: string[];
  luminanceScore: number;
  composition: ArtworkComposition;
  tags: string[];
};

export type ArtworkPreferences = {
  enabledMovements: ArtworkMovement[];
  skippedArtworkIds: string[];
  maxLuminance: number;
  rotationSalt: string;
};

export const fallbackArtworks: Artwork[] = artworkCatalog;

export function pickDailyArtwork(date: Date, library: Artwork[], preferences: ArtworkPreferences): Artwork {
  const eligible = getEligibleArtworks(library, preferences);

  if (eligible.length === 0) {
    return library[0] ?? fallbackArtworks[0];
  }

  const dayNumber = getLocalDayNumber(date);
  const saltOffset = hashString(preferences.rotationSalt) % eligible.length;
  const index = (dayNumber + saltOffset) % eligible.length;
  return eligible[index];
}

export function pickNextArtwork(currentId: string, library: Artwork[], preferences: ArtworkPreferences): Artwork {
  const eligible = getEligibleArtworks(library, preferences);
  if (eligible.length === 0) return library[0] ?? fallbackArtworks[0];
  const currentIndex = eligible.findIndex((artwork) => artwork.id === currentId);
  return eligible[(currentIndex + 1 + eligible.length) % eligible.length];
}

function getEligibleArtworks(library: Artwork[], preferences: ArtworkPreferences): Artwork[] {
  return library.filter((artwork) => (
    preferences.enabledMovements.includes(artwork.movement) &&
    !preferences.skippedArtworkIds.includes(artwork.id) &&
    artwork.luminanceScore <= preferences.maxLuminance
  ));
}

function getLocalDayNumber(date: Date): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
}

function hashString(input: string): number {
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}
