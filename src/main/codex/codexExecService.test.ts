import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { buildCodexAppServerArgs, buildCodexEnvironment, CodexExecService, hasLegacyCodeModeHistory, type SpawnedProcess } from "./codexExecService";

function createProcess(): SpawnedProcess {
  const process = new EventEmitter() as SpawnedProcess;
  process.stdin = { write: vi.fn().mockReturnValue(true) };
  process.stdout = Object.assign(new EventEmitter(), { setEncoding: vi.fn() });
  process.stderr = Object.assign(new EventEmitter(), { setEncoding: vi.fn() });
  process.kill = vi.fn().mockReturnValue(true);
  return process;
}

function writtenMessages(process: SpawnedProcess) {
  return vi.mocked(process.stdin.write).mock.calls.map(([line]) => JSON.parse(line.trim()));
}

function replyTo(process: SpawnedProcess, method: string, result: unknown) {
  const request = writtenMessages(process).find((message) => message.method === method);
  if (!request) throw new Error(`Missing request: ${method}`);
  process.stdout.emit("data", `${JSON.stringify({ id: request.id, result })}\n`);
}

describe("CodexExecService", () => {
  it("detects saved threads containing legacy namespaced tool calls", () => {
    const sessionsRoot = mkdtempSync(join(tmpdir(), "aureum-legacy-thread-"));
    const dayDirectory = join(sessionsRoot, "2026", "07", "31");
    mkdirSync(dayDirectory, { recursive: true });
    writeFileSync(join(dayDirectory, "rollout-legacy-thread.jsonl"), [
      JSON.stringify({ type: "session_meta", payload: { id: "legacy-thread" } }),
      JSON.stringify({ type: "response_item", payload: { type: "custom_tool_call", name: "exec", namespace: "exec" } }),
    ].join("\n"));
    writeFileSync(join(dayDirectory, "rollout-app-server-thread.jsonl"), [
      JSON.stringify({ type: "session_meta", payload: { id: "app-server-thread" } }),
      JSON.stringify({ type: "response_item", payload: { type: "custom_tool_call", name: "exec", input: "command" } }),
    ].join("\n"));

    expect(hasLegacyCodeModeHistory("legacy-thread", sessionsRoot)).toBe(true);
    expect(hasLegacyCodeModeHistory("app-server-thread", sessionsRoot)).toBe(false);
    expect(hasLegacyCodeModeHistory("clean-thread", sessionsRoot)).toBe(false);
  });

  it("starts one app-server per session with the same unrestricted native permissions as Codex Desktop", async () => {
    const process = createProcess();
    const spawnProcess = vi.fn().mockReturnValue(process);
    const onEvent = vi.fn();
    const service = new CodexExecService(spawnProcess);

    service.start({ sessionId: "session-a", cwd: "/tmp/project", prompt: "hello", onEvent });
    replyTo(process, "initialize", { userAgent: "test" });
    await vi.waitFor(() => expect(writtenMessages(process).some((message) => message.method === "thread/start")).toBe(true));
    replyTo(process, "thread/start", { thread: { id: "thread-1" } });
    await vi.waitFor(() => expect(writtenMessages(process).some((message) => message.method === "turn/start")).toBe(true));

    expect(spawnProcess).toHaveBeenCalledOnce();
    expect(spawnProcess).toHaveBeenCalledWith(
      expect.stringContaining("codex"),
      expect.arrayContaining(["app-server", "--stdio"]),
      expect.any(Object),
    );
    expect(spawnProcess.mock.calls[0][1].some((argument: string) => argument.startsWith("review_model="))).toBe(false);
    expect(spawnProcess.mock.calls[0][1].some((argument: string) => argument.startsWith("model_catalog_json="))).toBe(false);
    expect(spawnProcess.mock.calls[0][2].env.LITELLM_PROXY_API_KEY).toBe("aureum-local");
    expect(writtenMessages(process)).toEqual(expect.arrayContaining([
      expect.objectContaining({ method: "initialized" }),
      expect.objectContaining({
        method: "thread/start",
        params: expect.objectContaining({
          approvalPolicy: "never",
          approvalsReviewer: "user",
          sandbox: "danger-full-access",
        }),
      }),
      expect.objectContaining({
        method: "turn/start",
        params: expect.objectContaining({
          approvalPolicy: "never",
          approvalsReviewer: "user",
          sandbox: "danger-full-access",
        }),
      }),
    ]));
    const threadStart = writtenMessages(process).find((message) => message.method === "thread/start");
    expect(threadStart.params).not.toHaveProperty("permissions");
    expect(threadStart.params).not.toHaveProperty("config");
    expect(onEvent).toHaveBeenCalledWith({ kind: "thread-started", threadId: "thread-1" });
    expect(() => service.start({ sessionId: "session-a", cwd: "/tmp/project", prompt: "again", onEvent })).toThrow("already running");
  });

  it("routes approval requests and sends the user's decision back to the same session", async () => {
    const process = createProcess();
    const service = new CodexExecService(vi.fn().mockReturnValue(process));
    const onEvent = vi.fn();

    service.start({ sessionId: "session-a", cwd: "/tmp/project", prompt: "hello", onEvent });
    process.stdout.emit("data", `${JSON.stringify({
      id: 0,
      method: "item/commandExecution/requestApproval",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "item-1",
        command: "touch /Users/test/outside.txt",
        cwd: "/tmp/project",
        reason: "Write outside the workspace?",
      },
    })}\n`);

    expect(onEvent).toHaveBeenCalledWith({
      kind: "approval-request",
      approval: {
        id: "0",
        type: "command",
        title: "Command requires approval",
        command: "touch /Users/test/outside.txt",
        cwd: "/tmp/project",
        reason: "Write outside the workspace?",
      },
    });

    service.respondToApproval("session-a", "0", "accept");

    expect(writtenMessages(process)).toContainEqual({ id: 0, result: { decision: "accept" } });
    expect(() => service.respondToApproval("session-b", "0", "decline")).toThrow("No pending Codex approval");
  });

  it("turns high-risk Guardian denials into user approval cards and retries them through the official override API", async () => {
    const process = createProcess();
    const service = new CodexExecService(vi.fn().mockReturnValue(process));
    const onEvent = vi.fn();

    service.start({ sessionId: "session-a", cwd: "/tmp/project", prompt: "hello", onEvent });
    replyTo(process, "initialize", { userAgent: "test" });
    await vi.waitFor(() => expect(writtenMessages(process).some((message) => message.method === "thread/start")).toBe(true));
    replyTo(process, "thread/start", { thread: { id: "thread-1" } });
    await vi.waitFor(() => expect(writtenMessages(process).some((message) => message.method === "turn/start")).toBe(true));

    process.stdout.emit("data", `${JSON.stringify({
      method: "item/autoApprovalReview/completed",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        startedAtMs: 10,
        completedAtMs: 20,
        reviewId: "guardian-1",
        targetItemId: "item-1",
        decisionSource: "agent",
        review: {
          status: "denied",
          riskLevel: "high",
          userAuthorization: "low",
          rationale: "Would push to a protected branch.",
        },
        action: {
          type: "command",
          source: "unifiedExec",
          command: "git push --force origin main",
          cwd: "/tmp/project",
        },
      },
    })}\n`);

    expect(onEvent).toHaveBeenCalledWith({
      kind: "approval-request",
      approval: expect.objectContaining({
        id: "guardian:guardian-1",
        type: "guardian-denial",
        title: "Guardian review requires approval",
        command: "git push --force origin main",
        cwd: "/tmp/project",
        riskLevel: "high",
        reason: "Would push to a protected branch.",
      }),
    });

    service.respondToApproval("session-a", "guardian:guardian-1", "accept");

    await vi.waitFor(() => expect(writtenMessages(process)).toContainEqual(expect.objectContaining({
      method: "thread/approveGuardianDeniedAction",
      params: {
        threadId: "thread-1",
        event: {
          id: "guardian-1",
          target_item_id: "item-1",
          turn_id: "turn-1",
          started_at_ms: 10,
          completed_at_ms: 20,
          status: "denied",
          risk_level: "high",
          user_authorization: "low",
          rationale: "Would push to a protected branch.",
          decision_source: "agent",
          action: {
            type: "command",
            source: "unified_exec",
            command: "git push --force origin main",
            cwd: "/tmp/project",
          },
        },
      },
    })));
    expect(onEvent).toHaveBeenCalledWith({ kind: "approval-resolved", approvalId: "guardian:guardian-1" });
  });

  it("does not interrupt the user for low- or medium-risk Guardian outcomes", () => {
    const process = createProcess();
    const service = new CodexExecService(vi.fn().mockReturnValue(process));
    const onEvent = vi.fn();

    service.start({ sessionId: "session-a", cwd: "/tmp/project", prompt: "hello", onEvent });
    for (const riskLevel of ["low", "medium"] as const) {
      process.stdout.emit("data", `${JSON.stringify({
        method: "item/autoApprovalReview/completed",
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          startedAtMs: 10,
          completedAtMs: 20,
          reviewId: `guardian-${riskLevel}`,
          targetItemId: null,
          decisionSource: "agent",
          review: { status: "approved", riskLevel, userAuthorization: "unknown", rationale: null },
          action: { type: "networkAccess", target: "https://example.com", host: "example.com", protocol: "https", port: 443 },
        },
      })}\n`);
    }

    expect(onEvent).not.toHaveBeenCalledWith(expect.objectContaining({ kind: "approval-request" }));
  });

  it("dismisses Guardian denials without overriding them", () => {
    const process = createProcess();
    const service = new CodexExecService(vi.fn().mockReturnValue(process));
    const onEvent = vi.fn();

    service.start({ sessionId: "session-a", cwd: "/tmp/project", prompt: "hello", onEvent });
    process.stdout.emit("data", `${JSON.stringify({
      method: "item/autoApprovalReview/completed",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        startedAtMs: 10,
        completedAtMs: 20,
        reviewId: "guardian-critical",
        targetItemId: null,
        decisionSource: "agent",
        review: { status: "denied", riskLevel: "critical", userAuthorization: "unknown", rationale: "Secret exfiltration risk." },
        action: { type: "networkAccess", target: "https://evil.example", host: "evil.example", protocol: "https", port: 443 },
      },
    })}\n`);

    service.respondToApproval("session-a", "guardian:guardian-critical", "decline");

    expect(writtenMessages(process).some((message) => message.method === "thread/approveGuardianDeniedAction")).toBe(false);
    expect(onEvent).toHaveBeenCalledWith({ kind: "approval-resolved", approvalId: "guardian:guardian-critical" });
  });

  it("keeps a completed turn alive until its Guardian denial is resolved", async () => {
    const process = createProcess();
    const service = new CodexExecService(vi.fn().mockReturnValue(process));
    const onEvent = vi.fn();

    service.start({ sessionId: "session-a", cwd: "/tmp/project", prompt: "hello", onEvent });
    process.stdout.emit("data", `${JSON.stringify({
      method: "item/autoApprovalReview/completed",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        startedAtMs: 10,
        completedAtMs: 20,
        reviewId: "guardian-high",
        targetItemId: "item-1",
        decisionSource: "agent",
        review: { status: "denied", riskLevel: "high", userAuthorization: "low", rationale: "Destructive action." },
        action: { type: "command", source: "shell", command: "rm -rf important", cwd: "/tmp/project" },
      },
    })}\n`);
    process.stdout.emit("data", `${JSON.stringify({
      method: "turn/completed",
      params: { turn: { id: "turn-1", status: "completed" } },
    })}\n`);

    expect(service.isRunning("session-a")).toBe(true);
    expect(process.kill).not.toHaveBeenCalled();
    expect(onEvent).not.toHaveBeenCalledWith({ kind: "status", status: "completed" });

    await service.respondToApproval("session-a", "guardian:guardian-high", "decline");

    expect(service.isRunning("session-a")).toBe(false);
    expect(process.kill).toHaveBeenCalledWith("SIGTERM");
    expect(onEvent).toHaveBeenCalledWith({ kind: "status", status: "completed" });
  });

  it("keeps the runtime alive while a Guardian override request is in flight", async () => {
    const process = createProcess();
    const service = new CodexExecService(vi.fn().mockReturnValue(process));
    const onEvent = vi.fn();

    service.start({ sessionId: "session-a", cwd: "/tmp/project", prompt: "hello", onEvent });
    process.stdout.emit("data", `${JSON.stringify({
      method: "item/autoApprovalReview/completed",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        startedAtMs: 10,
        completedAtMs: 20,
        reviewId: "guardian-high",
        targetItemId: "item-1",
        decisionSource: "agent",
        review: { status: "denied", riskLevel: "high", userAuthorization: "low", rationale: "Destructive action." },
        action: { type: "command", source: "shell", command: "rm -rf important", cwd: "/tmp/project" },
      },
    })}\n`);
    service.respondToApproval("session-a", "guardian:guardian-high", "accept");
    process.stdout.emit("data", `${JSON.stringify({
      method: "turn/completed",
      params: { turn: { id: "turn-1", status: "completed" } },
    })}\n`);

    const override = writtenMessages(process).find((message) => message.method === "thread/approveGuardianDeniedAction");
    process.stdout.emit("data", `${JSON.stringify({ id: override.id, result: {} })}\n`);

    await vi.waitFor(() => expect(writtenMessages(process).filter((message) => message.method === "turn/start")).toHaveLength(1));
    const retryTurn = writtenMessages(process).find((message) => message.method === "turn/start");
    expect(retryTurn).toEqual(expect.objectContaining({
      params: expect.objectContaining({
        threadId: "thread-1",
        cwd: "/tmp/project",
        approvalsReviewer: "user",
        sandbox: "danger-full-access",
        input: [expect.objectContaining({ type: "text", text: expect.stringMatching(/exact Guardian-denied action/) })],
      }),
    }));
    expect(service.isRunning("session-a")).toBe(true);
    expect(process.kill).not.toHaveBeenCalled();
    expect(onEvent).not.toHaveBeenCalledWith({ kind: "status", status: "completed" });
  });

  it("normalizes Guardian execve actions for the core override protocol", async () => {
    const process = createProcess();
    const service = new CodexExecService(vi.fn().mockReturnValue(process));

    service.start({ sessionId: "session-a", cwd: "/tmp/project", prompt: "hello", onEvent: vi.fn() });
    process.stdout.emit("data", `${JSON.stringify({
      method: "item/autoApprovalReview/completed",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        startedAtMs: 10,
        completedAtMs: 20,
        reviewId: "guardian-execve",
        targetItemId: "item-1",
        decisionSource: "agent",
        review: { status: "denied", riskLevel: "high", userAuthorization: "low", rationale: "Process risk." },
        action: { type: "execve", source: "unifiedExec", program: "git", argv: ["git", "push"], cwd: "/tmp/project" },
      },
    })}\n`);
    service.respondToApproval("session-a", "guardian:guardian-execve", "accept");

    const override = writtenMessages(process).find((message) => message.method === "thread/approveGuardianDeniedAction");
    expect(override.params.event.action).toEqual({
      type: "execve",
      source: "unified_exec",
      program: "git",
      argv: ["git", "push"],
      cwd: "/tmp/project",
    });
  });

  it("runs different sessions concurrently and stops only the requested process", () => {
    const firstProcess = createProcess();
    const secondProcess = createProcess();
    const spawnProcess = vi.fn()
      .mockReturnValueOnce(firstProcess)
      .mockReturnValueOnce(secondProcess);
    const service = new CodexExecService(spawnProcess);

    service.start({ sessionId: "session-a", cwd: "/tmp/project", prompt: "hello", onEvent: vi.fn() });
    service.start({ sessionId: "session-b", cwd: "/tmp/project", prompt: "review", onEvent: vi.fn() });
    expect(service.runningCount()).toBe(2);
    expect(service.isRunning("session-a")).toBe(true);
    expect(service.isRunning("session-b")).toBe(true);

    service.stop("session-a");

    expect(firstProcess.kill).toHaveBeenCalledWith("SIGTERM");
    expect(secondProcess.kill).not.toHaveBeenCalled();
    expect(service.isRunning("session-a")).toBe(false);
    expect(service.isRunning("session-b")).toBe(true);
  });

  it("provides a packaged-app fallback LiteLLM key while preserving native overrides", () => {
    expect(buildCodexEnvironment({}).LITELLM_PROXY_API_KEY).toBe("aureum-local");
    expect(buildCodexEnvironment({ AUREUM_LITELLM_PROXY_API_KEY: "custom" }).LITELLM_PROXY_API_KEY).toBe("custom");
    expect(buildCodexEnvironment({ LITELLM_PROXY_API_KEY: "native" }).LITELLM_PROXY_API_KEY).toBe("native");
  });

  it("does not override the model or review model configured by Codex", () => {
    const writtenCatalogs: Array<{ path: string; catalog: unknown }> = [];
    expect(buildCodexAppServerArgs(
      "/tmp/project",
      { HOME: "/Users/test" },
      () => 'model = "available-default-model"\nreview_model = "codex-auto-review"\n[model_providers.test]\nname = "Test"',
      () => ({
        models: [
          { slug: "gpt-5.6-sol", display_name: "GPT-5.6 Sol", supported_reasoning_levels: [], default_reasoning_level: "low" },
        ],
      }),
      (path, catalog) => writtenCatalogs.push({ path, catalog }),
    )).toEqual(["-c", "features.code_mode_host=false", "app-server", "--stdio"]);
    expect(writtenCatalogs).toEqual([]);

    expect(buildCodexAppServerArgs(
      "/tmp/project",
      { AUREUM_CODEX_REVIEW_MODEL: "guardian-model", HOME: "/Users/test" },
      () => 'model = "main-model"',
      () => ({ models: [{ slug: "gpt-5.6-sol", display_name: "GPT-5.6 Sol" }] }),
      () => undefined,
    )).toEqual(["-c", "features.code_mode_host=false", "app-server", "--stdio"]);
  });

  it("runs app-server with Codex-hosted tools instead of unsupported client-hosted Code Mode tools", () => {
    expect(buildCodexAppServerArgs(
      "/tmp/project",
      { HOME: "/Users/test" },
      () => 'model = "available-default-model"',
      () => ({ models: [{ slug: "available-default-model", display_name: "Available" }] }),
      () => undefined,
    )).toContain("features.code_mode_host=false");
  });

  it("adds Homebrew executables to the PATH inherited by Codex", () => {
    const environment = buildCodexEnvironment({ PATH: ["/usr/bin", "/bin", "/usr/local/bin"].join(delimiter) });
    const pathEntries = environment.PATH?.split(delimiter);

    expect(pathEntries).toEqual([
      "/usr/bin",
      "/bin",
      "/usr/local/bin",
      "/opt/homebrew/bin",
      "/opt/homebrew/sbin",
      "/usr/local/sbin",
    ]);
  });

  it("uses the configured Codex default model", () => {
    const process = createProcess();
    const spawnProcess = vi.fn().mockReturnValue(process);
    const service = new CodexExecService(spawnProcess);

    service.start({ sessionId: "session-a", cwd: "/tmp/project", prompt: "hello", onEvent: vi.fn() });

    expect(spawnProcess.mock.calls[0][1]).not.toContain("--model");
  });

  it("passes selected images through the app-server turn input", async () => {
    const process = createProcess();
    const spawnProcess = vi.fn().mockReturnValue(process);
    const service = new CodexExecService(spawnProcess);

    service.start({
      sessionId: "session-a",
      cwd: "/tmp/project",
      prompt: "review these",
      imagePaths: ["/tmp/reference one.png", "/tmp/reference-two.jpg"],
      onEvent: vi.fn(),
    });
    replyTo(process, "initialize", { userAgent: "test" });
    await vi.waitFor(() => expect(writtenMessages(process).some((message) => message.method === "thread/start")).toBe(true));
    replyTo(process, "thread/start", { thread: { id: "thread-1" } });
    await vi.waitFor(() => expect(writtenMessages(process).some((message) => message.method === "turn/start")).toBe(true));

    expect(writtenMessages(process)).toContainEqual(expect.objectContaining({
      method: "turn/start",
      params: expect.objectContaining({
        input: [
          { type: "text", text: "review these", text_elements: [] },
          { type: "localImage", path: "/tmp/reference one.png" },
          { type: "localImage", path: "/tmp/reference-two.jpg" },
        ],
      }),
    }));
  });

  it("passes selected attachments through the app-server turn input", async () => {
    const process = createProcess();
    const spawnProcess = vi.fn().mockReturnValue(process);
    const service = new CodexExecService(spawnProcess);

    service.start({
      sessionId: "session-a",
      cwd: "/tmp/project",
      prompt: "review this file",
      attachments: [{
        path: "/tmp/project/src/App.tsx",
        kind: "text",
        language: "typescript",
        content: "export const app = true;",
      }, {
        path: "/tmp/project/reference.png",
        kind: "image",
        language: "plaintext",
      }],
      onEvent: vi.fn(),
    });
    replyTo(process, "initialize", { userAgent: "test" });
    await vi.waitFor(() => expect(writtenMessages(process).some((message) => message.method === "thread/start")).toBe(true));
    replyTo(process, "thread/start", { thread: { id: "thread-1" } });
    await vi.waitFor(() => expect(writtenMessages(process).some((message) => message.method === "turn/start")).toBe(true));

    expect(writtenMessages(process)).toContainEqual(expect.objectContaining({
      method: "turn/start",
      params: expect.objectContaining({
        input: [
          { type: "text", text: "review this file", text_elements: [] },
          {
            type: "text",
            text: [
              "Attached file: /tmp/project/src/App.tsx",
              "Source path: /tmp/project/src/App.tsx",
              "Format: typescript",
              "Language: typescript",
              "",
              "```typescript",
              "export const app = true;",
              "```",
            ].join("\n"),
            text_elements: [],
          },
          { type: "localImage", path: "/tmp/project/reference.png" },
        ],
      }),
    }));
  });

  it("passes converted video keyframes through the app-server turn input", async () => {
    const process = createProcess();
    const service = new CodexExecService(vi.fn().mockReturnValue(process));

    service.start({
      sessionId: "session-a",
      cwd: "/tmp/project",
      prompt: "review video",
      attachments: [{
        path: "/tmp/project/demo.mp4",
        kind: "video",
        language: "video",
        format: "mp4",
        displayName: "demo.mp4",
        mediaPaths: ["/tmp/cache/frame-001.jpg", "/tmp/cache/frame-002.jpg"],
        metadata: { frameCount: 2, frameTimestamps: ["00:00:01.000", "00:00:04.000"] },
      }],
      onEvent: vi.fn(),
    });
    replyTo(process, "initialize", { userAgent: "test" });
    await vi.waitFor(() => expect(writtenMessages(process).some((message) => message.method === "thread/start")).toBe(true));
    replyTo(process, "thread/start", { thread: { id: "thread-1" } });
    await vi.waitFor(() => expect(writtenMessages(process).some((message) => message.method === "turn/start")).toBe(true));

    expect(writtenMessages(process)).toContainEqual(expect.objectContaining({
      method: "turn/start",
      params: expect.objectContaining({
        input: [
          { type: "text", text: "review video", text_elements: [] },
          {
            type: "text",
            text: [
              "Attached video: demo.mp4",
              "Source path: /tmp/project/demo.mp4",
              "Format: mp4",
              "Keyframes: 2",
              "Timestamps: 00:00:01.000, 00:00:04.000",
            ].join("\n"),
            text_elements: [],
          },
          { type: "localImage", path: "/tmp/cache/frame-001.jpg" },
          { type: "localImage", path: "/tmp/cache/frame-002.jpg" },
        ],
      }),
    }));
  });

  it("uses normalized image paths and deduplicates legacy images", async () => {
    const process = createProcess();
    const service = new CodexExecService(vi.fn().mockReturnValue(process));

    service.start({
      sessionId: "session-a",
      cwd: "/tmp/project",
      prompt: "review image",
      attachments: [{
        path: "/tmp/project/source.heic",
        kind: "image",
        language: "plaintext",
        format: "heic",
        mediaPaths: ["/tmp/cache/source.png"],
      }],
      imagePaths: ["/tmp/cache/source.png"],
      onEvent: vi.fn(),
    });
    replyTo(process, "initialize", { userAgent: "test" });
    await vi.waitFor(() => expect(writtenMessages(process).some((message) => message.method === "thread/start")).toBe(true));
    replyTo(process, "thread/start", { thread: { id: "thread-1" } });
    await vi.waitFor(() => expect(writtenMessages(process).some((message) => message.method === "turn/start")).toBe(true));

    const turnStart = writtenMessages(process).find((message) => message.method === "turn/start");
    expect(turnStart).toEqual(expect.objectContaining({
      params: expect.objectContaining({
        input: [
          { type: "text", text: "review image", text_elements: [] },
          { type: "localImage", path: "/tmp/cache/source.png" },
        ],
      }),
    }));
  });

  it("passes selected skills through the app-server turn input", async () => {
    const process = createProcess();
    const service = new CodexExecService(vi.fn().mockReturnValue(process));

    service.start({
      sessionId: "session-a",
      cwd: "/tmp/project",
      prompt: "review this",
      skills: [{
        name: "code-review",
        description: "Review code changes",
        path: "/Users/test/.codex/skills/code-review/SKILL.md",
        scope: "user",
        enabled: true,
      }],
      onEvent: vi.fn(),
    });
    replyTo(process, "initialize", { userAgent: "test" });
    await vi.waitFor(() => expect(writtenMessages(process).some((message) => message.method === "thread/start")).toBe(true));
    replyTo(process, "thread/start", { thread: { id: "thread-1" } });
    await vi.waitFor(() => expect(writtenMessages(process).some((message) => message.method === "turn/start")).toBe(true));

    expect(writtenMessages(process)).toContainEqual(expect.objectContaining({
      method: "turn/start",
      params: expect.objectContaining({
        input: [
          { type: "text", text: "review this", text_elements: [] },
          { type: "skill", name: "code-review", path: "/Users/test/.codex/skills/code-review/SKILL.md" },
        ],
      }),
    }));
  });

  it("lists enabled native skills and releases its helper process", async () => {
    const process = createProcess();
    const service = new CodexExecService(vi.fn().mockReturnValue(process));

    const skillsPromise = service.listSkills("/tmp/project");
    replyTo(process, "initialize", { userAgent: "test" });
    await vi.waitFor(() => expect(writtenMessages(process).some((message) => message.method === "skills/list")).toBe(true));
    replyTo(process, "skills/list", {
      data: [{
        cwd: "/tmp/project",
        skills: [
          { name: "review", description: "Review changes", path: "/skills/review/SKILL.md", scope: "user", enabled: true },
          { name: "disabled", description: "Disabled skill", path: "/skills/disabled/SKILL.md", scope: "repo", enabled: false },
        ],
        errors: [],
      }],
    });

    await expect(skillsPromise).resolves.toEqual([
      { name: "review", description: "Review changes", path: "/skills/review/SKILL.md", scope: "user", enabled: true },
    ]);
    expect(writtenMessages(process)).toContainEqual(expect.objectContaining({
      method: "skills/list",
      params: { cwds: ["/tmp/project"], forceReload: false },
    }));
    expect(process.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("creates threads and manages goals through native app-server methods", async () => {
    const createProcessHandle = createProcess();
    const getProcessHandle = createProcess();
    const setProcessHandle = createProcess();
    const clearProcessHandle = createProcess();
    const spawnProcess = vi.fn()
      .mockReturnValueOnce(createProcessHandle)
      .mockReturnValueOnce(getProcessHandle)
      .mockReturnValueOnce(setProcessHandle)
      .mockReturnValueOnce(clearProcessHandle);
    const service = new CodexExecService(spawnProcess);

    const createPromise = service.createThread("/tmp/project");
    replyTo(createProcessHandle, "initialize", { userAgent: "test" });
    await vi.waitFor(() => expect(writtenMessages(createProcessHandle).some((message) => message.method === "thread/start")).toBe(true));
    replyTo(createProcessHandle, "thread/start", { thread: { id: "thread-1" } });
    await expect(createPromise).resolves.toBe("thread-1");

    const getPromise = service.getGoal("/tmp/project", "thread-1");
    replyTo(getProcessHandle, "initialize", { userAgent: "test" });
    await vi.waitFor(() => expect(writtenMessages(getProcessHandle).some((message) => message.method === "thread/goal/get")).toBe(true));
    replyTo(getProcessHandle, "thread/goal/get", { goal: null });
    await expect(getPromise).resolves.toBeNull();

    const setPromise = service.setGoal("/tmp/project", "thread-1", "Ship the feature");
    replyTo(setProcessHandle, "initialize", { userAgent: "test" });
    await vi.waitFor(() => expect(writtenMessages(setProcessHandle).some((message) => message.method === "thread/goal/set")).toBe(true));
    replyTo(setProcessHandle, "thread/goal/set", {
      goal: {
        threadId: "thread-1",
        objective: "Ship the feature",
        status: "active",
        tokenBudget: null,
        tokensUsed: 0,
        timeUsedSeconds: 0,
        createdAt: 1,
        updatedAt: 1,
      },
    });
    await expect(setPromise).resolves.toEqual(expect.objectContaining({ objective: "Ship the feature" }));
    expect(writtenMessages(setProcessHandle)).toContainEqual(expect.objectContaining({
      method: "thread/goal/set",
      params: { threadId: "thread-1", objective: "Ship the feature" },
    }));

    const clearPromise = service.clearGoal("/tmp/project", "thread-1");
    replyTo(clearProcessHandle, "initialize", { userAgent: "test" });
    await vi.waitFor(() => expect(writtenMessages(clearProcessHandle).some((message) => message.method === "thread/goal/clear")).toBe(true));
    replyTo(clearProcessHandle, "thread/goal/clear", { cleared: true });
    await expect(clearPromise).resolves.toBe(true);
    expect(clearProcessHandle.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("resumes existing threads through app-server", async () => {
    const process = createProcess();
    const spawnProcess = vi.fn().mockReturnValue(process);
    const service = new CodexExecService(spawnProcess, () => false);

    service.start({
      sessionId: "session-a",
      cwd: "/tmp/project",
      prompt: "continue",
      threadId: "thread-1",
      history: [{ role: "user", content: "Earlier message" }],
      onEvent: vi.fn(),
    });
    replyTo(process, "initialize", { userAgent: "test" });
    await vi.waitFor(() => expect(writtenMessages(process).some((message) => message.method === "thread/resume")).toBe(true));

    expect(writtenMessages(process)).toContainEqual(expect.objectContaining({
      method: "thread/resume",
      params: expect.objectContaining({
        threadId: "thread-1",
        approvalPolicy: "never",
        approvalsReviewer: "user",
        sandbox: "danger-full-access",
      }),
    }));

    replyTo(process, "thread/resume", { thread: { id: "thread-1" } });
    await vi.waitFor(() => expect(writtenMessages(process).some((message) => message.method === "turn/start")).toBe(true));
    expect(writtenMessages(process)).toContainEqual(expect.objectContaining({
      method: "turn/start",
      params: expect.objectContaining({
        input: [{ type: "text", text: "continue", text_elements: [] }],
      }),
    }));
  });

  it("starts a clean thread when a saved thread id is known to contain legacy Code Mode tool history", async () => {
    const process = createProcess();
    const spawnProcess = vi.fn().mockReturnValue(process);
    const service = new CodexExecService(spawnProcess, () => true);
    const onEvent = vi.fn();

    service.start({
      sessionId: "session-a",
      cwd: "/tmp/project",
      prompt: "continue",
      threadId: "legacy-thread",
      history: [
        { role: "user", content: "Remember the project is called Aureum." },
        { role: "assistant", content: "Understood. The project is Aureum." },
      ],
      onEvent,
    });
    replyTo(process, "initialize", { userAgent: "test" });
    await vi.waitFor(() => expect(writtenMessages(process).some((message) => message.method === "thread/start")).toBe(true));
    replyTo(process, "thread/start", { thread: { id: "clean-thread" } });
    await vi.waitFor(() => expect(writtenMessages(process).some((message) => message.method === "turn/start")).toBe(true));

    expect(writtenMessages(process).some((message) => message.method === "thread/resume")).toBe(false);
    expect(writtenMessages(process)).toContainEqual(expect.objectContaining({
      method: "thread/start",
      params: expect.not.objectContaining({ threadId: "legacy-thread" }),
    }));
    expect(writtenMessages(process)).toContainEqual(expect.objectContaining({
      method: "turn/start",
      params: expect.objectContaining({
        input: [
          {
            type: "text",
            text: [
              "Conversation history from this Aureum Atelier session:",
              "",
              "User: Remember the project is called Aureum.",
              "",
              "Assistant: Understood. The project is Aureum.",
            ].join("\n"),
            text_elements: [],
          },
          { type: "text", text: "continue", text_elements: [] },
        ],
      }),
    }));
    expect(onEvent).toHaveBeenCalledWith({ kind: "thread-started", threadId: "clean-thread" });
  });

  it("keeps bridged legacy conversation history compact", async () => {
    const process = createProcess();
    const service = new CodexExecService(vi.fn().mockReturnValue(process), () => true);
    const longHistory = Array.from({ length: 40 }, (_, index) => ({
      role: index % 2 === 0 ? "user" as const : "assistant" as const,
      content: `message-${index} ${"x".repeat(1000)}`,
    }));

    service.start({
      sessionId: "session-a",
      cwd: "/tmp/project",
      prompt: "continue",
      threadId: "legacy-thread",
      history: longHistory,
      onEvent: vi.fn(),
    });
    replyTo(process, "initialize", { userAgent: "test" });
    await vi.waitFor(() => expect(writtenMessages(process).some((message) => message.method === "thread/start")).toBe(true));
    replyTo(process, "thread/start", { thread: { id: "clean-thread" } });
    await vi.waitFor(() => expect(writtenMessages(process).some((message) => message.method === "turn/start")).toBe(true));

    const turnStart = writtenMessages(process).find((message) => message.method === "turn/start");
    const historyInput = turnStart.params.input[0];
    expect(historyInput.text).toContain("earlier session messages omitted");
    expect(historyInput.text).toContain("message-39");
    expect(historyInput.text.length).toBeLessThanOrEqual(12_500);
  });

  it("signals completion only after releasing the finished process", () => {
    const firstProcess = createProcess();
    const secondProcess = createProcess();
    const spawnProcess = vi.fn()
      .mockReturnValueOnce(firstProcess)
      .mockReturnValueOnce(secondProcess);
    const service = new CodexExecService(spawnProcess);
    const onEvent = vi.fn((event) => {
      if (event.kind === "status" && event.status === "completed") {
        service.start({ sessionId: "session-a", cwd: "/tmp/project", prompt: "follow up", threadId: "thread-1", onEvent: vi.fn() });
      }
    });

    service.start({ sessionId: "session-a", cwd: "/tmp/project", prompt: "hello", onEvent });
    firstProcess.stdout.emit("data", `${JSON.stringify({ method: "turn/completed", params: { turn: { status: "completed" } } })}\n`);

    expect(spawnProcess).toHaveBeenCalledTimes(2);
  });

  it("releases only the process that actually closes", () => {
    const firstProcess = createProcess();
    const secondProcess = createProcess();
    const spawnProcess = vi.fn()
      .mockReturnValueOnce(firstProcess)
      .mockReturnValueOnce(secondProcess);
    const service = new CodexExecService(spawnProcess);

    service.start({ sessionId: "session-a", cwd: "/tmp/project", prompt: "first", onEvent: vi.fn() });
    service.start({ sessionId: "session-b", cwd: "/tmp/project", prompt: "second", onEvent: vi.fn() });
    firstProcess.emit("close", 0);

    expect(service.isRunning("session-a")).toBe(false);
    expect(service.isRunning("session-b")).toBe(true);
    expect(service.runningCount()).toBe(1);
  });
});
