import { useEffect, useState } from "react";

import type { Artwork } from "../../shared/artwork";
import { resolveArtworkImage } from "../artworkAssets";

export function useArtworkImage(artwork: Artwork): string {
  const [image, setImage] = useState(() => resolveArtworkImage(artwork));

  useEffect(() => {
    let cancelled = false;
    setImage(resolveArtworkImage(artwork));

    void window.aureum?.artwork.resolveCachedImage(artwork.id)
      .then((fileUrl) => {
        if (!cancelled && fileUrl && canUseArtworkImage(fileUrl)) setImage(fileUrl);
      })
      .catch(() => undefined);

    const unsubscribe = window.aureum?.artwork.onCacheReady((event) => {
      if (!cancelled && event.artworkId === artwork.id && event.fileUrl && canUseArtworkImage(event.fileUrl)) setImage(event.fileUrl);
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [artwork]);

  return image;
}

export function canUseArtworkImage(source: string, pageProtocol = window.location.protocol): boolean {
  return pageProtocol === "file:" || !source.startsWith("file:");
}
