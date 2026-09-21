import type { CodexStartRequest, CodexUiEvent } from "../../shared/codex";
import type { StartCodexOptions } from "./codexExecService";

type StartCodex = (options: StartCodexOptions) => void;
type RouteCodexEvent = (sessionId: string, event: CodexUiEvent) => void;

export function startCodexRequest(
  request: CodexStartRequest,
  activeWorkspaceRoot: string | null,
  startCodex: StartCodex,
  routeEvent: RouteCodexEvent,
): void {
  if (!activeWorkspaceRoot) throw new Error("Open a workspace before starting Codex");
  if (!request?.prompt?.trim()) throw new Error("Prompt cannot be empty");
  if (request.workspaceRoot !== activeWorkspaceRoot) {
    throw new Error("Session workspace does not match the active workspace");
  }

  startCodex({
    sessionId: request.sessionId,
    cwd: activeWorkspaceRoot,
    prompt: request.prompt,
    attachments: request.attachments,
    imagePaths: request.imagePaths,
    history: request.history,
    skills: request.skills,
    threadId: request.threadId,
    onEvent: (event) => routeEvent(request.sessionId, event),
  });
}
