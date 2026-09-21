import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CodexRoutedEvent } from "../../shared/codex";
import { useCodex } from "./useCodex";

const workspaceRoot = "/Users/test/alpha";
const workspaceName = "alpha";

describe("useCodex", () => {
  beforeEach(() => {
    const storage = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
        clear: () => storage.clear(),
      },
    });
    let listener: ((event: CodexRoutedEvent) => void) | null = null;
    window.aureum = {
      settings: { getInitial: vi.fn(), update: vi.fn() },
      artwork: {
        getToday: vi.fn(),
        resolveCachedImage: vi.fn().mockResolvedValue(null),
        onCacheReady: vi.fn().mockReturnValue(vi.fn()),
      },
      workspace: {
        open: vi.fn(),
        restoreLast: vi.fn().mockResolvedValue(null),
        openRecent: vi.fn().mockResolvedValue(null),
        getRecent: vi.fn().mockResolvedValue([]),
        getTree: vi.fn(),
        readDirectory: vi.fn(),
        readFile: vi.fn(),
        writeFile: vi.fn(),
        search: vi.fn(),
      },
      codex: {
        pickAttachments: vi.fn().mockResolvedValue({ attachments: [], errors: [] }),
        listSkills: vi.fn().mockResolvedValue([]),
        createThread: vi.fn().mockResolvedValue("thread-created"),
        getGoal: vi.fn().mockResolvedValue(null),
        setGoal: vi.fn().mockResolvedValue({
          threadId: "thread-created",
          objective: "Ship feature",
          status: "active",
          tokenBudget: null,
          tokensUsed: 0,
          timeUsedSeconds: 0,
          createdAt: 1,
          updatedAt: 1,
        }),
        clearGoal: vi.fn().mockResolvedValue(true),
        start: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn().mockResolvedValue(undefined),
        respondToApproval: vi.fn().mockResolvedValue(undefined),
        onEvent: vi.fn((callback) => {
          listener = callback;
          return vi.fn();
        }),
      },
      terminal: {
        create: vi.fn().mockResolvedValue({ id: "terminal-1" }),
        write: vi.fn().mockResolvedValue(undefined),
        resize: vi.fn().mockResolvedValue(undefined),
        kill: vi.fn().mockResolvedValue(undefined),
        onOutput: vi.fn().mockReturnValue(vi.fn()),
        onExit: vi.fn().mockReturnValue(vi.fn()),
      },
      git: {
        status: vi.fn().mockResolvedValue({ branch: "main", changes: [], isRepository: true }),
        log: vi.fn().mockResolvedValue([]),
        diff: vi.fn().mockResolvedValue(""),
        stage: vi.fn().mockResolvedValue(undefined),
        unstage: vi.fn().mockResolvedValue(undefined),
        revert: vi.fn().mockResolvedValue(undefined),
        commit: vi.fn().mockResolvedValue("Committed"),
      },
    };
    Reflect.set(window, "emitCodexTestEvent", (event: CodexRoutedEvent) => listener?.(event));
  });

  it("submits through the default model contract and appends routed assistant text", async () => {
    const { result } = renderHook(() => useCodex(workspaceRoot, workspaceName));
    const sessionId = result.current.activeSessionId;

    await act(async () => {
      await result.current.submitPrompt("hello");
    });
    act(() => {
      emitEvent({ sessionId, event: { kind: "assistant-delta", text: "Hi" } });
      emitEvent({ sessionId, event: { kind: "status", status: "completed" } });
    });

    const request = vi.mocked(window.aureum.codex.start).mock.calls[0][0];
    expect(request).toEqual({
      sessionId,
      workspaceRoot,
      prompt: "hello",
      approvalMode: "native-full-access",
    });
    expect(request).not.toHaveProperty("model");
    expect(result.current.messages.at(-1)?.content).toBe("Hi");
    expect(result.current.status).toBe("completed");
    expect(result.current.isRunning).toBe(false);
  });

  it("runs two sessions concurrently and routes interleaved events by session id", async () => {
    const { result } = renderHook(() => useCodex(workspaceRoot, workspaceName));
    const firstSessionId = result.current.activeSessionId;

    await act(async () => {
      await result.current.submitPrompt("first task");
    });
    act(() => result.current.newSession());
    const secondSessionId = result.current.activeSessionId;
    await act(async () => {
      await result.current.submitPrompt("second task");
    });

    expect(result.current.runningSessionCount).toBe(2);
    expect(vi.mocked(window.aureum.codex.start).mock.calls.map(([request]) => request.sessionId)).toEqual([
      firstSessionId,
      secondSessionId,
    ]);

    act(() => {
      emitEvent({ sessionId: firstSessionId, event: { kind: "assistant-delta", text: "First reply" } });
      emitEvent({ sessionId: secondSessionId, event: { kind: "assistant-delta", text: "Second reply" } });
      emitEvent({ sessionId: secondSessionId, event: { kind: "status", status: "completed" } });
    });

    const firstSession = result.current.sessions.find((session) => session.id === firstSessionId);
    const secondSession = result.current.sessions.find((session) => session.id === secondSessionId);
    expect(firstSession?.messages.at(-1)?.content).toBe("First reply");
    expect(firstSession?.status).toBe("running");
    expect(secondSession?.messages.at(-1)?.content).toBe("Second reply");
    expect(secondSession?.status).toBe("completed");
    expect(result.current.runningSessionCount).toBe(1);
  });

  it("routes approvals to their owning session and responds with that session id", async () => {
    const { result } = renderHook(() => useCodex(workspaceRoot, workspaceName));
    const firstSessionId = result.current.activeSessionId;
    await act(async () => {
      await result.current.submitPrompt("first task");
    });
    act(() => result.current.newSession());
    const secondSessionId = result.current.activeSessionId;

    act(() => {
      emitEvent({
        sessionId: firstSessionId,
        event: {
          kind: "approval-request",
          approval: {
            id: "approval-1",
            type: "command",
            title: "Command requires approval",
            command: "touch /Users/test/outside.txt",
          },
        },
      });
    });

    expect(result.current.approvals).toEqual([]);
    act(() => result.current.selectSession(firstSessionId));
    expect(result.current.activeSessionId).toBe(firstSessionId);
    expect(result.current.approvals).toHaveLength(1);

    await act(async () => {
      await result.current.respondToApproval("approval-1", "accept");
    });

    expect(window.aureum.codex.respondToApproval).toHaveBeenCalledWith({
      sessionId: firstSessionId,
      approvalId: "approval-1",
      decision: "accept",
    });
    expect(secondSessionId).not.toBe(firstSessionId);
  });

  it("closes a session tab without deleting its history and reopens it from recents", async () => {
    const { result } = renderHook(() => useCodex(workspaceRoot, workspaceName));
    const firstSessionId = result.current.activeSessionId;
    await act(async () => {
      await result.current.submitPrompt("keep this history");
    });
    act(() => result.current.newSession());
    const secondSessionId = result.current.activeSessionId;

    act(() => result.current.closeSession(firstSessionId));

    expect(result.current.sessions.map((session) => session.id)).toEqual([secondSessionId]);
    expect(result.current.recentSessions.map((session) => session.id)).toContain(firstSessionId);

    act(() => result.current.reopenSession(firstSessionId));

    expect(result.current.activeSessionId).toBe(firstSessionId);
    expect(result.current.sessions.map((session) => session.id)).toContain(firstSessionId);
    expect(result.current.messages[0]?.content).toBe("keep this history");
  });

  it("keeps a placeholder open tab when closing the last ready session", () => {
    const { result } = renderHook(() => useCodex(workspaceRoot, workspaceName));
    const sessionId = result.current.activeSessionId;

    act(() => result.current.closeSession(sessionId));

    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.sessions[0].id).not.toBe(sessionId);
    expect(result.current.recentSessions.map((session) => session.id)).toContain(sessionId);
  });

  it("keeps a placeholder open tab when deleting the last open session with recents", () => {
    const { result } = renderHook(() => useCodex(workspaceRoot, workspaceName));
    const firstSessionId = result.current.activeSessionId;
    act(() => result.current.newSession());
    const openSessionId = result.current.activeSessionId;
    act(() => result.current.closeSession(firstSessionId));

    act(() => result.current.deleteSession(openSessionId));

    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.sessions[0].id).not.toBe(openSessionId);
    expect(result.current.recentSessions.map((session) => session.id)).toContain(firstSessionId);
  });

  it("keeps closed running sessions counted and routable from recents", async () => {
    const { result } = renderHook(() => useCodex(workspaceRoot, workspaceName));
    const sessionId = result.current.activeSessionId;

    await act(async () => {
      await result.current.submitPrompt("background task");
    });
    act(() => result.current.closeSession(sessionId));

    expect(result.current.runningSessionCount).toBe(1);
    expect(result.current.recentSessions.find((session) => session.id === sessionId)?.status).toBe("running");

    act(() => emitEvent({ sessionId, event: { kind: "assistant-message", text: "done" } }));
    act(() => result.current.reopenSession(sessionId));

    expect(result.current.messages.at(-1)?.content).toBe("done");
  });

  it("stops one session without changing another running session", async () => {
    const { result } = renderHook(() => useCodex(workspaceRoot, workspaceName));
    const firstSessionId = result.current.activeSessionId;
    await act(async () => {
      await result.current.submitPrompt("first");
    });
    act(() => result.current.newSession());
    const secondSessionId = result.current.activeSessionId;
    await act(async () => {
      await result.current.submitPrompt("second");
    });

    await act(async () => {
      await result.current.stop(firstSessionId);
    });

    expect(window.aureum.codex.stop).toHaveBeenCalledWith(firstSessionId);
    expect(result.current.sessions.find((session) => session.id === firstSessionId)?.status).toBe("ready");
    expect(result.current.sessions.find((session) => session.id === secondSessionId)?.status).toBe("running");
  });

  it("preserves drafts and attachments independently while switching sessions", async () => {
    vi.mocked(window.aureum.codex.pickAttachments).mockResolvedValueOnce({
      attachments: [{
        path: "/Users/test/Desktop/App.tsx",
        content: "export const app = true;",
        language: "typescript",
        kind: "text",
      }],
      errors: [],
    });
    const { result } = renderHook(() => useCodex(workspaceRoot, workspaceName));
    const firstSessionId = result.current.activeSessionId;

    await act(async () => {
      result.current.setDraft("first draft");
      await result.current.pickAttachments();
    });
    act(() => result.current.newSession());
    const secondSessionId = result.current.activeSessionId;
    act(() => result.current.setDraft("second draft"));

    expect(result.current.draft).toBe("second draft");
    expect(result.current.attachments).toHaveLength(0);
    act(() => result.current.selectSession(firstSessionId));
    expect(result.current.draft).toBe("first draft");
    expect(result.current.attachments[0]?.path).toBe("/Users/test/Desktop/App.tsx");
    act(() => result.current.selectSession(secondSessionId));
    expect(result.current.draft).toBe("second draft");
  });

  it("passes selected local attachments as Codex input attachments", async () => {
    vi.mocked(window.aureum.codex.pickAttachments).mockResolvedValueOnce({
      attachments: [{
        path: "/Users/test/Desktop/App.tsx",
        content: "export const app = true;",
        language: "typescript",
        kind: "text",
      }, {
        path: "/Users/test/Pictures/reference.png",
        language: "plaintext",
        kind: "image",
      }],
      errors: [],
    });
    const { result } = renderHook(() => useCodex(workspaceRoot, workspaceName));

    await act(async () => {
      await result.current.pickAttachments();
    });
    await act(async () => {
      await result.current.submitPrompt("review this");
    });

    const request = vi.mocked(window.aureum.codex.start).mock.calls[0][0];
    expect(request.prompt).toBe("review this");
    expect(request.attachments).toEqual([
      {
        path: "/Users/test/Desktop/App.tsx",
        content: "export const app = true;",
        language: "typescript",
        kind: "text",
      },
      {
        path: "/Users/test/Pictures/reference.png",
        language: "plaintext",
        kind: "image",
      },
    ]);
    expect(request).not.toHaveProperty("imagePaths");
    expect(request).not.toHaveProperty("model");
    expect(result.current.attachments).toHaveLength(0);
  });

  it("keeps successful attachments and reports per-file attachment failures", async () => {
    vi.mocked(window.aureum.codex.pickAttachments).mockResolvedValueOnce({
      attachments: [{
        path: "/Users/test/Desktop/report.pdf",
        content: "PDF: report.pdf\n\nHello",
        language: "pdf",
        kind: "text",
        format: "pdf",
        displayName: "report.pdf",
      }],
      errors: [{ path: "/Users/test/Desktop/archive.zip", message: "Unsupported attachment format: archive.zip" }],
    });
    const { result } = renderHook(() => useCodex(workspaceRoot, workspaceName));

    await act(async () => {
      await result.current.pickAttachments();
    });

    expect(result.current.attachments[0]?.displayName).toBe("report.pdf");
    expect(result.current.error).toContain("archive.zip");
  });

  it("keeps attachments when starting Codex fails", async () => {
    vi.mocked(window.aureum.codex.pickAttachments).mockResolvedValueOnce({
      attachments: [{
        path: "/Users/test/Desktop/report.pdf",
        content: "PDF text",
        language: "pdf",
        kind: "text",
        format: "pdf",
        displayName: "report.pdf",
      }],
      errors: [],
    });
    vi.mocked(window.aureum.codex.start).mockRejectedValueOnce(new Error("failed"));
    const { result } = renderHook(() => useCodex(workspaceRoot, workspaceName));

    await act(async () => {
      await result.current.pickAttachments();
    });
    await act(async () => {
      await result.current.submitPrompt("review");
    });

    expect(result.current.attachments[0]?.displayName).toBe("report.pdf");
  });

  it("scopes selected skills per session and clears them after a successful submit", async () => {
    const skill = {
      name: "review",
      description: "Review changes",
      path: "/Users/test/.codex/skills/review/SKILL.md",
      scope: "user" as const,
      enabled: true,
    };
    const { result } = renderHook(() => useCodex(workspaceRoot, workspaceName));
    const firstSessionId = result.current.activeSessionId;

    act(() => result.current.addSkill(skill));
    expect(result.current.selectedSkills).toEqual([skill]);
    act(() => result.current.newSession());
    expect(result.current.selectedSkills).toEqual([]);
    act(() => result.current.selectSession(firstSessionId));
    expect(result.current.selectedSkills).toEqual([skill]);

    await act(async () => {
      await result.current.submitPrompt("use skill");
    });

    expect(window.aureum.codex.start).toHaveBeenCalledWith(expect.objectContaining({ skills: [skill] }));
    expect(result.current.selectedSkills).toEqual([]);
  });

  it("keeps selected skills when starting Codex fails", async () => {
    vi.mocked(window.aureum.codex.start).mockRejectedValueOnce(new Error("failed"));
    const skill = {
      name: "debug",
      description: "Debug failures",
      path: "/Users/test/.codex/skills/debug/SKILL.md",
      scope: "user" as const,
      enabled: true,
    };
    const { result } = renderHook(() => useCodex(workspaceRoot, workspaceName));

    act(() => result.current.addSkill(skill));
    await act(async () => {
      await result.current.submitPrompt("use skill");
    });

    expect(result.current.selectedSkills).toEqual([skill]);
  });

  it("creates a native thread before setting a goal on a new session", async () => {
    const { result } = renderHook(() => useCodex(workspaceRoot, workspaceName));

    await act(async () => {
      await result.current.setGoal("Ship feature");
    });

    expect(window.aureum.codex.createThread).toHaveBeenCalledWith({ workspaceRoot });
    expect(window.aureum.codex.setGoal).toHaveBeenCalledWith({
      workspaceRoot,
      threadId: "thread-created",
      objective: "Ship feature",
    });
    expect(result.current.activeGoal?.objective).toBe("Ship feature");
    expect(result.current.sessions.find((session) => session.id === result.current.activeSessionId)?.threadId).toBe("thread-created");
  });

  it("loads and clears native goals for the active session", async () => {
    vi.mocked(window.aureum.codex.getGoal).mockResolvedValueOnce({
      threadId: "thread-1",
      objective: "Review release",
      status: "active",
      tokenBudget: null,
      tokensUsed: 4,
      timeUsedSeconds: 2,
      createdAt: 1,
      updatedAt: 2,
    });
    const { result } = renderHook(() => useCodex(workspaceRoot, workspaceName));
    const sessionId = result.current.activeSessionId;
    act(() => emitEvent({ sessionId, event: { kind: "thread-started", threadId: "thread-1" } }));

    await act(async () => {
      await result.current.loadGoal();
    });
    await act(async () => {
      await result.current.clearGoal();
    });

    expect(window.aureum.codex.getGoal).toHaveBeenCalledWith({ workspaceRoot, threadId: "thread-1" });
    expect(window.aureum.codex.clearGoal).toHaveBeenCalledWith({ workspaceRoot, threadId: "thread-1" });
    expect(result.current.activeGoal).toBeNull();
  });

  it("stores the CLI thread id on the routed session and resumes it", async () => {
    const { result } = renderHook(() => useCodex(workspaceRoot, workspaceName));
    const sessionId = result.current.activeSessionId;

    await act(async () => {
      await result.current.submitPrompt("first");
    });
    act(() => {
      emitEvent({ sessionId, event: { kind: "thread-started", threadId: "thread-1" } });
      emitEvent({ sessionId, event: { kind: "assistant-message", text: "First answer" } });
      emitEvent({ sessionId, event: { kind: "status", status: "completed" } });
    });
    await act(async () => {
      await result.current.submitPrompt("follow up");
    });

    expect(window.aureum.codex.start).toHaveBeenLastCalledWith(expect.objectContaining({
      sessionId,
      prompt: "follow up",
      threadId: "thread-1",
      history: [
        { role: "user", content: "first" },
        { role: "assistant", content: "First answer" },
      ],
    }));
  });

  it("surfaces start failures only in the submitted session", async () => {
    vi.mocked(window.aureum.codex.start).mockRejectedValueOnce(new Error("Open a workspace before starting Codex"));
    const { result } = renderHook(() => useCodex(workspaceRoot, workspaceName));

    await act(async () => {
      await result.current.submitPrompt("hello");
    });

    expect(result.current.error).toBe("Open a workspace before starting Codex");
    expect(result.current.status).toBe("failed");
  });

  it("persists sessions and normalizes interrupted running state on restore", async () => {
    const { result, unmount } = renderHook(() => useCodex(workspaceRoot, workspaceName));
    const sessionId = result.current.activeSessionId;
    await act(async () => {
      await result.current.submitPrompt("persist me");
    });
    await waitFor(() => expect(window.localStorage.getItem("aureum.codex.sessions.v1")).toContain("running"));
    unmount();

    const restored = renderHook(() => useCodex(workspaceRoot, workspaceName));
    expect(restored.result.current.sessions.find((session) => session.id === sessionId)?.status).toBe("ready");
    expect(restored.result.current.messages[0]?.content).toBe("persist me");
  });

  it("isolates sessions and active tabs by workspace", () => {
    const { result, rerender } = renderHook(
      ({ root, name }) => useCodex(root, name),
      { initialProps: { root: workspaceRoot, name: workspaceName } },
    );
    const firstAlphaSessionId = result.current.activeSessionId;
    act(() => result.current.newSession());
    const secondAlphaSessionId = result.current.activeSessionId;

    rerender({ root: "/Users/test/beta", name: "beta" });

    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.sessions[0].workspaceRoot).toBe("/Users/test/beta");
    expect(result.current.sessions.map((session) => session.id)).not.toContain(firstAlphaSessionId);
    const betaSessionId = result.current.activeSessionId;

    rerender({ root: workspaceRoot, name: workspaceName });

    expect(result.current.sessions.map((session) => session.id)).toEqual([firstAlphaSessionId, secondAlphaSessionId]);
    expect(result.current.activeSessionId).toBe(secondAlphaSessionId);
    expect(result.current.sessions.map((session) => session.id)).not.toContain(betaSessionId);
  });

  it("keeps routing background output to the session that owns it", async () => {
    const { result, rerender } = renderHook(
      ({ root, name }) => useCodex(root, name),
      { initialProps: { root: workspaceRoot, name: workspaceName } },
    );
    const alphaSessionId = result.current.activeSessionId;
    await act(async () => {
      await result.current.submitPrompt("alpha task");
    });

    rerender({ root: "/Users/test/beta", name: "beta" });
    act(() => {
      emitEvent({ sessionId: alphaSessionId, event: { kind: "assistant-message", text: "alpha result" } });
      emitEvent({ sessionId: alphaSessionId, event: { kind: "status", status: "completed" } });
    });

    expect(result.current.messages).toHaveLength(0);
    rerender({ root: workspaceRoot, name: workspaceName });
    expect(result.current.status).toBe("completed");
    expect(result.current.messages.at(-1)?.content).toBe("alpha result");
  });

  it("migrates every legacy session to the first restored workspace once", async () => {
    window.localStorage.setItem("aureum.codex.sessions.v1", JSON.stringify({
      activeSessionId: "legacy-b",
      sessions: [legacySession("legacy-a", "first"), legacySession("legacy-b", "second")],
    }));

    const firstMount = renderHook(
      ({ root, name }) => useCodex(root, name),
      { initialProps: { root: null as string | null, name: null as string | null } },
    );

    expect(firstMount.result.current.sessions).toHaveLength(0);
    await waitFor(() => expect(window.localStorage.getItem("aureum.codex.sessions.v1")).toContain('"pendingLegacyActiveSessionId":"legacy-b"'));
    firstMount.unmount();

    const restored = renderHook(
      ({ root, name }) => useCodex(root, name),
      { initialProps: { root: null as string | null, name: null as string | null } },
    );
    restored.rerender({ root: workspaceRoot, name: workspaceName });

    expect(restored.result.current.sessions.map((session) => session.workspaceRoot)).toEqual([workspaceRoot, workspaceRoot]);
    expect(restored.result.current.activeSessionId).toBe("legacy-b");
    await waitFor(() => expect(window.localStorage.getItem("aureum.codex.sessions.v1")).toContain(workspaceRoot));

    restored.rerender({ root: "/Users/test/beta", name: "beta" });
    expect(restored.result.current.sessions).toHaveLength(1);
    expect(restored.result.current.sessions[0].id).not.toMatch(/^legacy-/);
  });
});

function emitEvent(event: CodexRoutedEvent) {
  (window as unknown as { emitCodexTestEvent: (event: CodexRoutedEvent) => void }).emitCodexTestEvent(event);
}

function legacySession(id: string, prompt: string) {
  return {
    id,
    title: prompt,
    createdAt: "2026-07-27T00:00:00.000Z",
    updatedAt: "2026-07-27T00:00:00.000Z",
    messages: [{ id: `${id}-message`, role: "user", content: prompt }],
    attachments: [],
    draft: "",
    status: "ready",
    error: null,
  };
}
