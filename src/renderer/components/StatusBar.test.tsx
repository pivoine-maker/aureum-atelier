import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { fallbackArtworks } from "../../shared/artwork";
import { StatusBar } from "./StatusBar";

describe("StatusBar artwork controls", () => {
  it("controls daily artwork and exposes source metadata", () => {
    const next = vi.fn();
    const favorite = vi.fn();
    const skip = vi.fn();
    render(
      <StatusBar
        artwork={fallbackArtworks[0]}
        artworkHistory={fallbackArtworks.slice(0, 2)}
        branch="main"
        isFavorite={false}
        mode="atelier"
        onFavorite={favorite}
        onNextArtwork={next}
        onSelectHistory={vi.fn()}
        onSkipArtwork={skip}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Next artwork" }));
    expect(next).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Favorite artwork" }));
    expect(favorite).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Skip artwork" }));
    expect(skip).toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Open artwork source" })).toHaveAttribute("href", fallbackArtworks[0].sourceUrl);
  });
});
