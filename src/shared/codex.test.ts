import { describe, expect, it } from "vitest";

import { parseCodexJsonLine } from "./codex";

describe("parseCodexJsonLine", () => {
  it("keeps raw assistant message deltas", () => {
    expect(parseCodexJsonLine('{"type":"agent_message_delta","delta":"hello"}')).toEqual({
      kind: "assistant-delta",
      text: "hello",
    });
  });

  it("extracts assistant text from final messages", () => {
    expect(parseCodexJsonLine('{"type":"agent_message","message":"done"}')).toEqual({
      kind: "assistant-message",
      text: "done",
    });
    expect(parseCodexJsonLine('{"type":"item.completed","item":{"type":"agent_message","text":"OK"}}')).toEqual({
      kind: "assistant-message",
      text: "OK",
    });
  });

  it("summarizes tool and command events", () => {
    expect(parseCodexJsonLine('{"type":"exec_command_begin","cmd":"npm test"}')).toEqual({
      kind: "tool-event",
      title: "exec_command_begin",
      detail: "npm test",
    });
  });

  it("marks malformed lines as raw events", () => {
    expect(parseCodexJsonLine('not json')).toEqual({
      kind: "raw",
      text: "not json",
    });
  });

  it("extracts nested Codex CLI failure details", () => {
    expect(parseCodexJsonLine('{"type":"turn.failed","error":{"message":"Missing environment variable: `LITELLM_PROXY_API_KEY`."}}')).toEqual({
      kind: "status",
      status: "failed",
      detail: "Missing environment variable: `LITELLM_PROXY_API_KEY`.",
    });
  });

  it("hides lifecycle and warning noise from the chat thread", () => {
    expect(parseCodexJsonLine('{"type":"thread.started","thread_id":"thread-1"}')).toEqual({
      kind: "thread-started",
      threadId: "thread-1",
    });
    expect(parseCodexJsonLine('{"type":"item.completed","item":{"type":"error","message":"metadata warning"}}')).toBeNull();
  });
});
