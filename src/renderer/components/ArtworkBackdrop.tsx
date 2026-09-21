import type { CSSProperties } from "react";

import type { Artwork } from "../../shared/artwork";
import type { ThemeMode } from "../../shared/theme";
import { useArtworkImage } from "../artwork/useArtworkImage";

type ArtworkBackdropProps = {
  artwork: Artwork;
  mode: ThemeMode;
  intensity: number;
};

export function ArtworkBackdrop({ artwork, mode, intensity }: ArtworkBackdropProps) {
  const artworkImage = useArtworkImage(artwork);
  const style = {
    "--artwork-image": `url("${artworkImage}")`,
    "--artwork-intensity": String(intensity / 100),
  } as CSSProperties;

  return (
    <div
      aria-hidden="true"
      className={`artwork-backdrop artwork-backdrop--${mode}`}
      style={style}
    >
      <div className="artwork-backdrop__image" />
      <div className="artwork-backdrop__scrim" />
      <div className="artwork-backdrop__grain" />
    </div>
  );
}
