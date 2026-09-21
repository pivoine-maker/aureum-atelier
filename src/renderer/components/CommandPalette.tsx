import { Command, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

export type PaletteCommand = {
  id: string;
  label: string;
  detail: string;
  shortcut?: string;
  run: () => void;
};

type CommandPaletteProps = {
  commands: PaletteCommand[];
  onClose: () => void;
};

export function CommandPalette({ commands, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const visibleCommands = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return commands;
    return commands.filter((command) => `${command.label} ${command.detail}`.toLowerCase().includes(normalized));
  }, [commands, query]);

  useEffect(() => {
    inputRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Enter" && visibleCommands[0]) {
        event.preventDefault();
        visibleCommands[0].run();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, visibleCommands]);

  return (
    <div className="modal-backdrop command-palette-backdrop" onMouseDown={onClose}>
      <section
        aria-label="Command palette"
        aria-modal="true"
        className="command-menu aureum-panel"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="command-menu__search">
          <Search size={15} />
          <input
            aria-label="Search commands"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Type a command…"
            ref={inputRef}
            value={query}
          />
          <button aria-label="Close command palette" className="icon-button" onClick={onClose} type="button"><X size={14} /></button>
        </div>
        <div className="command-menu__list">
          {visibleCommands.length > 0 ? visibleCommands.map((command) => (
            <button
              aria-label={command.label}
              key={command.id}
              onClick={() => {
                command.run();
                onClose();
              }}
              type="button"
            >
              <span className="command-menu__icon"><Command size={13} /></span>
              <span><strong>{command.label}</strong><small>{command.detail}</small></span>
              {command.shortcut ? <kbd>{command.shortcut}</kbd> : null}
            </button>
          )) : <div className="command-menu__empty">No matching commands</div>}
        </div>
      </section>
    </div>
  );
}
