import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fallbackArtworks, type Artwork, type ArtworkPreferences } from "../../shared/artwork";
import { useDailyArtworkRotation } from "./useDailyArtworkRotation";

describe("useDailyArtworkRotation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 26, 23, 59, 58));
  });

  afterEach(() => vi.useRealTimers());

  it("refreshes the selected artwork just after local midnight", async () => {
    const first = fallbackArtworks[0];
    const second = fallbackArtworks[1];
    const getToday = vi.fn().mockResolvedValue(second);
    const selected: Artwork[] = [];
    const preferences: ArtworkPreferences = {
      enabledMovements: ["classicism"],
      skippedArtworkIds: [],
      maxLuminance: 0.8,
      rotationSalt: "saved-user",
    };

    renderHook(() => useDailyArtworkRotation(first, preferences, (artwork) => selected.push(artwork), { getToday }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_500);
    });

    expect(getToday).toHaveBeenCalledWith(preferences);
    expect(selected).toEqual([second]);
  });
});
