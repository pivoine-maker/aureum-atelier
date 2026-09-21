import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import type { CodexAttachment, CodexMessage, CodexSession } from "../codex/useCodex";
import { CodexPanel } from "./CodexPanel";

const sessions: CodexSession[] = [
  {
    id: "s1",
    workspaceRoot: "/tmp/project",
    workspaceName: "project",
    title: "Review app",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    messages: [],
    attachments: [],
    selectedSkills: [],
    goal: null,
    approvals: [],
    draft: "",
    status: "running",
    error: null,
  },
  {
    id: "s2",
    workspaceRoot: "/tmp/project",
    workspaceName: "project",
    title: "Fix tests",
    createdAt: "2026-01-02",
    updatedAt: "2026-01-02",
    messages: [],
    attachments: [],
    selectedSkills: [],
    goal: null,
    approvals: [],
    draft: "second draft",
    status: "ready",
    error: null,
  },
];
const messages: CodexMessage[] = [{ id: "m1", role: "user", content: "hello" }];
const attachments: CodexAttachment[] = [{ path: "src/App.tsx", content: "code", language: "typescript", kind: "text" }];

function renderPanel(overrides: Partial<React.ComponentProps<typeof CodexPanel>> = {}) {
  const props: React.ComponentProps<typeof CodexPanel> = {
    activeSessionId: "s1",
    approvalMode: "native-full-access",
    approvals: [],
    attachments,
    composerRef: createRef<HTMLTextAreaElement>(),
    draft: "first draft",
    error: null,
    gitChanges: [],
    isRunning: true,
    messages,
    onPickAttachments: vi.fn().mockResolvedValue(undefined),
    onDeleteSession: vi.fn(),
    onCloseSession: vi.fn(),
    onReopenSession: vi.fn(),
    onDraftChange: vi.fn(),
    onNewSession: vi.fn(),
    onNotice: vi.fn(),
    onRemoveAttachment: vi.fn(),
    onListSkills: vi.fn().mockResolvedValue([]),
    onAddSkill: vi.fn(),
    onRemoveSkill: vi.fn(),
    onLoadGoal: vi.fn().mockResolvedValue(null),
    onSetGoal: vi.fn().mockResolvedValue(null),
    onClearGoal: vi.fn().mockResolvedValue(false),
    onRespondToApproval: vi.fn().mockResolvedValue(undefined),
    onSelectSession: vi.fn(),
    onStop: vi.fn().mockResolvedValue(undefined),
    onSubmit: vi.fn().mockResolvedValue(undefined),
    runningSessionCount: 1,
    recentSessions: [],
    selectedSkills: [],
    activeGoal: null,
    sessions,
    status: "running",
    workspaceOpen: true,
    ...overrides,
  };
  render(<CodexPanel {...props} />);
  return props;
}

describe("CodexPanel", () => {
  it("renders a video attachment as one chip with its extracted frame count", () => {
    renderPanel({
      attachments: [{
        path: "/Users/test/Videos/demo.mp4",
        displayName: "demo.mp4",
        format: "mp4",
        kind: "video",
        language: "video",
        mediaPaths: ["/tmp/frame-001.jpg", "/tmp/frame-002.jpg", "/tmp/frame-003.jpg"],
        metadata: { frameCount: 3 },
      }],
      isRunning: false,
      status: "ready",
    });

    expect(screen.getByText("demo.mp4")).toBeInTheDocument();
    expect(screen.getByText("mp4 · 3 frames")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Remove /Users/test/Videos/demo.mp4" })).toHaveLength(1);
  });

  it("renders assistant output as safe GitHub-flavored Markdown", () => {
    renderPanel({
      attachments: [],
      isRunning: false,
      status: "completed",
      messages: [{
        id: "assistant-markdown",
        role: "assistant",
        content: [
          "## Review summary",
          "",
          "- Fixed the workspace",
          "- Added `Markdown` output",
          "",
          "| Area | Status |",
          "| --- | --- |",
          "| Chat | Ready |",
          "",
          "```ts",
          "const gilded = true;",
          "```",
          "",
          "[Documentation](https://example.com/docs)",
          "",
          "<script>alert('unsafe')</script>",
        ].join("\n"),
      }],
    });

    expect(screen.getByRole("heading", { name: "Review summary" })).toBeInTheDocument();
    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(screen.getByRole("table")).toHaveTextContent("ChatReady");
    expect(screen.getByText("const gilded = true;")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Documentation" })).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("link", { name: "Documentation" })).toHaveAttribute("rel", "noreferrer noopener");
    expect(document.querySelector("script")).not.toBeInTheDocument();
    expect(screen.getByText("<script>alert('unsafe')</script>")).toBeInTheDocument();
  });

  it("renders accessible session tabs and allows switching while another session runs", () => {
    const props = renderPanel();

    expect(screen.getByRole("tablist", { name: "Codex sessions" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Review app.*running/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /Fix tests.*ready/i })).toHaveAttribute("aria-selected", "false");
    fireEvent.click(screen.getByRole("tab", { name: /Fix tests.*ready/i }));
    expect(props.onSelectSession).toHaveBeenCalledWith("s2");

    fireEvent.click(screen.getByRole("button", { name: "New Codex session" }));
    expect(props.onNewSession).toHaveBeenCalledOnce();
  });

  it("keeps the active running session read-only and stops only that session", async () => {
    const props = renderPanel();

    expect(screen.getByRole("textbox", { name: "Message Codex" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Stop Codex" }));
    await waitFor(() => expect(props.onStop).toHaveBeenCalledWith("s1"));
  });

  it("renders a scoped approval card and returns the selected decision", async () => {
    const props = renderPanel({
      approvals: [{
        id: "approval-1",
        type: "command",
        title: "Command requires approval",
        command: "touch /Users/test/outside.txt",
        cwd: "/Users/test/project",
        reason: "Write outside the workspace?",
      }],
    });

    expect(screen.getByRole("region", { name: "Command requires approval" })).toHaveTextContent("touch /Users/test/outside.txt");
    expect(screen.getByText("Write outside the workspace?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Allow once" }));
    await waitFor(() => expect(props.onRespondToApproval).toHaveBeenCalledWith("approval-1", "accept"));
  });

  it("renders Guardian denials as action-specific approvals", async () => {
    const props = renderPanel({
      approvals: [{
        id: "guardian:1",
        type: "guardian-denial",
        title: "Guardian review requires approval",
        command: "git push --force origin main",
        cwd: "/tmp/project",
        reason: "Would rewrite a protected branch.",
        riskLevel: "high",
      }],
    });

    expect(screen.getByRole("region", { name: "Guardian review requires approval" })).toHaveTextContent("high risk");
    expect(screen.queryByRole("button", { name: "Allow for session" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Allow once" }));
    await waitFor(() => expect(props.onRespondToApproval).toHaveBeenCalledWith("guardian:1", "accept"));
  });

  it("controls per-session drafts without rendering a model picker", async () => {
    const props = renderPanel({ activeSessionId: "s2", attachments: [], draft: "second draft", isRunning: false, status: "ready" });
    const composer = screen.getByRole("textbox", { name: "Message Codex" });

    expect(composer).toHaveValue("second draft");
    fireEvent.change(composer, { target: { value: "updated draft" } });
    expect(props.onDraftChange).toHaveBeenCalledWith("updated draft");
    expect(screen.queryByRole("button", { name: "default" })).not.toBeInTheDocument();
    expect(screen.queryByText("gpt-5.2")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(props.onSubmit).toHaveBeenCalledWith("second draft"));
  });

  it("opens the native attachment picker without requiring an active editor file", async () => {
    const props = renderPanel({ isRunning: false, status: "ready" });

    fireEvent.click(screen.getByRole("button", { name: "Attach files" }));
    await waitFor(() => expect(props.onPickAttachments).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "Remove src/App.tsx" }));
    expect(props.onRemoveAttachment).toHaveBeenCalledWith("src/App.tsx");
  });

  it("disables deletion only for running sessions", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Session actions" }));

    expect(screen.getByRole("button", { name: "Delete Review app" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete Fix tests" })).toBeEnabled();
  });

  it("closes session tabs without deleting them and reopens recent sessions", () => {
    const closedSession = { ...sessions[1], id: "s3", title: "Closed research", closedAt: "2026-01-03" };
    const props = renderPanel({ recentSessions: [closedSession] });

    fireEvent.click(screen.getByRole("button", { name: "Close Review app" }));
    expect(props.onCloseSession).toHaveBeenCalledWith("s1");
    expect(props.onDeleteSession).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Session actions" }));
    fireEvent.click(screen.getByRole("button", { name: "Reopen Closed research" }));
    expect(props.onReopenSession).toHaveBeenCalledWith("s3");
  });

  it("opens slash commands and supports keyboard navigation", async () => {
    const props = renderPanel({ attachments: [], draft: "/", isRunning: false, status: "ready" });
    const composer = screen.getByRole("textbox", { name: "Message Codex" });

    expect(screen.getByRole("listbox", { name: "Codex commands" })).toBeInTheDocument();
    fireEvent.keyDown(composer, { key: "ArrowDown" });
    fireEvent.keyDown(composer, { key: "Enter" });

    await waitFor(() => expect(props.onLoadGoal).toHaveBeenCalledOnce());
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it("dismisses slash commands with Escape without clearing the draft", () => {
    const props = renderPanel({ attachments: [], draft: "/go", isRunning: false, status: "ready" });
    const composer = screen.getByRole("textbox", { name: "Message Codex" });

    expect(screen.getByRole("listbox", { name: "Codex commands" })).toBeInTheDocument();
    fireEvent.keyDown(composer, { key: "Escape" });

    expect(screen.queryByRole("listbox", { name: "Codex commands" })).not.toBeInTheDocument();
    expect(props.onDraftChange).not.toHaveBeenCalledWith("");
  });

  it("dismisses slash commands when clicking outside and reopens after editing", () => {
    const props = renderPanel({ attachments: [], draft: "/go", isRunning: false, status: "ready" });
    const composer = screen.getByRole("textbox", { name: "Message Codex" });

    fireEvent.mouseDown(screen.getByRole("heading", { name: "Review app" }));
    expect(screen.queryByRole("listbox", { name: "Codex commands" })).not.toBeInTheDocument();

    fireEvent.change(composer, { target: { value: "/goal" } });
    expect(props.onDraftChange).toHaveBeenCalledWith("/goal");
    expect(screen.getByRole("listbox", { name: "Codex commands" })).toBeInTheDocument();
  });

  it("searches slash commands by command, title, and description", () => {
    renderPanel({ attachments: [], draft: "/browse", isRunning: false, status: "ready" });

    expect(screen.getByRole("option", { name: /skills.*browse native codex skills/i })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /close session/i })).not.toBeInTheDocument();
  });

  it("inserts slash commands that require arguments instead of executing them immediately", () => {
    const props = renderPanel({ attachments: [], draft: "/set", isRunning: false, status: "ready" });

    fireEvent.click(screen.getByRole("option", { name: /goal set/i }));

    expect(props.onDraftChange).toHaveBeenCalledWith("/goal set ");
    expect(props.onSetGoal).not.toHaveBeenCalled();
  });

  it("keeps slash commands dismissed while entering command arguments", () => {
    renderPanel({ attachments: [], draft: "/goal set a session goal", isRunning: false, status: "ready" });

    expect(screen.queryByRole("listbox", { name: "Codex commands" })).not.toBeInTheDocument();
  });

  it("executes local slash commands and closes the active session", async () => {
    const props = renderPanel({ attachments: [], draft: "/close", isRunning: false, status: "ready" });

    fireEvent.keyDown(screen.getByRole("textbox", { name: "Message Codex" }), { key: "Enter" });

    await waitFor(() => expect(props.onCloseSession).toHaveBeenCalledWith("s1"));
    expect(props.onDraftChange).toHaveBeenCalledWith("");
  });

  it("loads native skills and adds removable skill chips", async () => {
    const skill = {
      name: "review",
      description: "Review changes",
      path: "/skills/review/SKILL.md",
      scope: "user" as const,
      enabled: true,
    };
    const props = renderPanel({
      attachments: [],
      draft: "/skills",
      isRunning: false,
      status: "ready",
      onListSkills: vi.fn().mockResolvedValue([skill]),
    });
    const composer = screen.getByRole("textbox", { name: "Message Codex" });

    fireEvent.keyDown(composer, { key: "Enter" });
    await waitFor(() => expect(screen.getByRole("option", { name: /review/i })).toBeInTheDocument());
    fireEvent.keyDown(composer, { key: "Escape" });
    expect(screen.queryByRole("option", { name: /review/i })).not.toBeInTheDocument();
    expect(props.onDraftChange).not.toHaveBeenCalledWith("");

    fireEvent.change(composer, { target: { value: "/skills" } });
    fireEvent.keyDown(composer, { key: "Enter" });
    await waitFor(() => expect(screen.getByRole("option", { name: /review/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("option", { name: /review/i }));
    expect(props.onAddSkill).toHaveBeenCalledWith(skill);

    const selectedProps = renderPanel({ attachments: [], selectedSkills: [skill], isRunning: false, status: "ready" });
    fireEvent.click(screen.getAllByRole("button", { name: "Remove skill review" }).at(-1)!);
    expect(selectedProps.onRemoveSkill).toHaveBeenCalledWith(skill.path);
  });

  it("sets and clears native goals through slash commands", async () => {
    const setProps = renderPanel({ attachments: [], draft: "/goal set Ship the release", isRunning: false, status: "ready" });
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Message Codex" }), { key: "Enter" });
    await waitFor(() => expect(setProps.onSetGoal).toHaveBeenCalledWith("Ship the release"));

    const clearProps = renderPanel({ attachments: [], draft: "/goal clear", isRunning: false, status: "ready" });
    fireEvent.keyDown(screen.getAllByRole("textbox", { name: "Message Codex" }).at(-1)!, { key: "Enter" });
    await waitFor(() => expect(clearProps.onClearGoal).toHaveBeenCalledOnce());
  });

  it("requires an open workspace before creating sessions or composing", () => {
    renderPanel({
      activeSessionId: "",
      attachments: [],
      draft: "",
      isRunning: false,
      messages: [],
      sessions: [],
      status: "ready",
      workspaceOpen: false,
    });

    expect(screen.getByText("Open a workspace before starting a Codex session.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Message Codex" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Attach files" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "New Codex session" })).toBeDisabled();
  });
});
