import { CheckCircle2, ExternalLink, GitBranch, Heart, History, Palette, Shuffle, SkipForward, Wifi } from "lucide-react";
import { useState } from "react";

import type { Artwork } from "../../shared/artwork";
import type { ThemeMode } from "../../shared/theme";

type StatusBarProps = {
  artwork: Artwork;
  artworkHistory: Artwork[];
  isFavorite: boolean;
  mode: ThemeMode;
  branch: string | null;
  onNextArtwork: () => void;
  onFavorite: () => void;
  onSkipArtwork: () => void;
  onSelectHistory: (artwork: Artwork) => void;
};

export function StatusBar({
  artwork,
  artworkHistory,
  isFavorite,
  mode,
  branch,
  onNextArtwork,
  onFavorite,
  onSkipArtwork,
  onSelectHistory,
}: StatusBarProps) {
  const [historyOpen, setHistoryOpen] = useState(false);

  return (
    <footer className="status-bar">
      <div className="status-bar__group">
        <span><GitBranch size={12} /> {branch ?? "no git"}</span>
        <span><CheckCircle2 size={12} /> 0 problems</span>
      </div>
      <div className="artwork-credit">
        <Palette size={12} />
        <span className="artwork-credit__label">Today’s masterwork</span>
        <strong title={artwork.title}>{artwork.title}</strong>
        <span>· {artwork.artist}, {artwork.year}</span>
        <div className="artwork-controls">
          <button aria-label="Next artwork" onClick={onNextArtwork} title="Next eligible artwork" type="button"><Shuffle size={11} /></button>
          <button aria-label="Favorite artwork" aria-pressed={isFavorite} className={isFavorite ? "artwork-control--active" : ""} onClick={onFavorite} title="Favorite" type="button"><Heart fill={isFavorite ? "currentColor" : "none"} size={11} /></button>
          <button aria-label="Skip artwork" onClick={onSkipArtwork} title="Skip from future rotation" type="button"><SkipForward size={11} /></button>
          <div className="artwork-history-wrap">
            <button aria-expanded={historyOpen} aria-label="Artwork history" onClick={() => setHistoryOpen((current) => !current)} title="Artwork history" type="button"><History size={11} /></button>
            {historyOpen ? (
              <div className="artwork-history-menu">
                <span>Artwork history</span>
                {artworkHistory.map((entry) => (
                  <button key={entry.id} onClick={() => { onSelectHistory(entry); setHistoryOpen(false); }} type="button">
                    <strong>{entry.title}</strong><small>{entry.artist} · {entry.movement}</small>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <a aria-label="Open artwork source" href={artwork.sourceUrl} rel="noreferrer" target="_blank" title={`${artwork.museum} · ${artwork.license}`}><ExternalLink size={11} /></a>
        </div>
      </div>
      <div className="status-bar__group status-bar__group--right">
        <span className="status-mode">{mode}</span>
        <span><Wifi size={12} /> Codex connected</span>
        <span>UTF-8</span>
      </div>
    </footer>
  );
}
