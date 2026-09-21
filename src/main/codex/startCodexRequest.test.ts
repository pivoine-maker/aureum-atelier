import { describe, expect, it, vi } from "vitest";

import { startCodexRequest } from "./startCodexRequest";

describe("startCodexRequest", () => {
  it("does not spawn Codex when the session workspace differs from the active workspace", () => {
    const start = vi.fn();

    expect(() => startCodexRequest({
      sessionId: "session-a",
      workspaceRoot: "/Users/test/alpha",
      prompt: "review",
      approvalMode: "native-full-access",
    }, "/Users/test/beta", start, vi.fn())).toThrow("Session workspace does not match the active workspace");

    expect(start).not.toHaveBeenCalled();
  });

  it("spawns in the main-process workspace and routes events by session id", () => {
    const start = vi.fn();
    const routeEvent = vi.fn();
    const attachment = {
      path: "/Users/test/project/App.tsx",
      kind: "text" as const,
      language: "typescript",
      content: "export const app = true;",
    };
    const skill = {
      name: "review",
      description: "Review changes",
      path: "/skills/review/SKILL.md",
      scope: "user" as const,
      enabled: true,
    };
    const history = [{ role: "user" as const, content: "Earlier request" }];

    startCodexRequest({
      sessionId: "session-a",
      workspaceRoot: "/Users/test/alpha",
      prompt: "review",
      approvalMode: "native-full-access",
      attachments: [attachment],
      history,
      skills: [skill],
    }, "/Users/test/alpha", start, routeEvent);

    expect(start).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: "session-a",
      cwd: "/Users/test/alpha",
      prompt: "review",
      attachments: [attachment],
      history,
      skills: [skill],
    }));
    const onEvent = start.mock.calls[0][0].onEvent;
    onEvent({ kind: "status", status: "completed" });
    expect(routeEvent).toHaveBeenCalledWith("session-a", { kind: "status", status: "completed" });
  });
});
