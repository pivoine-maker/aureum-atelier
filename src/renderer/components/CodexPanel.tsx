import {
  Bot,
  CircleStop,
  FileDiff,
  MoreHorizontal,
  Paperclip,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";

import type { CodexApprovalDecision, CodexApprovalMode, CodexApprovalRequest, CodexSkill, CodexThreadGoal } from "../../shared/codex";
import type { GitChange } from "../../shared/git";
import type { CodexAttachment, CodexMessage, CodexSession, CodexSessionStatus } from "../codex/useCodex";
import { GitChanges } from "./GitChanges";
import { MarkdownMessage } from "./MarkdownMessage";

type CodexPanelProps = {
  sessions: CodexSession[];
  recentSessions: CodexSession[];
  activeSessionId: string;
  messages: CodexMessage[];
  isRunning: boolean;
  status: CodexSessionStatus;
  error: string | null;
  attachments: CodexAttachment[];
  selectedSkills: CodexSkill[];
  activeGoal: CodexThreadGoal | null;
  approvals: CodexApprovalRequest[];
  draft: string;
  runningSessionCount: number;
  workspaceOpen: boolean;
  hidden?: boolean;
  onClosePanel?: () => void;
  approvalMode: CodexApprovalMode;
  composerRef: RefObject<HTMLTextAreaElement | null>;
  onDraftChange: (draft: string) => void;
  onSubmit: (prompt?: string) => Promise<void>;
  onStop: (sessionId?: string) => Promise<void>;
  onNotice: (message: string) => void;
  onNewSession: () => void;
  onSelectSession: (id: string) => void;
  onCloseSession: (id: string) => void;
  onReopenSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onPickAttachments: () => Promise<void>;
  onRemoveAttachment: (path: string) => void;
  onListSkills: () => Promise<CodexSkill[]>;
  onAddSkill: (skill: CodexSkill) => void;
  onRemoveSkill: (path: string) => void;
  onLoadGoal: () => Promise<CodexThreadGoal | null>;
  onSetGoal: (objective: string) => Promise<CodexThreadGoal | null>;
  onClearGoal: () => Promise<boolean>;
  onRespondToApproval: (approvalId: string, decision: CodexApprovalDecision) => Promise<void>;
  gitChanges: GitChange[];
};

const slashCommands = [
  { command: "/skills", title: "Skills", detail: "Browse native Codex skills", requiresArgument: false },
  { command: "/goal", title: "Goal", detail: "Show the current Session goal", requiresArgument: false },
  { command: "/goal set", title: "Set Goal", detail: "Set a Session goal", requiresArgument: true },
  { command: "/goal clear", title: "Clear Goal", detail: "Clear the Session goal", requiresArgument: false },
  { command: "/new", title: "New Session", detail: "Open another Codex Session", requiresArgument: false },
  { command: "/close", title: "Close Session", detail: "Close this tab without deleting it", requiresArgument: false },
  { command: "/help", title: "Help", detail: "List available commands", requiresArgument: false },
];

export function CodexPanel({
  sessions,
  recentSessions,
  activeSessionId,
  messages,
  isRunning,
  status,
  error,
  attachments,
  selectedSkills,
  activeGoal,
  approvals,
  draft,
  runningSessionCount,
  workspaceOpen,
  hidden = false,
  onClosePanel = () => undefined,
  approvalMode,
  composerRef,
  onDraftChange,
  onSubmit,
  onStop,
  onNotice,
  onNewSession,
  onSelectSession,
  onCloseSession,
  onReopenSession,
  onDeleteSession,
  onPickAttachments,
  onRemoveAttachment,
  onListSkills,
  onAddSkill,
  onRemoveSkill,
  onLoadGoal,
  onSetGoal,
  onClearGoal,
  onRespondToApproval,
  gitChanges,
}: CodexPanelProps) {
  const [sessionMenuOpen, setSessionMenuOpen] = useState(false);
  const [slashMenuExpanded, setSlashMenuExpanded] = useState(() => draft.trimStart().startsWith("/"));
  const [slashCommandIndex, setSlashCommandIndex] = useState(0);
  const [skillResults, setSkillResults] = useState<CodexSkill[]>([]);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const composerSurfaceRef = useRef<HTMLDivElement | null>(null);
  const activeSession = sessions.find((session) => session.id === activeSessionId);
  const slashDraft = draft.trimStart();
  const enteringSlashCommandArguments = slashCommands.some((entry) => entry.requiresArgument && slashDraft.startsWith(`${entry.command} `));
  const slashMenuOpen = workspaceOpen
    && !isRunning
    && slashMenuExpanded
    && slashDraft.startsWith("/")
    && !enteringSlashCommandArguments
    && !skillsOpen;
  const visibleSlashCommands = useMemo(() => {
    if (!slashMenuOpen) return [];
    const queryTerms = slashDraft.slice(1).trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (queryTerms.length === 0) return slashCommands;
    return slashCommands.filter((entry) => {
      const searchableText = `${entry.command.slice(1)} ${entry.title} ${entry.detail}`.toLowerCase();
      return queryTerms.every((term) => searchableText.includes(term));
    });
  }, [slashDraft, slashMenuOpen]);

  useEffect(() => {
    setSlashCommandIndex(0);
  }, [slashDraft]);

  useEffect(() => {
    setSlashMenuExpanded(draft.trimStart().startsWith("/"));
    setSkillsOpen(false);
    setSkillResults([]);
  }, [activeSessionId]);

  useEffect(() => {
    if (!slashMenuExpanded && !skillsOpen) return;
    const dismissPopovers = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Node && composerSurfaceRef.current?.contains(target)) return;
      setSlashMenuExpanded(false);
      setSkillsOpen(false);
      setSkillResults([]);
    };
    document.addEventListener("mousedown", dismissPopovers);
    return () => document.removeEventListener("mousedown", dismissPopovers);
  }, [skillsOpen, slashMenuExpanded]);

  const submit = async () => {
    const prompt = draft.trim();
    if (!workspaceOpen || !prompt || isRunning) return;
    if (prompt.startsWith("/")) {
      await executeSlashCommand(prompt);
      return;
    }
    await onSubmit(prompt);
  };

  const executeSlashCommand = async (rawCommand: string) => {
    const command = rawCommand.trim();
    setSlashMenuExpanded(false);
    try {
      if (command === "/skills") {
        setSkillsLoading(true);
        const skills = await onListSkills();
        setSkillResults(skills);
        setSkillsOpen(skills.length > 0);
        if (skills.length === 0) onNotice("No enabled Codex skills found for this workspace.");
        return;
      }
      if (command === "/goal") {
        const goal = await onLoadGoal();
        onNotice(goal ? `Goal: ${goal.objective}` : "No goal is set for this Session.");
        onDraftChange("");
        return;
      }
      if (command.startsWith("/goal set")) {
        const objective = command.slice("/goal set".length).trim();
        if (!objective) {
          onNotice("Usage: /goal set <objective>");
          return;
        }
        const goal = await onSetGoal(objective);
        onNotice(goal ? `Goal set: ${goal.objective}` : "Goal was not set.");
        onDraftChange("");
        return;
      }
      if (command === "/goal clear") {
        const cleared = await onClearGoal();
        onNotice(cleared ? "Goal cleared." : "No goal to clear.");
        onDraftChange("");
        return;
      }
      if (command === "/new") {
        onNewSession();
        onDraftChange("");
        return;
      }
      if (command === "/close") {
        if (activeSessionId) onCloseSession(activeSessionId);
        onDraftChange("");
        return;
      }
      if (command === "/help") {
        onNotice(`Commands: ${slashCommands.map((entry) => entry.command).join(", ")}`);
        onDraftChange("");
        return;
      }
      const selectedCommand = visibleSlashCommands[slashCommandIndex] ?? visibleSlashCommands[0];
      if (selectedCommand) {
        await executeSlashCommand(selectedCommand.command);
      }
    } catch (caughtError) {
      onNotice(caughtError instanceof Error ? caughtError.message : "Codex command failed");
    } finally {
      setSkillsLoading(false);
      setSlashCommandIndex(0);
    }
  };

  const selectSlashCommand = (entry: (typeof slashCommands)[number]) => {
    setSlashMenuExpanded(false);
    setSlashCommandIndex(0);
    if (entry.requiresArgument) {
      onDraftChange(`${entry.command} `);
      requestAnimationFrame(() => composerRef.current?.focus());
      return;
    }
    void executeSlashCommand(entry.command);
  };

  const handleDraftChange = (value: string) => {
    onDraftChange(value);
    setSlashCommandIndex(0);
    setSkillsOpen(false);
    setSkillResults([]);
    const trimmedStart = value.trimStart();
    const enteringArguments = slashCommands.some((entry) => entry.requiresArgument && trimmedStart.startsWith(`${entry.command} `));
    setSlashMenuExpanded(trimmedStart.startsWith("/") && !enteringArguments);
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (skillsOpen && event.key === "Escape") {
      event.preventDefault();
      setSkillsOpen(false);
      setSkillResults([]);
      return;
    }
    if (slashMenuOpen && visibleSlashCommands.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSlashCommandIndex((current) => (current + 1) % visibleSlashCommands.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSlashCommandIndex((current) => (current - 1 + visibleSlashCommands.length) % visibleSlashCommands.length);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setSlashMenuExpanded(false);
        setSlashCommandIndex(0);
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        const selectedCommand = visibleSlashCommands[slashCommandIndex] ?? visibleSlashCommands[0];
        const normalizedDraft = slashDraft.trim();
        const exactCommand = slashCommands.find((entry) => entry.command === normalizedDraft);
        const commandWithArguments = slashCommands.some((entry) => entry.requiresArgument && normalizedDraft.startsWith(`${entry.command} `));
        if (commandWithArguments || (exactCommand && !exactCommand.requiresArgument)) {
          void executeSlashCommand(draft);
        } else if (selectedCommand) {
          selectSlashCommand(selectedCommand);
        } else {
          void executeSlashCommand(draft);
        }
        return;
      }
    }
    if (draft.trimStart().startsWith("/") && event.key === "Enter") {
      event.preventDefault();
      void executeSlashCommand(draft);
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void submit();
  };

  const pickAttachments = async () => {
    try {
      await onPickAttachments();
    } catch (caughtError) {
      onNotice(caughtError instanceof Error ? caughtError.message : "Could not attach file");
    }
  };

  return (
    <aside aria-hidden={hidden} aria-label="Codex panel" className="codex-panel aureum-panel" hidden={hidden} id="codex-panel">
      <div className="codex-panel__header">
        <div className="codex-panel__title">
          <span className="panel-kicker__eyebrow">Codex</span>
          <h2 title={activeSession?.title}>{activeSession?.title ?? "Atelier Session"}</h2>
        </div>
        <div className="codex-panel__actions">
          <span className={`live-indicator live-indicator--${status}`}><i /> {runningSessionCount > 0 ? `${runningSessionCount} running` : status}</span>
          <button aria-label="Close Codex panel" className="icon-button panel-close-button" onClick={onClosePanel} type="button">
            <X size={13} />
          </button>
          <div className="codex-menu-wrap">
            <button aria-expanded={sessionMenuOpen} aria-label="Session actions" className="icon-button" onClick={() => setSessionMenuOpen((current) => !current)} type="button">
              <MoreHorizontal size={16} />
            </button>
            {sessionMenuOpen ? (
              <div className="codex-session-menu">
                <button aria-label="New Codex session" disabled={!workspaceOpen} onClick={() => { onNewSession(); setSessionMenuOpen(false); }} type="button"><Plus size={12} /> New session</button>
                <span>Open sessions</span>
                {sessions.slice().reverse().map((session) => (
                  <div className={session.id === activeSessionId ? "codex-session-menu__row codex-session-menu__row--active" : "codex-session-menu__row"} key={session.id}>
                    <button onClick={() => { onSelectSession(session.id); setSessionMenuOpen(false); }} title={session.title} type="button">{session.title}</button>
                    <button aria-label={`Delete ${session.title}`} disabled={session.status === "running"} onClick={() => onDeleteSession(session.id)} type="button"><Trash2 size={11} /></button>
                  </div>
                ))}
                {recentSessions.length > 0 ? <span>Recent sessions</span> : null}
                {recentSessions.map((session) => (
                  <div className="codex-session-menu__row" key={session.id}>
                    <button aria-label={`Reopen ${session.title}`} onClick={() => { onReopenSession(session.id); setSessionMenuOpen(false); }} title={session.title} type="button">{session.title}</button>
                    <button aria-label={`Delete ${session.title}`} disabled={session.status === "running"} onClick={() => onDeleteSession(session.id)} type="button"><Trash2 size={11} /></button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div aria-label="Codex sessions" className="codex-session-tabs" role="tablist">
        {sessions.map((session) => (
          <div className={session.id === activeSessionId ? "codex-session-tab-wrap codex-session-tab-wrap--active" : "codex-session-tab-wrap"} key={session.id}>
            <button
              aria-label={`${session.title} · ${session.status}`}
              aria-selected={session.id === activeSessionId}
              className="codex-session-tab"
              onClick={() => onSelectSession(session.id)}
              role="tab"
              title={`${session.title} · ${session.status}`}
              type="button"
            >
              <i className={`codex-session-tab__status codex-session-tab__status--${session.status}`} />
              <span>{session.title}</span>
              <small>{(session.approvals?.length ?? 0) > 0 ? `${session.approvals.length} approval` : session.status}</small>
            </button>
            <button aria-label={`Close ${session.title}`} className="codex-session-tab__close" onClick={() => onCloseSession(session.id)} type="button"><X size={10} /></button>
          </div>
        ))}
        <button aria-label="New Codex session" className="codex-session-tabs__new" disabled={!workspaceOpen} onClick={onNewSession} type="button"><Plus size={13} /></button>
      </div>

      <div className="codex-thread">
        {messages.length === 0 ? <EmptyCodexThread workspaceOpen={workspaceOpen} /> : messages.map((message) => <CodexBubble key={message.id} message={message} />)}
        <GitChanges changes={gitChanges} />
        {approvals.map((approval) => (
          <ApprovalCard approval={approval} key={approval.id} onRespond={onRespondToApproval} />
        ))}
        {error ? <div className="codex-error">{error}</div> : null}
      </div>

      <div className="composer" ref={composerSurfaceRef}>
        {activeGoal ? <div className="composer-goal">Goal · {activeGoal.objective}</div> : null}
        {attachments.length > 0 ? (
          <div className="composer-attachments">
            {attachments.map((attachment) => (
              <span className="composer-attachment" key={attachment.path} title={attachment.path}>
                <Paperclip size={10} />
                <span className="composer-attachment__text">
                  <span>{attachment.displayName ?? attachment.path.split(/[\\/]/).at(-1)}</span>
                  {attachmentSummary(attachment) ? <small>{attachmentSummary(attachment)}</small> : null}
                </span>
                <button aria-label={`Remove ${attachment.path}`} onClick={() => onRemoveAttachment(attachment.path)} type="button"><X size={10} /></button>
              </span>
            ))}
          </div>
        ) : null}
        {selectedSkills.length > 0 ? (
          <div className="composer-skills">
            {selectedSkills.map((skill) => (
              <span key={skill.path} title={skill.description}>
                <Sparkles size={10} /> {skill.name}
                <button aria-label={`Remove skill ${skill.name}`} onClick={() => onRemoveSkill(skill.path)} type="button"><X size={10} /></button>
              </span>
            ))}
          </div>
        ) : null}
        {slashMenuOpen && visibleSlashCommands.length > 0 ? (
          <div aria-label="Codex commands" className="slash-menu" role="listbox">
            {visibleSlashCommands.map((entry, index) => (
              <button
                aria-selected={index === slashCommandIndex}
                className={index === slashCommandIndex ? "slash-menu__item slash-menu__item--active" : "slash-menu__item"}
                key={entry.command}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectSlashCommand(entry)}
                role="option"
                type="button"
              >
                <strong>{entry.command}</strong><span>{entry.detail}</span>
              </button>
            ))}
          </div>
        ) : null}
        {skillsOpen ? (
          <div aria-label="Codex skills" className="skill-picker" role="listbox">
            {skillsLoading ? <span>Loading skills…</span> : null}
            {skillResults.map((skill) => (
              <button
                key={skill.path}
                onClick={() => {
                  onAddSkill(skill);
                  setSkillsOpen(false);
                  setSkillResults([]);
                  onDraftChange("");
                }}
                role="option"
                type="button"
              >
                <strong>{skill.name}</strong><span>{skill.shortDescription ?? skill.description}</span>
              </button>
            ))}
          </div>
        ) : null}
        <textarea
          aria-label="Message Codex"
          disabled={isRunning || !workspaceOpen}
          ref={composerRef}
          onChange={(event) => handleDraftChange(event.target.value)}
          onKeyDown={handleComposerKeyDown}
          placeholder="Ask Codex to change this workspace…"
          rows={3}
          value={draft}
        />
        <div className="composer__footer">
          <button aria-label="Attach files" className="icon-button" disabled={isRunning || !workspaceOpen} onClick={() => void pickAttachments()} title="Attach local files" type="button">
            <Paperclip size={15} />
          </button>
          <span className="composer__spacer" />
          <span className="approval-mode" title="Uses the same unrestricted local execution mode as Codex Desktop"><ShieldCheck size={12} /> Codex Native · {approvalMode}</span>
          {isRunning ? (
            <button aria-label="Stop Codex" className="send-button send-button--stop" onClick={() => void onStop(activeSessionId)} type="button"><CircleStop size={15} /></button>
          ) : (
            <button aria-label="Send message" className="send-button" disabled={!workspaceOpen} onClick={() => void submit()} type="button"><Send size={15} /></button>
          )}
        </div>
      </div>
    </aside>
  );
}

function attachmentSummary(attachment: CodexAttachment): string | null {
  const format = attachment.format?.toLowerCase();
  if (attachment.kind === "video") {
    const frameCount = attachment.metadata?.frameCount ?? attachment.mediaPaths?.length ?? 0;
    return [format, `${frameCount} ${frameCount === 1 ? "frame" : "frames"}`].filter(Boolean).join(" · ");
  }
  return format ?? null;
}

function ApprovalCard({
  approval,
  onRespond,
}: {
  approval: CodexApprovalRequest;
  onRespond: (approvalId: string, decision: CodexApprovalDecision) => Promise<void>;
}) {
  const isGuardianDenial = approval.type === "guardian-denial";
  return (
    <section aria-label={approval.title} className="codex-approval" role="region">
      <div className="codex-approval__head"><ShieldCheck size={14} /><strong>{approval.title}</strong></div>
      {approval.riskLevel ? <div className={`codex-approval__risk codex-approval__risk--${approval.riskLevel}`}>{approval.riskLevel} risk</div> : null}
      {approval.actionLabel ? <small>Action: {approval.actionLabel}</small> : null}
      {approval.reason ? <p>{approval.reason}</p> : null}
      {approval.command ? <code>{approval.command}</code> : null}
      {approval.cwd ? <small>Working directory: {approval.cwd}</small> : null}
      {!isGuardianDenial && approval.grantRoot ? <small>Requested path: {approval.grantRoot}</small> : null}
      <div className="codex-approval__actions">
        <button onClick={() => void onRespond(approval.id, "decline")} type="button">Deny</button>
        {isGuardianDenial ? null : <button onClick={() => void onRespond(approval.id, "acceptForSession")} type="button">Allow for session</button>}
        <button className="codex-approval__allow" onClick={() => void onRespond(approval.id, "accept")} type="button">Allow once</button>
      </div>
    </section>
  );
}

function EmptyCodexThread({ workspaceOpen }: { workspaceOpen: boolean }) {
  return (
    <div className="assistant-message">
      <div className="assistant-message__identity">
        <span className="codex-orb"><Sparkles size={13} /></span>
        <div><strong>Codex</strong><span>Local CLI bridge</span></div>
      </div>
      <p>{workspaceOpen
        ? "Attach local files, then ask Codex to inspect or modify this workspace. Sessions are saved locally in Aureum Atelier."
        : "Open a workspace before starting a Codex session."}</p>
      <div className="change-summary">
        <div className="change-summary__head"><span><FileDiff size={13} /> Workbench</span><span className="change-summary__count">READY</span></div>
        <div className="change-summary__row"><span className="file-type file-type--tsx">AI</span> Streaming JSONL task <span>ready</span></div>
      </div>
    </div>
  );
}

function CodexBubble({ message }: { message: CodexMessage }) {
  if (message.role === "user") return <div className="user-message"><span className="message-label">You</span><p>{message.content}</p></div>;
  if (message.role === "event") return <div className="tool-call"><div className="tool-call__icon"><Bot size={14} /></div><div><strong>Codex event</strong><span>{message.content}</span></div></div>;
  return (
    <div className="assistant-message">
      <div className="assistant-message__identity"><span className="codex-orb"><Sparkles size={13} /></span><div><strong>Codex</strong><span>Assistant</span></div></div>
      <MarkdownMessage content={message.content} />
    </div>
  );
}
