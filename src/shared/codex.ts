export type CodexUiEvent =
  | { kind: "thread-started"; threadId: string }
  | { kind: "assistant-delta"; text: string }
  | { kind: "assistant-message"; text: string }
  | { kind: "tool-event"; title: string; detail?: string }
  | { kind: "approval-request"; approval: CodexApprovalRequest }
  | { kind: "approval-resolved"; approvalId: string }
  | { kind: "status"; status: "started" | "completed" | "failed" | "stopped"; detail?: string }
  | { kind: "raw"; text: string };

export type CodexApprovalMode = "native-full-access";

export type CodexApprovalDecision = "accept" | "acceptForSession" | "decline" | "cancel";

export type CodexApprovalRequest = {
  id: string;
  type: "command" | "file-change" | "guardian-denial";
  title: string;
  command?: string;
  cwd?: string;
  reason?: string;
  grantRoot?: string;
  riskLevel?: "low" | "medium" | "high" | "critical";
  actionLabel?: string;
};

export type CodexApprovalResponse = {
  sessionId: string;
  approvalId: string;
  decision: CodexApprovalDecision;
};

export type CodexAttachmentKind = "text" | "image" | "video";

export type CodexAttachment = {
  path: string;
  kind: CodexAttachmentKind;
  language: string;
  content?: string;
  displayName?: string;
  format?: string;
  mediaPaths?: string[];
  metadata?: {
    truncated?: boolean;
    pageCount?: number;
    sheetCount?: number;
    frameCount?: number;
    frameTimestamps?: string[];
    notes?: string[];
  };
};

export type CodexAttachmentError = {
  path: string;
  message: string;
};

export type CodexAttachmentPickResult = {
  attachments: CodexAttachment[];
  errors: CodexAttachmentError[];
};

export type CodexConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

export type CodexSkill = {
  name: string;
  description: string;
  shortDescription?: string;
  path: string;
  scope: "user" | "repo" | "system" | "admin";
  enabled: boolean;
};

export type CodexThreadGoal = {
  threadId: string;
  objective: string;
  status: string;
  tokenBudget: number | null;
  tokensUsed: number;
  timeUsedSeconds: number;
  createdAt: number;
  updatedAt: number;
};

export type CodexWorkspaceRequest = {
  workspaceRoot: string;
};

export type CodexThreadRequest = CodexWorkspaceRequest & {
  threadId: string;
};

export type CodexSetGoalRequest = CodexThreadRequest & {
  objective: string;
};

export type CodexRoutedEvent = {
  sessionId: string;
  event: CodexUiEvent;
};

export type CodexStartRequest = {
  sessionId: string;
  workspaceRoot: string;
  prompt: string;
  approvalMode: CodexApprovalMode;
  attachments?: CodexAttachment[];
  imagePaths?: string[];
  history?: CodexConversationMessage[];
  skills?: CodexSkill[];
  threadId?: string;
};

export function parseCodexJsonLine(line: string): CodexUiEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  let event: Record<string, unknown>;

  try {
    event = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return { kind: "raw", text: trimmed };
  }

  const type = stringValue(event.type) ?? stringValue(event.method) ?? "event";
  const itemType = nestedString(event, "type");
  if (type === "thread.started") {
    const threadId = stringValue(event.thread_id) ?? stringValue(event.threadId);
    return threadId ? { kind: "thread-started", threadId } : null;
  }
  if (type === "turn.started" || itemType === "error") return null;
  const delta = stringValue(event.delta) ?? stringValue(event.text_delta);
  if (type.includes("agent_message_delta") && delta) {
    return { kind: "assistant-delta", text: delta };
  }

  const message = stringValue(event.message) ?? stringValue(event.text) ?? nestedText(event) ?? nestedErrorMessage(event);
  if ((type.includes("agent_message") || type.includes("assistant") || itemType === "agent_message") && message) {
    return { kind: "assistant-message", text: message };
  }

  if (type.includes("turn") && type.includes("completed")) {
    return { kind: "status", status: "completed" };
  }

  if (type.includes("turn") && type.includes("failed")) {
    return { kind: "status", status: "failed", detail: message ?? type };
  }

  if (type.includes("error")) {
    return { kind: "status", status: "failed", detail: message ?? type };
  }

  if (type.includes("exec") || type.includes("tool") || type.includes("command") || itemType?.includes("command")) {
    return {
      kind: "tool-event",
      title: itemType ?? type,
      detail: stringValue(event.cmd) ?? stringValue(event.command) ?? nestedString(event, "command") ?? message,
    };
  }

  return { kind: "raw", text: trimmed };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function nestedText(event: Record<string, unknown>): string | undefined {
  const item = event.item;
  if (!item || typeof item !== "object") return undefined;
  const record = item as Record<string, unknown>;
  return stringValue(record.text) ?? stringValue(record.message);
}

function nestedString(event: Record<string, unknown>, key: string): string | undefined {
  const item = event.item;
  if (!item || typeof item !== "object") return undefined;
  return stringValue((item as Record<string, unknown>)[key]);
}

function nestedErrorMessage(event: Record<string, unknown>): string | undefined {
  const error = event.error;
  if (!error || typeof error !== "object") return undefined;
  return stringValue((error as Record<string, unknown>).message);
}
