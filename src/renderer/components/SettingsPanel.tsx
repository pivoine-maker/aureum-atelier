import { X } from "lucide-react";

import { artworkMovements, type ArtworkMovement } from "../../shared/artwork";
import type { AureumSettings, AureumSettingsUpdate } from "../../shared/settings";
import { themeModeLabels, themeModes } from "../../shared/theme";

type SettingsPanelProps = {
  settings: AureumSettings;
  onClose: () => void;
  onUpdate: (update: AureumSettingsUpdate) => void;
};

const movementLabels: Record<ArtworkMovement, string> = {
  classicism: "Classicism",
  neoclassicism: "Neoclassicism",
  baroque: "Baroque",
  romanticism: "Romanticism",
};

export function SettingsPanel({ settings, onClose, onUpdate }: SettingsPanelProps) {
  const toggleMovement = (movement: ArtworkMovement) => {
    const enabled = settings.enabledMovements.includes(movement);
    if (enabled && settings.enabledMovements.length === 1) return;
    onUpdate({
      enabledMovements: enabled
        ? settings.enabledMovements.filter((entry) => entry !== movement)
        : [...settings.enabledMovements, movement],
    });
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        aria-label="Settings"
        aria-modal="true"
        className="settings-panel aureum-panel"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="modal-header">
          <div>
            <span className="panel-kicker">Preferences</span>
            <h2>Atelier Settings</h2>
          </div>
          <button aria-label="Close settings" className="icon-button" onClick={onClose} type="button">
            <X size={16} />
          </button>
        </header>

        <div className="settings-section">
          <div className="settings-section__heading">
            <strong>Visual mode</strong>
            <span>Choose how strongly the gallery surrounds your work.</span>
          </div>
          <div className="settings-mode-grid">
            {themeModes.map((mode) => (
              <button
                aria-pressed={settings.themeMode === mode}
                className={settings.themeMode === mode ? "settings-choice settings-choice--active" : "settings-choice"}
                key={mode}
                onClick={() => onUpdate({ themeMode: mode })}
                type="button"
              >
                <strong>{themeModeLabels[mode]}</strong>
                <span>{mode === "gallery" ? "Rich artwork" : mode === "atelier" ? "Balanced focus" : "Minimal distraction"}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="settings-section">
          <label className="settings-range">
            <span><strong>Background intensity</strong><output>{settings.backgroundIntensity}%</output></span>
            <input
              aria-label="Background intensity"
              max="100"
              min="0"
              onChange={(event) => onUpdate({ backgroundIntensity: Number(event.target.value) })}
              type="range"
              value={settings.backgroundIntensity}
            />
          </label>
        </div>

        <div className="settings-section">
          <div className="settings-section__heading">
            <strong>Artwork movements</strong>
            <span>At least one movement remains enabled.</span>
          </div>
          <div className="settings-check-grid">
            {artworkMovements.map((movement) => (
              <label key={movement}>
                <input
                  aria-label={movementLabels[movement]}
                  checked={settings.enabledMovements.includes(movement)}
                  onChange={() => toggleMovement(movement)}
                  type="checkbox"
                />
                <span>{movementLabels[movement]}</span>
              </label>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
