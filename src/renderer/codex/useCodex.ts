import { useCallback, useEffect, useMemo, useState } from "react";

import type { CodexApprovalDecision, CodexApprovalMode, CodexApprovalRequest, CodexAttachment, CodexRoutedEvent, CodexSkill, CodexThreadGoal, CodexUiEvent } from "../../shared/codex";

export type { CodexAttachment } from "../../shared/codex";

export type CodexMessage = {
  id: string;
  role: "user" | "assistant" | "event";
  content: string;
};

export type CodexSessionStatus = "ready" | "running" | "failed" | "completed";

export type CodexSession = {
  id: string;
  workspaceRoot: string;
  workspaceName: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: CodexMessage[];
  attachments: CodexAttachment[];
  selectedSkills: CodexSkill[];
  goal: CodexThreadGoal | null;
  approvals: CodexApprovalRequest[];
  draft: string;
  status: CodexSessionStatus;
  error: string | null;
  threadId?: string;
  closedAt?: string;
};

const storageKey = "aureum.codex.sessions.v1";

export function useCodex(workspaceRoot: string | null, workspaceName: string | null) {
  const initialState = useMemo(() => loadSessionState(workspaceRoot, workspaceName), []);
  const [allSessions, setAllSessions] = useState<CodexSession[]>(initialState.sessions);
  const [activeSessionIdsByWorkspace, setActiveSessionIdsByWorkspace] = useState<Record<string, string>>(initialState.activeSessionIdsByWorkspace);
  const [pendingLegacyActiveSessionId, setPendingLegacyActiveSessionId] = useState(initialState.pendingLegacyActiveSessionId);
  const approvalMode: CodexApprovalMode = "native-full-access";
  const workspaceSessions = workspaceRoot ? allSessions.filter((session) => session.workspaceRoot === workspaceRoot) : [];
  const sessions = workspaceSessions.filter((session) => !session.closedAt);
  const recentSessions = workspaceSessions.filter((session) => Boolean(session.closedAt)).sort((first, second) => (
    (second.closedAt ?? "").localeCompare(first.closedAt ?? "")
  ));
  const preferredActiveSessionId = workspaceRoot ? activeSessionIdsByWorkspace[workspaceRoot] : undefined;
  const activeSession = sessions.find((session) => session.id === preferredActiveSessionId) ?? sessions[0];
  const activeSessionId = activeSession?.id ?? "";
  const messages = activeSession?.messages ?? [];
  const attachments = activeSession?.attachments ?? [];
  const selectedSkills = activeSession?.selectedSkills ?? [];
  const activeGoal = activeSession?.goal ?? null;
  const approvals = activeSession?.approvals ?? [];
  const draft = activeSession?.draft ?? "";
  const status = activeSession?.status ?? "ready";
  const isRunning = status === "running";
  const error = activeSession?.error ?? null;
  const runningSessionCount = workspaceSessions.filter((session) => session.status === "running").length;

  useEffect(() => {
    const storage = getStorage();
    storage?.setItem(storageKey, JSON.stringify({
      sessions: allSessions,
      activeSessionIdsByWorkspace,
      ...(pendingLegacyActiveSessionId ? { pendingLegacyActiveSessionId } : {}),
    }));
  }, [activeSessionIdsByWorkspace, allSessions, pendingLegacyActiveSessionId]);

  useEffect(() => {
    if (!workspaceRoot || !workspaceName) return;
    setAllSessions((current) => {
      let next = current.map((session) => session.workspaceRoot ? session : {
        ...session,
        workspaceRoot,
        workspaceName,
      });
      let workspaceSessions = next.filter((session) => session.workspaceRoot === workspaceRoot);
      if (workspaceSessions.length === 0) {
        const session = createSession(workspaceRoot, workspaceName);
        next = [...next, session];
        workspaceSessions = [session];
      }
      setActiveSessionIdsByWorkspace((activeIds) => {
        const activeId = activeIds[workspaceRoot];
        if (activeId && workspaceSessions.some((session) => session.id === activeId)) {
          setPendingLegacyActiveSessionId(undefined);
          return activeIds;
        }
        const legacyActiveId = pendingLegacyActiveSessionId;
        setPendingLegacyActiveSessionId(undefined);
        const nextActiveId = legacyActiveId && workspaceSessions.some((session) => session.id === legacyActiveId)
          ? legacyActiveId
          : workspaceSessions[0].id;
        return { ...activeIds, [workspaceRoot]: nextActiveId };
      });
      return next;
    });
  }, [pendingLegacyActiveSessionId, workspaceName, workspaceRoot]);

  const updateSession = useCallback((sessionId: string, updater: (session: CodexSession) => CodexSession) => {
    setAllSessions((current) => current.map((session) => session.id === sessionId ? updater(session) : session));
  }, []);

  const updateSessionMessages = useCallback((sessionId: string, updater: (messages: CodexMessage[]) => CodexMessage[]) => {
    updateSession(sessionId, (session) => {
      const nextMessages = updater(session.messages);
      return {
        ...session,
        title: deriveTitle(nextMessages),
        messages: nextMessages,
        updatedAt: new Date().toISOString(),
      };
    });
  }, [updateSession]);

  const handleEvent = useCallback((routedEvent: CodexRoutedEvent) => {
    const { sessionId, event } = routedEvent;
    if (event.kind === "thread-started") {
      updateSession(sessionId, (session) => ({ ...session, threadId: event.threadId, updatedAt: new Date().toISOString() }));
      return;
    }
    if (event.kind === "assistant-delta") {
      updateSessionMessages(sessionId, (current) => appendAssistantDelta(current, event.text));
      return;
    }
    if (event.kind === "assistant-message") {
      updateSessionMessages(sessionId, (current) => [...current, createMessage("assistant", event.text)]);
      return;
    }
    if (event.kind === "tool-event") {
      updateSessionMessages(sessionId, (current) => [...current, createMessage("event", `${event.title}${event.detail ? ` · ${event.detail}` : ""}`)]);
      return;
    }
    if (event.kind === "approval-request") {
      updateSession(sessionId, (session) => ({
        ...session,
        approvals: [...session.approvals.filter((approval) => approval.id !== event.approval.id), event.approval],
        updatedAt: new Date().toISOString(),
      }));
      return;
    }
    if (event.kind === "approval-resolved") {
      updateSession(sessionId, (session) => ({
        ...session,
        approvals: session.approvals.filter((approval) => approval.id !== event.approvalId),
        updatedAt: new Date().toISOString(),
      }));
      return;
    }
    if (event.kind === "raw") {
      updateSessionMessages(sessionId, (current) => [...current, createMessage("event", event.text)]);
      return;
    }
    if (event.kind === "status") {
      updateSession(sessionId, (session) => ({
        ...session,
        status: event.status === "started" ? "running" : event.status === "failed" ? "failed" : event.status === "completed" ? "completed" : "ready",
        error: event.status === "failed" ? event.detail ?? "Codex failed" : session.error,
        approvals: event.status === "started" ? session.approvals : [],
        updatedAt: new Date().toISOString(),
      }));
    }
  }, [updateSession, updateSessionMessages]);

  useEffect(() => window.aureum.codex.onEvent(handleEvent), [handleEvent]);

  const submitPrompt = useCallback(async (prompt?: string) => {
    const session = sessions.find((entry) => entry.id === activeSessionId);
    if (!workspaceRoot || !session || session.workspaceRoot !== workspaceRoot || session.status === "running") return;
    const trimmed = (prompt ?? session.draft).trim();
    if (!trimmed) return;
    const skills = session.selectedSkills;
    const userMessage = createMessage("user", trimmed);

    updateSession(session.id, (current) => ({
      ...current,
      draft: "",
      error: null,
      status: "running",
      messages: [...current.messages, userMessage],
      title: deriveTitle([...current.messages, userMessage]),
      updatedAt: new Date().toISOString(),
    }));

    try {
      await window.aureum.codex.start({
        sessionId: session.id,
        workspaceRoot: session.workspaceRoot,
        prompt: trimmed,
        approvalMode,
        ...(session.attachments.length > 0 ? { attachments: session.attachments } : {}),
        ...(session.messages.some((message) => message.role === "user" || message.role === "assistant")
          ? { history: session.messages.filter(isConversationMessage).map(({ role, content }) => ({ role, content })) }
          : {}),
        ...(skills.length > 0 ? { skills } : {}),
        ...(session.threadId ? { threadId: session.threadId } : {}),
      });
      updateSession(session.id, (current) => ({
        ...current,
        attachments: [],
        selectedSkills: [],
        updatedAt: new Date().toISOString(),
      }));
    } catch (caughtError) {
      updateSession(session.id, (current) => ({
        ...current,
        status: "failed",
        error: caughtError instanceof Error ? caughtError.message : "Failed to start Codex",
        updatedAt: new Date().toISOString(),
      }));
    }
  }, [activeSessionId, approvalMode, sessions, updateSession, workspaceRoot]);

  const stop = useCallback(async (sessionId = activeSessionId) => {
    const session = sessions.find((entry) => entry.id === sessionId);
    if (!session || session.workspaceRoot !== workspaceRoot) return;
    await window.aureum.codex.stop(sessionId);
    updateSession(sessionId, (session) => ({ ...session, status: "ready", updatedAt: new Date().toISOString() }));
  }, [activeSessionId, sessions, updateSession, workspaceRoot]);

  const respondToApproval = useCallback(async (approvalId: string, decision: CodexApprovalDecision) => {
    const session = sessions.find((entry) => entry.id === activeSessionId);
    if (!session || !session.approvals.some((approval) => approval.id === approvalId)) return;
    await window.aureum.codex.respondToApproval({ sessionId: session.id, approvalId, decision });
    updateSession(session.id, (current) => ({
      ...current,
      approvals: current.approvals.filter((approval) => approval.id !== approvalId),
      updatedAt: new Date().toISOString(),
    }));
  }, [activeSessionId, sessions, updateSession]);

  const newSession = useCallback(() => {
    if (!workspaceRoot || !workspaceName) return;
    const session = createSession(workspaceRoot, workspaceName);
    setAllSessions((current) => [...current, session]);
    setActiveSessionIdsByWorkspace((current) => ({ ...current, [workspaceRoot]: session.id }));
  }, [workspaceName, workspaceRoot]);

  const selectSession = useCallback((id: string) => {
    if (!workspaceRoot || !sessions.some((session) => session.id === id)) return;
    setActiveSessionIdsByWorkspace((current) => ({ ...current, [workspaceRoot]: id }));
  }, [sessions, workspaceRoot]);

  const deleteSession = useCallback((id: string) => {
    const target = workspaceSessions.find((session) => session.id === id);
    if (target?.status === "running") return;
    setAllSessions((current) => {
      const next = current.filter((session) => session.id !== id);
      const workspaceSessions = next.filter((session) => session.workspaceRoot === workspaceRoot);
      const openWorkspaceSessions = workspaceSessions.filter((session) => !session.closedAt);
      if (openWorkspaceSessions.length > 0) {
        if (id === activeSessionId && workspaceRoot) {
          setActiveSessionIdsByWorkspace((activeIds) => ({ ...activeIds, [workspaceRoot]: openWorkspaceSessions.at(-1)!.id }));
        }
        return next;
      }
      if (!workspaceRoot || !workspaceName) return next;
      const replacement = createSession(workspaceRoot, workspaceName);
      setActiveSessionIdsByWorkspace((activeIds) => ({ ...activeIds, [workspaceRoot]: replacement.id }));
      return [...next, replacement];
    });
  }, [activeSessionId, workspaceName, workspaceRoot, workspaceSessions]);

  const closeSession = useCallback((id: string) => {
    if (!workspaceRoot || !workspaceName) return;
    const target = workspaceSessions.find((session) => session.id === id);
    if (!target || target.closedAt) return;
    const remainingOpenSessions = sessions.filter((session) => session.id !== id);

    setAllSessions((current) => {
      const closedAt = new Date().toISOString();
      const next = current.map((session) => session.id === id ? { ...session, closedAt, updatedAt: closedAt } : session);
      if (remainingOpenSessions.length > 0) return next;
      return [...next, createSession(workspaceRoot, workspaceName)];
    });
    setActiveSessionIdsByWorkspace((current) => {
      if (current[workspaceRoot] !== id) return current;
      const nextActiveId = remainingOpenSessions.at(-1)?.id;
      if (nextActiveId) return { ...current, [workspaceRoot]: nextActiveId };
      const { [workspaceRoot]: _closedSession, ...rest } = current;
      return rest;
    });
  }, [sessions, workspaceName, workspaceRoot, workspaceSessions]);

  const reopenSession = useCallback((id: string) => {
    if (!workspaceRoot) return;
    const target = recentSessions.find((session) => session.id === id);
    if (!target) return;
    setAllSessions((current) => current.map((session) => session.id === id ? {
      ...session,
      closedAt: undefined,
      updatedAt: new Date().toISOString(),
    } : session));
    setActiveSessionIdsByWorkspace((current) => ({ ...current, [workspaceRoot]: id }));
  }, [recentSessions, workspaceRoot]);

  const pickAttachments = useCallback(async () => {
    const sessionId = activeSessionId;
    if (!sessionId) return;
    const result = await window.aureum.codex.pickAttachments();
    if (result.attachments.length === 0 && result.errors.length === 0) return;
    updateSession(sessionId, (session) => ({
      ...session,
      attachments: [
        ...session.attachments.filter((attachment) => !result.attachments.some((picked) => picked.path === attachment.path)),
        ...result.attachments,
      ],
      error: result.errors.length > 0
        ? result.errors.map((error) => `${attachmentFileName(error.path)}: ${error.message}`).join("\n")
        : session.error,
      updatedAt: new Date().toISOString(),
    }));
  }, [activeSessionId, updateSession]);

  const removeAttachment = useCallback((path: string) => {
    if (!activeSessionId) return;
    updateSession(activeSessionId, (session) => ({
      ...session,
      attachments: session.attachments.filter((attachment) => attachment.path !== path),
      updatedAt: new Date().toISOString(),
    }));
  }, [activeSessionId, updateSession]);

  const listSkills = useCallback(async () => {
    if (!workspaceRoot) return [];
    return window.aureum.codex.listSkills({ workspaceRoot });
  }, [workspaceRoot]);

  const addSkill = useCallback((skill: CodexSkill) => {
    if (!activeSessionId) return;
    updateSession(activeSessionId, (session) => ({
      ...session,
      selectedSkills: [...session.selectedSkills.filter((selected) => selected.path !== skill.path), skill],
      updatedAt: new Date().toISOString(),
    }));
  }, [activeSessionId, updateSession]);

  const removeSkill = useCallback((path: string) => {
    if (!activeSessionId) return;
    updateSession(activeSessionId, (session) => ({
      ...session,
      selectedSkills: session.selectedSkills.filter((skill) => skill.path !== path),
      updatedAt: new Date().toISOString(),
    }));
  }, [activeSessionId, updateSession]);

  const ensureThreadId = useCallback(async (session: CodexSession) => {
    if (!workspaceRoot) throw new Error("Open a workspace before using Codex");
    if (session.threadId) return session.threadId;
    const threadId = await window.aureum.codex.createThread({ workspaceRoot });
    updateSession(session.id, (current) => ({ ...current, threadId, updatedAt: new Date().toISOString() }));
    return threadId;
  }, [updateSession, workspaceRoot]);

  const setGoal = useCallback(async (objective: string) => {
    const session = sessions.find((entry) => entry.id === activeSessionId);
    if (!workspaceRoot || !session || !objective.trim()) return null;
    const threadId = await ensureThreadId(session);
    const goal = await window.aureum.codex.setGoal({ workspaceRoot, threadId, objective: objective.trim() });
    updateSession(session.id, (current) => ({ ...current, goal, threadId, updatedAt: new Date().toISOString() }));
    return goal;
  }, [activeSessionId, ensureThreadId, sessions, updateSession, workspaceRoot]);

  const loadGoal = useCallback(async () => {
    const session = sessions.find((entry) => entry.id === activeSessionId);
    if (!workspaceRoot || !session?.threadId) return null;
    const goal = await window.aureum.codex.getGoal({ workspaceRoot, threadId: session.threadId });
    updateSession(session.id, (current) => ({ ...current, goal, updatedAt: new Date().toISOString() }));
    return goal;
  }, [activeSessionId, sessions, updateSession, workspaceRoot]);

  const clearGoal = useCallback(async () => {
    const session = sessions.find((entry) => entry.id === activeSessionId);
    if (!workspaceRoot || !session?.threadId) return false;
    const cleared = await window.aureum.codex.clearGoal({ workspaceRoot, threadId: session.threadId });
    if (cleared) updateSession(session.id, (current) => ({ ...current, goal: null, updatedAt: new Date().toISOString() }));
    return cleared;
  }, [activeSessionId, sessions, updateSession, workspaceRoot]);

  const setDraft = useCallback((draft: string) => {
    if (!activeSessionId) return;
    updateSession(activeSessionId, (session) => ({ ...session, draft, updatedAt: new Date().toISOString() }));
  }, [activeSessionId, updateSession]);

  return {
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
    approvalMode,
    runningSessionCount,
    submitPrompt,
    stop,
    respondToApproval,
    newSession,
    selectSession,
    deleteSession,
    closeSession,
    reopenSession,
    pickAttachments,
    removeAttachment,
    listSkills,
    addSkill,
    removeSkill,
    setGoal,
    loadGoal,
    clearGoal,
    setDraft,
  };
}

function appendAssistantDelta(messages: CodexMessage[], text: string): CodexMessage[] {
  const last = messages.at(-1);
  if (last?.role === "assistant") return [...messages.slice(0, -1), { ...last, content: last.content + text }];
  return [...messages, createMessage("assistant", text)];
}

function createMessage(role: CodexMessage["role"], content: string): CodexMessage {
  return { id: `${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`, role, content };
}

function createSession(workspaceRoot: string, workspaceName: string, overrides: Partial<CodexSession> = {}): CodexSession {
  const now = new Date().toISOString();
  const id = `session-${now}-${Math.random().toString(16).slice(2)}`;
  return {
    id,
    workspaceRoot,
    workspaceName,
    title: "New session",
    createdAt: now,
    updatedAt: now,
    messages: [],
    attachments: [],
    selectedSkills: [],
    goal: null,
    approvals: [],
    draft: "",
    status: "ready",
    error: null,
    ...overrides,
  };
}

function deriveTitle(messages: CodexMessage[]) {
  const firstUserMessage = messages.find((message) => message.role === "user");
  if (!firstUserMessage) return "New session";
  return firstUserMessage.content.replace(/\s+/g, " ").slice(0, 42) || "New session";
}

function loadSessionState(
  workspaceRoot: string | null,
  workspaceName: string | null,
): SessionState {
  const storage = getStorage();
  const stored = storage?.getItem(storageKey);
  if (!stored) return freshSessionState(workspaceRoot, workspaceName);
  try {
    const parsed = JSON.parse(stored) as {
      sessions?: unknown;
      activeSessionId?: unknown;
      activeSessionIdsByWorkspace?: unknown;
      pendingLegacyActiveSessionId?: unknown;
    };
    if (Array.isArray(parsed.sessions) && parsed.sessions.length > 0) {
      let sessions = parsed.sessions.map(normalizeSession).filter(Boolean) as CodexSession[];
      if (sessions.length === 0) return freshSessionState(workspaceRoot, workspaceName);
      if (workspaceRoot && workspaceName) {
        sessions = sessions.map((session) => session.workspaceRoot ? session : { ...session, workspaceRoot, workspaceName });
      }
      const activeSessionIdsByWorkspace = normalizeActiveSessionIds(parsed.activeSessionIdsByWorkspace, sessions);
      if (workspaceRoot && typeof parsed.activeSessionId === "string" && sessions.some((session) => session.id === parsed.activeSessionId && session.workspaceRoot === workspaceRoot)) {
        activeSessionIdsByWorkspace[workspaceRoot] = parsed.activeSessionId;
      }
      if (workspaceRoot && !sessions.some((session) => session.workspaceRoot === workspaceRoot)) {
        const session = createSession(workspaceRoot, workspaceName ?? workspaceRoot);
        sessions.push(session);
        activeSessionIdsByWorkspace[workspaceRoot] = session.id;
      }
      return {
        sessions,
        activeSessionIdsByWorkspace,
        pendingLegacyActiveSessionId: typeof parsed.pendingLegacyActiveSessionId === "string"
          ? parsed.pendingLegacyActiveSessionId
          : typeof parsed.activeSessionId === "string" ? parsed.activeSessionId : undefined,
      };
    }
  } catch {
    return freshSessionState(workspaceRoot, workspaceName);
  }
  return freshSessionState(workspaceRoot, workspaceName);
}

function normalizeSession(value: unknown): CodexSession | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<CodexSession>;
  if (typeof record.id !== "string") return null;
  const messages = Array.isArray(record.messages) ? record.messages.filter(isCodexMessage) : [];
  const attachments = Array.isArray(record.attachments)
    ? record.attachments.filter(isCodexAttachment).map(normalizeAttachment)
    : [];
  const selectedSkills = Array.isArray(record.selectedSkills) ? record.selectedSkills.filter(isCodexSkill) : [];
  return createSession(
    typeof record.workspaceRoot === "string" ? record.workspaceRoot : "",
    typeof record.workspaceName === "string" ? record.workspaceName : "",
    {
    id: record.id,
    title: typeof record.title === "string" ? record.title : deriveTitle(messages),
    createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString(),
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date().toISOString(),
    messages,
    attachments,
    selectedSkills,
    goal: isCodexGoal(record.goal) ? record.goal : null,
    approvals: [],
    draft: typeof record.draft === "string" ? record.draft : "",
    status: record.status === "failed" || record.status === "completed" ? record.status : "ready",
    error: typeof record.error === "string" ? record.error : null,
    threadId: typeof record.threadId === "string" ? record.threadId : undefined,
    closedAt: typeof record.closedAt === "string" ? record.closedAt : undefined,
    },
  );
}

function isCodexMessage(value: unknown): value is CodexMessage {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<CodexMessage>;
  return typeof record.id === "string" && typeof record.content === "string" && (record.role === "user" || record.role === "assistant" || record.role === "event");
}

function isConversationMessage(message: CodexMessage): message is CodexMessage & { role: "user" | "assistant" } {
  return message.role === "user" || message.role === "assistant";
}

function isCodexAttachment(value: unknown): value is CodexAttachment {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<CodexAttachment>;
  const kind = record.kind ?? "text";
  const mediaPathsValid = record.mediaPaths === undefined
    || (Array.isArray(record.mediaPaths) && record.mediaPaths.every((path) => typeof path === "string"));
  return typeof record.path === "string"
    && typeof record.language === "string"
    && mediaPathsValid
    && (kind === "image" || kind === "video" || (kind === "text" && typeof record.content === "string"));
}

function normalizeAttachment(attachment: CodexAttachment): CodexAttachment {
  return attachment.kind ? attachment : { ...attachment, kind: "text" };
}

function attachmentFileName(path: string): string {
  return path.split(/[\\/]/).at(-1) ?? path;
}

function isCodexSkill(value: unknown): value is CodexSkill {
  if (!value || typeof value !== "object") return false;
  const skill = value as Partial<CodexSkill>;
  return typeof skill.name === "string"
    && typeof skill.description === "string"
    && typeof skill.path === "string"
    && skill.enabled === true
    && ["user", "repo", "system", "admin"].includes(skill.scope ?? "");
}

function isCodexGoal(value: unknown): value is CodexThreadGoal {
  if (!value || typeof value !== "object") return false;
  const goal = value as Partial<CodexThreadGoal>;
  return typeof goal.threadId === "string"
    && typeof goal.objective === "string"
    && typeof goal.status === "string"
    && typeof goal.tokensUsed === "number"
    && typeof goal.timeUsedSeconds === "number"
    && typeof goal.createdAt === "number"
    && typeof goal.updatedAt === "number";
}

function getStorage(): Pick<Storage, "getItem" | "setItem"> | null {
  const storage = window.localStorage;
  if (typeof storage?.getItem !== "function" || typeof storage?.setItem !== "function") return null;
  return storage;
}

function freshSessionState(
  workspaceRoot: string | null,
  workspaceName: string | null,
): SessionState {
  if (!workspaceRoot || !workspaceName) return { sessions: [], activeSessionIdsByWorkspace: {} };
  const session = createSession(workspaceRoot, workspaceName);
  return { sessions: [session], activeSessionIdsByWorkspace: { [workspaceRoot]: session.id } };
}

type SessionState = {
  sessions: CodexSession[];
  activeSessionIdsByWorkspace: Record<string, string>;
  pendingLegacyActiveSessionId?: string;
};

function normalizeActiveSessionIds(value: unknown, sessions: CodexSession[]): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value).filter(([workspaceRoot, sessionId]) => (
    typeof sessionId === "string"
    && sessions.some((session) => session.id === sessionId && session.workspaceRoot === workspaceRoot)
  )));
}
