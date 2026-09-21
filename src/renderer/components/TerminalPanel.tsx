import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { Maximize2, Minimize2, Plus, RotateCcw, TerminalSquare, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import "@xterm/xterm/css/xterm.css";

type TerminalSessionView = {
  id: string;
  title: string;
  cwd?: string;
  shell: string;
  exited: boolean;
};

type TerminalRuntime = { terminal: Terminal; fit: FitAddon };

export function TerminalPanel() {
  const [sessions, setSessions] = useState<TerminalSessionView[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const runtimesRef = useRef(new Map<string, TerminalRuntime>());
  const sessionsRef = useRef<TerminalSessionView[]>([]);
  const terminalCountRef = useRef(0);
  const mountedRef = useRef(false);

  useEffect(() => { sessionsRef.current = sessions; }, [sessions]);

  const createSession = useCallback(async (input?: { cwd?: string; replaceId?: string; title?: string }) => {
    const created = await window.aureum.terminal.create(input?.cwd ? { cwd: input.cwd } : undefined);
    if (!mountedRef.current) {
      await window.aureum.terminal.kill(created.id);
      return;
    }
    const title = input?.title ?? `Terminal ${++terminalCountRef.current}`;
    const session: TerminalSessionView = {
      id: created.id,
      title,
      cwd: created.cwd ?? input?.cwd,
      shell: created.shell ?? "shell",
      exited: false,
    };
    setSessions((current) => input?.replaceId
      ? current.map((entry) => entry.id === input.replaceId ? session : entry)
      : [...current, session]);
    setActiveId(session.id);
  }, []);

  const killSession = useCallback(async (id: string) => {
    await window.aureum.terminal.kill(id);
    setSessions((current) => {
      const closingIndex = current.findIndex((session) => session.id === id);
      const next = current.filter((session) => session.id !== id);
      setActiveId((currentActiveId) => currentActiveId === id
        ? next[Math.min(closingIndex, next.length - 1)]?.id ?? null
        : currentActiveId);
      return next;
    });
  }, []);

  const activeSession = sessions.find((session) => session.id === activeId) ?? null;

  const restartActive = useCallback(async () => {
    if (!activeSession) return;
    await window.aureum.terminal.kill(activeSession.id);
    await createSession({ cwd: activeSession.cwd, replaceId: activeSession.id, title: activeSession.title });
  }, [activeSession, createSession]);

  useEffect(() => {
    mountedRef.current = true;
    void createSession();

    const offOutput = window.aureum.terminal.onOutput(({ id, data }) => {
      runtimesRef.current.get(id)?.terminal.write(data);
    });
    const offExit = window.aureum.terminal.onExit(({ id, exitCode }) => {
      runtimesRef.current.get(id)?.terminal.writeln(`\r\n[process exited ${exitCode}]`);
      setSessions((current) => current.map((session) => session.id === id ? { ...session, exited: true } : session));
    });

    return () => {
      mountedRef.current = false;
      offOutput();
      offExit();
      for (const session of sessionsRef.current) void window.aureum.terminal.kill(session.id);
    };
  }, [createSession]);

  useEffect(() => {
    if (!activeId) return;
    const currentId = activeId;
    const runtime = runtimesRef.current.get(currentId);
    if (!runtime) return;
    requestAnimationFrame(() => {
      runtime.fit.fit();
      void window.aureum.terminal.resize({ id: currentId, cols: runtime.terminal.cols, rows: runtime.terminal.rows });
      runtime.terminal.focus();
    });
  }, [activeId, isMaximized, sessions]);

  return (
    <section aria-label="Integrated terminal" className={`terminal-panel${isMaximized ? " terminal-panel--maximized" : ""}`}>
      <div className="terminal-drawer__head">
        <div aria-label="Terminal sessions" className="terminal-tabs" role="tablist">
          {sessions.map((session) => (
            <button
              aria-selected={session.id === activeId}
              className={`terminal-tab${session.id === activeId ? " terminal-tab--active" : ""}`}
              key={session.id}
              onClick={() => setActiveId(session.id)}
              role="tab"
              title={session.cwd}
              type="button"
            >
              <TerminalSquare size={12} /> {session.title}{session.exited ? " (exited)" : ""}
            </button>
          ))}
        </div>
        <span className="terminal-state">{activeSession?.shell ?? "closed"}</span>
        <span className="terminal-drawer__spacer" />
        <button aria-label="New terminal" className="icon-button" onClick={() => void createSession()} type="button"><Plus size={14} /></button>
        <button aria-label="Restart terminal" className="icon-button" disabled={!activeSession} onClick={() => void restartActive()} type="button"><RotateCcw size={13} /></button>
        <button aria-label={isMaximized ? "Restore terminal" : "Maximize terminal"} className="icon-button" onClick={() => setIsMaximized((current) => !current)} type="button">
          {isMaximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
        <button aria-label="Kill terminal" className="icon-button" disabled={!activeId} onClick={() => activeId ? void killSession(activeId) : undefined} type="button"><Trash2 size={14} /></button>
      </div>
      <div className="terminal-hosts">
        {sessions.map((session) => (
          <TerminalHost
            active={session.id === activeId}
            key={session.id}
            onRuntime={(runtime) => {
              if (runtime) runtimesRef.current.set(session.id, runtime);
              else runtimesRef.current.delete(session.id);
            }}
            session={session}
          />
        ))}
      </div>
    </section>
  );
}

function TerminalHost({ session, active, onRuntime }: { session: TerminalSessionView; active: boolean; onRuntime: (runtime: TerminalRuntime | null) => void }) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily: "JetBrains Mono, SFMono-Regular, monospace",
      fontSize: 10,
      lineHeight: 1.35,
      theme: {
        background: "#050403", foreground: "#cbbfae", cursor: "#ffe3a1", black: "#080604",
        red: "#d45a4c", green: "#7fa35a", yellow: "#d8b45a", blue: "#6d91b8",
        magenta: "#b37793", cyan: "#6e9d93", white: "#f4e8cf",
      },
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(host);
    onRuntime({ terminal, fit });

    const inputDisposable = terminal.onData((data) => void window.aureum.terminal.write({ id: session.id, data }));
    const resizeObserver = new ResizeObserver(() => {
      if (!host.offsetParent && !active) return;
      fit.fit();
      void window.aureum.terminal.resize({ id: session.id, cols: terminal.cols, rows: terminal.rows });
    });
    resizeObserver.observe(host);

    return () => {
      resizeObserver.disconnect();
      inputDisposable.dispose();
      terminal.dispose();
      onRuntime(null);
    };
  }, [session.id]);

  return <div aria-hidden={!active} className={`xterm-host${active ? " xterm-host--active" : ""}`} ref={hostRef} />;
}
