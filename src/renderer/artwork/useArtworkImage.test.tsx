import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fallbackArtworks } from "../../shared/artwork";
import { canUseArtworkImage, useArtworkImage } from "./useArtworkImage";

const artwork = fallbackArtworks[0];
let readyListener: ((event: { artworkId: string; fileUrl: string | null }) => void) | null = null;

describe("useArtworkImage", () => {
  beforeEach(() => {
    readyListener = null;
    window.aureum = {
      ...window.aureum,
      artwork: {
        getToday: vi.fn().mockResolvedValue(artwork),
        resolveCachedImage: vi.fn().mockResolvedValue("https://example.com/cached-artwork.jpg"),
        onCacheReady: vi.fn().mockImplementation((listener) => {
          readyListener = listener;
          return vi.fn();
        }),
      },
    };
  });

  it("uses the bundled fallback immediately then upgrades to cached artwork", async () => {
    const { result } = renderHook(() => useArtworkImage(artwork));

    expect(result.current).not.toBe("https://example.com/cached-artwork.jpg");
    await waitFor(() => expect(result.current).toBe("https://example.com/cached-artwork.jpg"));
    expect(window.aureum.artwork.resolveCachedImage).toHaveBeenCalledWith(artwork.id);
  });

  it("keeps the bundled fallback when cache resolution fails", async () => {
    window.aureum.artwork.resolveCachedImage = vi.fn().mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useArtworkImage(artwork));
    const bundled = result.current;

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(result.current).toBe(bundled);
  });

  it("upgrades when the main process announces cache readiness", async () => {
    window.aureum.artwork.resolveCachedImage = vi.fn().mockResolvedValue(null);
    const { result } = renderHook(() => useArtworkImage(artwork));

    act(() => readyListener?.({ artworkId: artwork.id, fileUrl: "https://example.com/ready.jpg" }));

    expect(result.current).toBe("https://example.com/ready.jpg");
  });

  it("keeps the bundled image when an http development page receives a blocked file URL", async () => {
    window.aureum.artwork.resolveCachedImage = vi.fn().mockResolvedValue("file:///cached-artwork.jpg");
    const { result } = renderHook(() => useArtworkImage(artwork));
    const bundled = result.current;

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(canUseArtworkImage("file:///cached-artwork.jpg", "http:")).toBe(false);
    expect(canUseArtworkImage("file:///cached-artwork.jpg", "file:")).toBe(true);
    expect(result.current).toBe(bundled);
  });
});
