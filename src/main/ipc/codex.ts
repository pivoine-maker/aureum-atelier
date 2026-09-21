import { app, BrowserWindow, dialog, ipcMain } from "electron";

import type { CodexApprovalResponse, CodexSetGoalRequest, CodexStartRequest, CodexThreadRequest, CodexWorkspaceRequest } from "../../shared/codex";
import { codexChannels } from "../../shared/ipc";
import { supportedAttachmentFilters } from "../codex/attachmentTypes";
import { codexExecService } from "../codex/codexExecService";
import { readCodexAttachments } from "../codex/codexAttachmentService";
import { startCodexRequest } from "../codex/startCodexRequest";
import { workspaceStore } from "../workspace/workspaceStore";

export function registerCodexHandlers(): void {
  ipcMain.removeHandler(codexChannels.start);
  ipcMain.removeHandler(codexChannels.listSkills);
  ipcMain.removeHandler(codexChannels.createThread);
  ipcMain.removeHandler(codexChannels.getGoal);
  ipcMain.removeHandler(codexChannels.setGoal);
  ipcMain.removeHandler(codexChannels.clearGoal);
  ipcMain.removeHandler(codexChannels.stop);
  ipcMain.removeHandler(codexChannels.respondToApproval);
  ipcMain.removeHandler(codexChannels.pickAttachments);

  ipcMain.handle(codexChannels.pickAttachments, async () => {
    const result = await dialog.showOpenDialog({
      title: "Attach files to Codex",
      properties: ["openFile", "multiSelections"],
      filters: supportedAttachmentFilters(),
    });
    if (result.canceled) return { attachments: [], errors: [] };
    return readCodexAttachments(result.filePaths, app.getPath("userData"));
  });

  ipcMain.handle(codexChannels.start, (_event, request: CodexStartRequest) => {
    startCodexRequest(request, workspaceStore.getRoot(), (options) => codexExecService.start(options), (sessionId, codexEvent) => {
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send(codexChannels.event, { sessionId, event: codexEvent });
      }
    });
  });

  ipcMain.handle(codexChannels.listSkills, (_event, request: CodexWorkspaceRequest) => {
    return codexExecService.listSkills(requireActiveWorkspace(request.workspaceRoot));
  });

  ipcMain.handle(codexChannels.createThread, (_event, request: CodexWorkspaceRequest) => {
    return codexExecService.createThread(requireActiveWorkspace(request.workspaceRoot));
  });

  ipcMain.handle(codexChannels.getGoal, (_event, request: CodexThreadRequest) => {
    return codexExecService.getGoal(requireActiveWorkspace(request.workspaceRoot), request.threadId);
  });

  ipcMain.handle(codexChannels.setGoal, (_event, request: CodexSetGoalRequest) => {
    return codexExecService.setGoal(requireActiveWorkspace(request.workspaceRoot), request.threadId, request.objective);
  });

  ipcMain.handle(codexChannels.clearGoal, (_event, request: CodexThreadRequest) => {
    return codexExecService.clearGoal(requireActiveWorkspace(request.workspaceRoot), request.threadId);
  });

  ipcMain.handle(codexChannels.stop, (_event, sessionId: string) => {
    codexExecService.stop(sessionId);
  });

  ipcMain.handle(codexChannels.respondToApproval, (_event, response: CodexApprovalResponse) => {
    codexExecService.respondToApproval(response.sessionId, response.approvalId, response.decision);
  });
}

function requireActiveWorkspace(requestedRoot: string): string {
  const activeRoot = workspaceStore.getRoot();
  if (!activeRoot) throw new Error("Open a workspace before using Codex");
  if (requestedRoot !== activeRoot) throw new Error("Session workspace does not match the active workspace");
  return activeRoot;
}
