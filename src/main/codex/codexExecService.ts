import type { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

import type { CodexApprovalDecision, CodexApprovalRequest, CodexAttachment, CodexConversationMessage, CodexSkill, CodexThreadGoal, CodexUiEvent } from "../../shared/codex";

const macosExecutablePaths = [
  "/opt/homebrew/bin",
  "/usr/local/bin",
  "/opt/homebrew/sbin",
  "/usr/local/sbin",
];

const maxBridgedHistoryCharacters = 12_000;

export type SpawnedProcess = EventEmitter & {
  stdin: { write: (line: string) => boolean };
  stdout: EventEmitter & { setEncoding: (encoding: BufferEncoding) => void };
  stderr: EventEmitter & { setEncoding: (encoding: BufferEncoding) => void };
  kill: (signal?: NodeJS.Signals) => boolean;
};

export type StartCodexOptions = {
  sessionId: string;
  cwd: string;
  prompt: string;
  attachments?: CodexAttachment[];
  imagePaths?: string[];
  history?: CodexConversationMessage[];
  skills?: CodexSkill[];
  threadId?: string;
  onEvent: (event: CodexUiEvent) => void;
};

type SpawnProcess = (command: string, args: string[], options: { cwd: string; env: NodeJS.ProcessEnv; stdio: ["pipe", "pipe", "pipe"] }) => SpawnedProcess;
type HasLegacyThreadHistory = (threadId: string) => boolean;

type JsonRpcId = string | number;

type PendingRequest = {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
};

type PendingApproval = {
  requestId?: JsonRpcId;
  type: CodexApprovalRequest["type"];
  threadId?: string;
  guardianEvent?: Record<string, unknown>;
};

type CodexRuntime = {
  sessionId: string;
  cwd: string;
  process: SpawnedProcess;
  onEvent: (event: CodexUiEvent) => void;
  pendingRequests: Map<string, PendingRequest>;
  pendingApprovals: Map<string, PendingApproval>;
  assistantDeltaItemIds: Set<string>;
  stdoutBuffer: string;
  stderrBuffer: string;
  nextRequestId: number;
  pendingGuardianOverrides: number;
  deferredCompletion?: Extract<CodexUiEvent, { kind: "status" }>;
  finished: boolean;
};

export class CodexExecService {
  private activeProcesses = new Map<string, CodexRuntime>();
  private spawnProcess: SpawnProcess;
  private hasLegacyThreadHistory: HasLegacyThreadHistory;

  constructor(
    spawnProcess: SpawnProcess = spawn as unknown as SpawnProcess,
    hasLegacyThreadHistory: HasLegacyThreadHistory = hasLegacyCodeModeHistory,
  ) {
    this.spawnProcess = spawnProcess;
    this.hasLegacyThreadHistory = hasLegacyThreadHistory;
  }

  start({ sessionId, cwd, prompt, attachments = [], imagePaths = [], history = [], skills = [], threadId, onEvent }: StartCodexOptions): void {
    if (this.activeProcesses.has(sessionId)) throw new Error("Codex is already running for this session");

    const child = this.spawnProcess(resolveCodexExecutable(), buildCodexAppServerArgs(cwd), {
      cwd,
      env: buildCodexEnvironment(),
      stdio: ["pipe", "pipe", "pipe"],
    });
    const runtime: CodexRuntime = {
      sessionId,
      cwd,
      process: child,
      onEvent,
      pendingRequests: new Map(),
      pendingApprovals: new Map(),
      assistantDeltaItemIds: new Set(),
      stdoutBuffer: "",
      stderrBuffer: "",
      nextRequestId: 1,
      pendingGuardianOverrides: 0,
      deferredCompletion: undefined,
      finished: false,
    };

    this.activeProcesses.set(sessionId, runtime);
    onEvent({ kind: "status", status: "started" });

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk: string) => {
      runtime.stdoutBuffer += chunk;
      const lines = runtime.stdoutBuffer.split("\n");
      runtime.stdoutBuffer = lines.pop() ?? "";
      for (const line of lines) {
        this.handleMessage(runtime, line);
      }
    });

    child.stderr.on("data", (chunk: string) => {
      runtime.stderrBuffer += chunk;
    });

    child.on("close", (code: number | null) => {
      if (this.activeProcesses.get(sessionId) !== runtime) return;
      if (runtime.stdoutBuffer.trim()) this.handleMessage(runtime, runtime.stdoutBuffer);
      this.failRuntime(runtime, runtime.stderrBuffer.trim() || `Codex app-server exited with code ${code ?? "unknown"}`);
    });

    child.on("error", (error: Error) => {
      this.failRuntime(runtime, error.message);
    });

    void this.initializeRuntime(runtime, { cwd, prompt, attachments, imagePaths, history, skills, threadId }).catch((error: unknown) => {
      this.failRuntime(runtime, error instanceof Error ? error.message : "Failed to initialize Codex");
    });
  }

  stop(sessionId: string): void {
    const runtime = this.activeProcesses.get(sessionId);
    if (!runtime) return;
    this.finishRuntime(runtime, { kind: "status", status: "stopped" });
  }

  respondToApproval(sessionId: string, approvalId: string, decision: CodexApprovalDecision): void {
    const runtime = this.activeProcesses.get(sessionId);
    const approval = runtime?.pendingApprovals.get(approvalId);
    if (!runtime || !approval) throw new Error("No pending Codex approval for this session");

    runtime.pendingApprovals.delete(approvalId);
    if (approval.type === "guardian-denial") {
      if (decision === "accept" && approval.threadId && approval.guardianEvent) {
        runtime.pendingGuardianOverrides += 1;
        void this.request(runtime, "thread/approveGuardianDeniedAction", {
          threadId: approval.threadId,
          event: approval.guardianEvent,
        }).then(() => {
          runtime.pendingGuardianOverrides -= 1;
          this.resumeDeferredGuardianAction(runtime, approval.threadId!);
        }).catch((error: unknown) => {
          runtime.pendingGuardianOverrides -= 1;
          this.failRuntime(runtime, error instanceof Error ? error.message : "Failed to approve Guardian action");
        });
      }
      runtime.onEvent({ kind: "approval-resolved", approvalId });
      if (decision !== "accept") this.finishDeferredCompletion(runtime);
      return;
    }

    this.write(runtime, { id: approval.requestId, result: { decision } });
    runtime.onEvent({ kind: "approval-resolved", approvalId });
  }

  isRunning(sessionId: string): boolean {
    return this.activeProcesses.has(sessionId);
  }

  runningCount(): number {
    return this.activeProcesses.size;
  }

  async listSkills(cwd: string): Promise<CodexSkill[]> {
    const result = await this.runOneShot(cwd, (runtime) => this.request(runtime, "skills/list", {
      cwds: [cwd],
      forceReload: false,
    }));
    const entries = Array.isArray(asRecord(result).data) ? asRecord(result).data as unknown[] : [];
    return entries.flatMap((entry) => {
      const skills = asRecord(entry).skills;
      return Array.isArray(skills) ? skills.map(normalizeSkill).filter((skill): skill is CodexSkill => Boolean(skill?.enabled)) : [];
    });
  }

  async createThread(cwd: string): Promise<string> {
    const result = await this.runOneShot(cwd, (runtime) => this.request(runtime, "thread/start", threadParams(cwd)));
    const threadId = stringValue(asRecord(asRecord(result).thread).id);
    if (!threadId) throw new Error("Codex app-server did not return a thread id");
    return threadId;
  }

  async getGoal(cwd: string, threadId: string): Promise<CodexThreadGoal | null> {
    const result = await this.runOneShot(cwd, (runtime) => this.request(runtime, "thread/goal/get", { threadId }));
    const goal = asRecord(result).goal;
    return goal ? normalizeGoal(goal) : null;
  }

  async setGoal(cwd: string, threadId: string, objective: string): Promise<CodexThreadGoal> {
    const result = await this.runOneShot(cwd, (runtime) => this.request(runtime, "thread/goal/set", { threadId, objective }));
    const goal = normalizeGoal(asRecord(result).goal);
    if (!goal) throw new Error("Codex app-server did not return the updated goal");
    return goal;
  }

  async clearGoal(cwd: string, threadId: string): Promise<boolean> {
    const result = await this.runOneShot(cwd, (runtime) => this.request(runtime, "thread/goal/clear", { threadId }));
    return asRecord(result).cleared === true;
  }

  private async initializeRuntime(
    runtime: CodexRuntime,
    options: Pick<StartCodexOptions, "cwd" | "prompt" | "attachments" | "imagePaths" | "history" | "skills" | "threadId">,
  ): Promise<void> {
    await this.request(runtime, "initialize", {
      clientInfo: { name: "aureum-atelier", title: "Aureum Atelier", version: "0.1.0" },
      capabilities: { experimentalApi: true, requestAttestation: false },
    });
    this.write(runtime, { method: "initialized" });

    const resumableThreadId = options.threadId && !this.hasLegacyThreadHistory(options.threadId) ? options.threadId : undefined;
    const threadResult = await this.request(runtime, resumableThreadId ? "thread/resume" : "thread/start", {
      ...(resumableThreadId ? { threadId: resumableThreadId, excludeTurns: true } : {}),
      ...threadParams(options.cwd),
    }) as { thread?: { id?: string } };
    const threadId = threadResult.thread?.id;
    if (!threadId) throw new Error("Codex app-server did not return a thread id");

    runtime.onEvent({ kind: "thread-started", threadId });
    await this.request(runtime, "turn/start", {
      threadId,
      cwd: options.cwd,
      ...codexPermissionParams(),
      input: [
        ...(!resumableThreadId && options.threadId ? buildConversationHistoryInputs(options.history ?? []) : []),
        { type: "text", text: options.prompt, text_elements: [] },
        ...buildAttachmentInputs(options.attachments ?? [], options.imagePaths ?? []),
        ...(options.skills ?? []).map((skill) => ({ type: "skill", name: skill.name, path: skill.path })),
      ],
    });
  }

  private async runOneShot<T>(cwd: string, operation: (runtime: CodexRuntime) => Promise<T>): Promise<T> {
    const child = this.spawnProcess(resolveCodexExecutable(), buildCodexAppServerArgs(cwd), {
      cwd,
      env: buildCodexEnvironment(),
      stdio: ["pipe", "pipe", "pipe"],
    });
    const runtime: CodexRuntime = {
      sessionId: `helper-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      cwd,
      process: child,
      onEvent: () => undefined,
      pendingRequests: new Map(),
      pendingApprovals: new Map(),
      assistantDeltaItemIds: new Set(),
      stdoutBuffer: "",
      stderrBuffer: "",
      nextRequestId: 1,
      pendingGuardianOverrides: 0,
      deferredCompletion: undefined,
      finished: false,
    };

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      runtime.stdoutBuffer += chunk;
      const lines = runtime.stdoutBuffer.split("\n");
      runtime.stdoutBuffer = lines.pop() ?? "";
      for (const line of lines) this.handleMessage(runtime, line);
    });
    child.stderr.on("data", (chunk: string) => {
      runtime.stderrBuffer += chunk;
    });
    const rejectPending = (detail: string) => {
      for (const pending of runtime.pendingRequests.values()) pending.reject(new Error(detail));
      runtime.pendingRequests.clear();
    };
    child.on("close", (code: number | null) => {
      if (runtime.stdoutBuffer.trim()) this.handleMessage(runtime, runtime.stdoutBuffer);
      rejectPending(runtime.stderrBuffer.trim() || `Codex app-server exited with code ${code ?? "unknown"}`);
    });
    child.on("error", (error: Error) => rejectPending(error.message));

    try {
      await this.initializeClient(runtime);
      return await operation(runtime);
    } finally {
      child.kill("SIGTERM");
    }
  }

  private async initializeClient(runtime: CodexRuntime): Promise<void> {
    await this.request(runtime, "initialize", {
      clientInfo: { name: "aureum-atelier", title: "Aureum Atelier", version: "0.1.0" },
      capabilities: { experimentalApi: true, requestAttestation: false },
    });
    this.write(runtime, { method: "initialized" });
  }

  private request(runtime: CodexRuntime, method: string, params: unknown): Promise<unknown> {
    const id = runtime.nextRequestId++;
    const promise = new Promise<unknown>((resolve, reject) => {
      runtime.pendingRequests.set(String(id), { resolve, reject });
    });
    this.write(runtime, { id, method, params });
    return promise;
  }

  private write(runtime: CodexRuntime, message: unknown): void {
    runtime.process.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private handleMessage(runtime: CodexRuntime, line: string): void {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(line) as Record<string, unknown>;
    } catch {
      if (line.trim()) runtime.onEvent({ kind: "raw", text: line.trim() });
      return;
    }

    const id = message.id;
    const method = typeof message.method === "string" ? message.method : undefined;
    if (id !== undefined && !method) {
      const pending = runtime.pendingRequests.get(String(id));
      if (!pending) return;
      runtime.pendingRequests.delete(String(id));
      if (message.error) pending.reject(new Error(jsonRpcErrorMessage(message.error)));
      else pending.resolve(message.result);
      return;
    }

    if (id !== undefined && method) {
      this.handleServerRequest(runtime, id as JsonRpcId, method, asRecord(message.params));
      return;
    }

    if (method) this.handleNotification(runtime, method, asRecord(message.params));
  }

  private handleServerRequest(runtime: CodexRuntime, requestId: JsonRpcId, method: string, params: Record<string, unknown>): void {
    const approval = approvalFromServerRequest(requestId, method, params);
    if (!approval) {
      this.write(runtime, { id: requestId, error: { code: -32601, message: `Unsupported Codex request: ${method}` } });
      return;
    }

    runtime.pendingApprovals.set(approval.id, { requestId, type: approval.type });
    runtime.onEvent({ kind: "approval-request", approval });
  }

  private handleNotification(runtime: CodexRuntime, method: string, params: Record<string, unknown>): void {
    if (method === "item/autoApprovalReview/completed") {
      this.handleGuardianReviewCompleted(runtime, params);
      return;
    }

    if (method === "item/agentMessage/delta") {
      const delta = stringValue(params.delta);
      const itemId = stringValue(params.itemId);
      if (itemId) runtime.assistantDeltaItemIds.add(itemId);
      if (delta) runtime.onEvent({ kind: "assistant-delta", text: delta });
      return;
    }

    if (method === "item/completed") {
      const item = asRecord(params.item);
      const itemType = stringValue(item.type);
      const itemId = stringValue(item.id);
      if (itemType === "agentMessage" && (!itemId || !runtime.assistantDeltaItemIds.has(itemId))) {
        const text = stringValue(item.text);
        if (text) runtime.onEvent({ kind: "assistant-message", text });
      }
      if (itemType === "commandExecution") {
        const command = stringValue(item.command);
        const status = stringValue(item.status);
        runtime.onEvent({ kind: "tool-event", title: status ? `Command · ${status}` : "Command", detail: command });
      }
      if (itemType === "fileChange") {
        runtime.onEvent({ kind: "tool-event", title: "File changes", detail: stringValue(item.status) });
      }
      return;
    }

    if (method === "error") {
      if (params.willRetry === true) return;
      const error = asRecord(params.error);
      this.failRuntime(runtime, stringValue(error.message) ?? "Codex failed");
      return;
    }

    if (method === "turn/completed") {
      const turn = asRecord(params.turn);
      const status = stringValue(turn.status);
      const error = asRecord(turn.error);
      let completion: Extract<CodexUiEvent, { kind: "status" }>;
      if (status === "failed") {
        completion = { kind: "status", status: "failed", detail: stringValue(error.message) ?? "Codex failed" };
      } else if (status === "interrupted") {
        completion = { kind: "status", status: "stopped" };
      } else {
        completion = { kind: "status", status: "completed" };
      }
      if (hasPendingGuardianApproval(runtime)) runtime.deferredCompletion = completion;
      else this.finishRuntime(runtime, completion);
    }
  }

  private handleGuardianReviewCompleted(runtime: CodexRuntime, params: Record<string, unknown>): void {
    const review = asRecord(params.review);
    const status = stringValue(review.status);
    const riskLevel = stringValue(review.riskLevel);
    if (status !== "denied" || (riskLevel !== "high" && riskLevel !== "critical")) return;

    const reviewId = stringValue(params.reviewId);
    const threadId = stringValue(params.threadId);
    if (!reviewId || !threadId) return;

    const action = asRecord(params.action);
    const approvalId = `guardian:${reviewId}`;
    const approval = guardianApprovalFromNotification(approvalId, params, review, action);
    const guardianEvent = guardianEventFromNotification(params, review, action);
    runtime.pendingApprovals.set(approvalId, { type: "guardian-denial", threadId, guardianEvent });
    runtime.onEvent({ kind: "approval-request", approval });
  }

  private finishDeferredCompletion(runtime: CodexRuntime): void {
    if (!runtime.deferredCompletion || hasPendingGuardianApproval(runtime)) return;
    const completion = runtime.deferredCompletion;
    runtime.deferredCompletion = undefined;
    this.finishRuntime(runtime, completion);
  }

  private resumeDeferredGuardianAction(runtime: CodexRuntime, threadId: string): void {
    if (!runtime.deferredCompletion || hasPendingGuardianApproval(runtime)) return;
    runtime.deferredCompletion = undefined;
    void this.request(runtime, "turn/start", {
      threadId,
      cwd: runtime.cwd,
      ...codexPermissionParams(),
      input: [{
        type: "text",
        text: "Continue with the exact Guardian-denied action I just approved. Do not broaden the approved action.",
        text_elements: [],
      }],
    }).catch((error: unknown) => {
      this.failRuntime(runtime, error instanceof Error ? error.message : "Failed to resume the approved Guardian action");
    });
  }

  private failRuntime(runtime: CodexRuntime, detail: string): void {
    this.finishRuntime(runtime, { kind: "status", status: "failed", detail });
  }

  private finishRuntime(runtime: CodexRuntime, event: Extract<CodexUiEvent, { kind: "status" }>): void {
    if (runtime.finished || this.activeProcesses.get(runtime.sessionId) !== runtime) return;
    runtime.finished = true;
    this.activeProcesses.delete(runtime.sessionId);
    for (const pending of runtime.pendingRequests.values()) pending.reject(new Error(event.detail ?? "Codex session ended"));
    runtime.pendingRequests.clear();
    runtime.pendingApprovals.clear();
    runtime.process.kill("SIGTERM");
    runtime.onEvent(event);
  }
}

function approvalFromServerRequest(
  requestId: JsonRpcId,
  method: string,
  params: Record<string, unknown>,
): CodexApprovalRequest | null {
  if (method === "item/commandExecution/requestApproval") {
    return {
      id: String(requestId),
      type: "command",
      title: "Command requires approval",
      command: stringValue(params.command),
      cwd: stringValue(params.cwd),
      reason: stringValue(params.reason),
    };
  }
  if (method === "item/fileChange/requestApproval") {
    return {
      id: String(requestId),
      type: "file-change",
      title: "File changes require approval",
      reason: stringValue(params.reason),
      grantRoot: stringValue(params.grantRoot),
    };
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

export function hasLegacyCodeModeHistory(
  threadId: string,
  sessionsRoot: string = join(process.env.CODEX_HOME?.trim() || join(homedir(), ".codex"), "sessions"),
): boolean {
  if (!/^[a-zA-Z0-9-]+$/.test(threadId) || !existsSync(sessionsRoot)) return false;
  const rolloutPath = findThreadRollout(sessionsRoot, threadId);
  if (!rolloutPath) return false;

  try {
    return readFileSync(rolloutPath, "utf8").split("\n").some((line) => (
      line.includes('"type":"custom_tool_call"')
      && /"namespace"\s*:\s*"exec"/.test(line)
    ));
  } catch {
    return false;
  }
}

function findThreadRollout(directory: string, threadId: string): string | undefined {
  try {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        const nested = findThreadRollout(path, threadId);
        if (nested) return nested;
      } else if (entry.isFile() && entry.name.endsWith(`${threadId}.jsonl`)) {
        return path;
      }
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function threadParams(cwd: string) {
  return {
    cwd,
    runtimeWorkspaceRoots: [cwd],
    ...codexPermissionParams(),
  };
}

function codexPermissionParams() {
  return {
    approvalPolicy: "never",
    approvalsReviewer: "user",
    sandbox: "danger-full-access",
  };
}

function hasPendingGuardianApproval(runtime: CodexRuntime): boolean {
  return runtime.pendingGuardianOverrides > 0
    || [...runtime.pendingApprovals.values()].some((approval) => approval.type === "guardian-denial");
}

function guardianApprovalFromNotification(
  approvalId: string,
  params: Record<string, unknown>,
  review: Record<string, unknown>,
  action: Record<string, unknown>,
): CodexApprovalRequest {
  const actionType = stringValue(action.type);
  const command = guardianActionCommand(action);
  const cwd = stringValue(action.cwd);
  return {
    id: approvalId,
    type: "guardian-denial",
    title: "Guardian review requires approval",
    ...(command ? { command } : {}),
    ...(cwd ? { cwd } : {}),
    reason: stringValue(review.rationale) ?? "Guardian classified this action as high risk.",
    riskLevel: stringValue(review.riskLevel) as CodexApprovalRequest["riskLevel"],
    actionLabel: guardianActionLabel(actionType, action),
    ...(stringValue(params.targetItemId) ? { grantRoot: stringValue(params.targetItemId) } : {}),
  };
}

function guardianEventFromNotification(
  params: Record<string, unknown>,
  review: Record<string, unknown>,
  action: Record<string, unknown>,
): Record<string, unknown> {
  return compactRecord({
    id: stringValue(params.reviewId),
    target_item_id: nullableString(params.targetItemId),
    turn_id: stringValue(params.turnId) ?? "",
    started_at_ms: numberValue(params.startedAtMs) ?? 0,
    completed_at_ms: numberValue(params.completedAtMs),
    status: guardianStatus(review.status),
    risk_level: stringValue(review.riskLevel),
    user_authorization: stringValue(review.userAuthorization),
    rationale: stringValue(review.rationale),
    decision_source: stringValue(params.decisionSource),
    action: guardianActionForCore(action),
  });
}

function guardianActionForCore(action: Record<string, unknown>): Record<string, unknown> {
  const type = stringValue(action.type);
  if (type === "mcpToolCall") {
    return compactRecord({
      type: "mcp_tool_call",
      server: stringValue(action.server),
      tool_name: stringValue(action.toolName),
      connector_id: nullableString(action.connectorId),
      connector_name: nullableString(action.connectorName),
      tool_title: nullableString(action.toolTitle),
    });
  }
  if (type === "networkAccess") {
    return compactRecord({
      type: "network_access",
      target: stringValue(action.target),
      host: stringValue(action.host),
      protocol: guardianNetworkProtocol(action.protocol),
      port: numberValue(action.port),
    });
  }
  if (type === "applyPatch") {
    return compactRecord({
      type: "apply_patch",
      cwd: stringValue(action.cwd),
      files: stringArray(action.files),
    });
  }
  if (type === "execve") {
    return compactRecord({
      type: "execve",
      source: guardianCommandSource(action.source),
      program: stringValue(action.program),
      argv: stringArray(action.argv),
      cwd: stringValue(action.cwd),
    });
  }
  if (type === "requestPermissions") {
    return compactRecord({
      type: "request_permissions",
      reason: nullableString(action.reason),
      permissions: camelToSnakeCase(action.permissions),
    });
  }
  return compactRecord({
    type: "command",
    source: guardianCommandSource(action.source),
    command: stringValue(action.command),
    cwd: stringValue(action.cwd),
  });
}

function guardianActionCommand(action: Record<string, unknown>): string | undefined {
  const type = stringValue(action.type);
  if (type === "command") return stringValue(action.command);
  if (type === "execve") return [stringValue(action.program), ...stringArray(action.argv)].filter(Boolean).join(" ");
  if (type === "applyPatch") {
    const files = stringArray(action.files);
    return files.length === 1 ? `apply_patch touching ${files[0]}` : `apply_patch touching ${files.length} files`;
  }
  if (type === "networkAccess") return `Network access to ${stringValue(action.target) ?? stringValue(action.host) ?? "unknown target"}`;
  if (type === "mcpToolCall") return `MCP ${stringValue(action.toolName) ?? "tool"} on ${stringValue(action.connectorName) ?? stringValue(action.server) ?? "server"}`;
  if (type === "requestPermissions") return stringValue(action.reason) ?? "Permission request";
  return undefined;
}

function guardianActionLabel(type: string | undefined, action: Record<string, unknown>): string {
  if (type === "networkAccess") return "Network access";
  if (type === "applyPatch") return "File patch";
  if (type === "mcpToolCall") return "MCP tool call";
  if (type === "requestPermissions") return "Permission request";
  if (type === "execve") return "Process execution";
  return stringValue(action.command) ? "Command" : "Guardian action";
}

function guardianStatus(value: unknown): string | undefined {
  const status = stringValue(value);
  if (status === "inProgress") return "in_progress";
  return status;
}

function guardianCommandSource(value: unknown): string | undefined {
  const source = stringValue(value);
  if (source === "unifiedExec") return "unified_exec";
  return source;
}

function guardianNetworkProtocol(value: unknown): string | undefined {
  const protocol = stringValue(value);
  if (protocol === "socks5Tcp") return "socks5_tcp";
  if (protocol === "socks5Udp") return "socks5_udp";
  return protocol;
}

function compactRecord(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}

function camelToSnakeCase(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camelToSnakeCase);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`), camelToSnakeCase(entry)]));
}

function nullableString(value: unknown): string | null | undefined {
  if (value === null) return null;
  return stringValue(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function buildAttachmentInputs(attachments: CodexAttachment[], legacyImagePaths: string[]) {
  const imagePaths = new Set<string>();
  const inputs: Array<Record<string, unknown>> = [];

  const pushImage = (path: string) => {
    if (imagePaths.has(path)) return;
    imagePaths.add(path);
    inputs.push({ type: "localImage", path });
  };

  for (const attachment of attachments) {
    if (attachment.kind === "image") {
      for (const mediaPath of attachment.mediaPaths?.length ? attachment.mediaPaths : [attachment.path]) pushImage(mediaPath);
      continue;
    }

    if (attachment.kind === "video") {
      inputs.push({
        type: "text",
        text: [
          `Attached video: ${attachment.displayName ?? attachment.path}`,
          `Source path: ${attachment.path}`,
          `Format: ${attachment.format ?? "video"}`,
          `Keyframes: ${attachment.mediaPaths?.length ?? 0}`,
          attachment.metadata?.frameTimestamps?.length ? `Timestamps: ${attachment.metadata.frameTimestamps.join(", ")}` : undefined,
        ].filter(Boolean).join("\n"),
        text_elements: [],
      });
      for (const mediaPath of attachment.mediaPaths ?? []) pushImage(mediaPath);
      continue;
    }

    inputs.push({
      type: "text",
      text: [
        `Attached file: ${attachment.displayName ?? attachment.path}`,
        `Source path: ${attachment.path}`,
        `Format: ${attachment.format ?? attachment.language}`,
        `Language: ${attachment.language}`,
        "",
        `\`\`\`${attachment.language}`,
        attachment.content ?? "",
        "```",
      ].join("\n"),
      text_elements: [],
    });
  }

  for (const path of legacyImagePaths) pushImage(path);

  return inputs;
}

function buildConversationHistoryInputs(history: CodexConversationMessage[]): Array<Record<string, unknown>> {
  if (history.length === 0) return [];
  const messages: string[] = [];
  let characters = 0;
  let omittedCount = 0;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    const formatted = `${message.role === "user" ? "User" : "Assistant"}: ${message.content}`;
    if (messages.length > 0 && characters + formatted.length > maxBridgedHistoryCharacters) {
      omittedCount = index + 1;
      break;
    }
    messages.unshift(formatted);
    characters += formatted.length;
  }
  return [{
    type: "text",
    text: [
      "Conversation history from this Aureum Atelier session:",
      ...(omittedCount > 0 ? ["", `[${omittedCount} earlier session messages omitted to keep context compact]`] : []),
      ...messages.flatMap((message) => ["", message]),
    ].join("\n"),
    text_elements: [],
  }];
}

function normalizeSkill(value: unknown): CodexSkill | null {
  const skill = asRecord(value);
  const name = stringValue(skill.name);
  const description = stringValue(skill.description);
  const path = stringValue(skill.path);
  const scope = stringValue(skill.scope);
  if (!name || !description || !path || !scope || !["user", "repo", "system", "admin"].includes(scope)) return null;
  return {
    name,
    description,
    ...(stringValue(skill.shortDescription) ? { shortDescription: stringValue(skill.shortDescription) } : {}),
    path,
    scope: scope as CodexSkill["scope"],
    enabled: skill.enabled === true,
  };
}

function normalizeGoal(value: unknown): CodexThreadGoal | null {
  const goal = asRecord(value);
  const threadId = stringValue(goal.threadId);
  const objective = stringValue(goal.objective);
  const status = stringValue(goal.status);
  const tokensUsed = numberValue(goal.tokensUsed);
  const timeUsedSeconds = numberValue(goal.timeUsedSeconds);
  const createdAt = numberValue(goal.createdAt);
  const updatedAt = numberValue(goal.updatedAt);
  if (!threadId || objective === undefined || !status || tokensUsed === undefined || timeUsedSeconds === undefined || createdAt === undefined || updatedAt === undefined) return null;
  return {
    threadId,
    objective,
    status,
    tokenBudget: numberValue(goal.tokenBudget) ?? null,
    tokensUsed,
    timeUsedSeconds,
    createdAt,
    updatedAt,
  };
}

function jsonRpcErrorMessage(value: unknown): string {
  const error = asRecord(value);
  return stringValue(error.message) ?? "Codex app-server request failed";
}

export function resolveCodexExecutable(
  env: NodeJS.ProcessEnv = process.env,
  fileExists: (path: string) => boolean = existsSync,
): string {
  const explicitPath = env.CODEX_BINARY?.trim();
  if (explicitPath && fileExists(explicitPath)) return explicitPath;

  const pathCandidates = (env.PATH ?? "")
    .split(delimiter)
    .filter(Boolean)
    .map((directory) => join(directory, process.platform === "win32" ? "codex.exe" : "codex"));
  const fallbackCandidates = process.platform === "darwin"
    ? ["/opt/homebrew/bin/codex", "/usr/local/bin/codex"]
    : [];

  return [...pathCandidates, ...fallbackCandidates].find(fileExists) ?? "codex";
}

export function buildCodexAppServerArgs(
  cwd: string = process.cwd(),
  env: NodeJS.ProcessEnv = process.env,
  _readConfig?: (path: string) => string | null,
  _loadCatalog?: () => unknown | null,
  _writeCatalog?: (path: string, catalog: unknown) => void,
): string[] {
  void cwd;
  void env;
  const args = ["-c", "features.code_mode_host=false", "app-server"];
  args.push("--stdio");
  return args;
}

export function buildCodexEnvironment(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const nextEnv: NodeJS.ProcessEnv = {
    ...env,
    PATH: buildCodexPath(env.PATH),
  };
  const litellmKey = env.LITELLM_PROXY_API_KEY || env.AUREUM_LITELLM_PROXY_API_KEY || "aureum-local";
  if (litellmKey) nextEnv.LITELLM_PROXY_API_KEY = litellmKey;
  return nextEnv;
}

function buildCodexPath(pathValue: string | undefined): string {
  const pathEntries = (pathValue ?? "").split(delimiter).filter(Boolean);
  const candidates = process.platform === "darwin" ? [...pathEntries, ...macosExecutablePaths] : pathEntries;

  return Array.from(new Set(candidates)).join(delimiter);
}

export const codexExecService = new CodexExecService();
