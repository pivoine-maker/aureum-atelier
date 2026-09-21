import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { ChevronDown, Command, FileCode2, History, PanelLeftClose, Search, Sparkles } from "lucide-react";

import { fallbackArtworks, pickDailyArtwork, pickNextArtwork, type Artwork } from "../shared/artwork";
import { defaultSettings, type AureumSettings, type AureumSettingsUpdate } from "../shared/settings";
import { themeModeLabels, themeModes, type ThemeMode } from "../shared/theme";
import { ArtworkBackdrop } from "./components/ArtworkBackdrop";
import { CodexPanel } from "./components/CodexPanel";
import { CommandPalette, type PaletteCommand } from "./components/CommandPalette";
import { EditorPane } from "./components/EditorPane";
import { PanelResizeHandle } from "./components/PanelResizeHandle";
import { SettingsPanel } from "./components/SettingsPanel";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import { useCodex } from "./codex/useCodex";
import { useDailyArtworkRotation } from "./artwork/useDailyArtworkRotation";
import { useGitStatus } from "./git/useGitStatus";
import { panelWidthLimits, usePanelLayout } from "./layout/usePanelLayout";
import { useWorkspace } from "./workspace/useWorkspace";

type WorkbenchPanel = "explorer" | "editor" | "codex";

function artworkPreferencesFromSettings(settings: AureumSettings) {
  return {
    enabledMovements: settings.enabledMovements,
    skippedArtworkIds: settings.skippedArtworkIds,
    maxLuminance: settings.maxLuminance,
    rotationSalt: settings.rotationSalt,
  };
}

export function App() {
  const [settings, setSettings] = useState<AureumSettings>(defaultSettings);
  const [artwork, setArtwork] = useState<Artwork>(fallbackArtworks[0]);
  const [artworkHistory, setArtworkHistory] = useState<Artwork[]>([fallbackArtworks[0]]);
  const [panelVisibility, setPanelVisibility] = useState<Record<WorkbenchPanel, boolean>>({
    explorer: true,
    editor: true,
    codex: true,
  });
  const [notice, setNotice] = useState<string | null>(null);
  const [titlebarSearchFocused, setTitlebarSearchFocused] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [recentMenuOpen, setRecentMenuOpen] = useState(false);
  const titlebarSearchRef = useRef<HTMLInputElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const noticeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const workspace = useWorkspace();
  const codex = useCodex(workspace.rootPath, workspace.rootName);
  const git = useGitStatus(workspace.rootPath);
  const panelLayout = usePanelLayout();

  useEffect(() => {
    if (!window.aureum) return;

    void window.aureum.settings.getInitial().then(async (initialSettings) => {
      const preferences = artworkPreferencesFromSettings(initialSettings);
      const dailyArtwork = await window.aureum.artwork.getToday(preferences);
      setSettings(initialSettings);
      setArtwork(dailyArtwork);
    });
  }, []);

  const updateSettings = useCallback((update: AureumSettingsUpdate) => {
    setSettings((current) => ({ ...current, ...update }));
    void window.aureum.settings.update(update)
      .then(setSettings)
      .catch(() => showNotice("Could not save settings"));
  }, []);

  const setThemeMode = (themeMode: ThemeMode) => updateSettings({ themeMode });

  const artworkPreferences = artworkPreferencesFromSettings(settings);

  const selectArtwork = useCallback((nextArtwork: Artwork) => {
    setArtwork(nextArtwork);
    setArtworkHistory((current) => [nextArtwork, ...current.filter((entry) => entry.id !== nextArtwork.id)].slice(0, 12));
  }, []);

  useDailyArtworkRotation(artwork, artworkPreferences, selectArtwork);

  const nextArtwork = useCallback(() => {
    selectArtwork(pickNextArtwork(artwork.id, fallbackArtworks, artworkPreferences));
  }, [artwork.id, artworkPreferences.enabledMovements, artworkPreferences.maxLuminance, artworkPreferences.rotationSalt, artworkPreferences.skippedArtworkIds, selectArtwork]);

  const toggleFavoriteArtwork = useCallback(() => {
    const favoriteArtworkIds = settings.favoriteArtworkIds.includes(artwork.id)
      ? settings.favoriteArtworkIds.filter((id) => id !== artwork.id)
      : [...settings.favoriteArtworkIds, artwork.id];
    updateSettings({ favoriteArtworkIds });
  }, [artwork.id, settings.favoriteArtworkIds, updateSettings]);

  const skipArtwork = useCallback(() => {
    const skippedArtworkIds = [...new Set([...settings.skippedArtworkIds, artwork.id])];
    updateSettings({ skippedArtworkIds });
    selectArtwork(pickNextArtwork(artwork.id, fallbackArtworks, { ...artworkPreferences, skippedArtworkIds }));
  }, [artwork.id, artworkPreferences, selectArtwork, settings.skippedArtworkIds, updateSettings]);

  useEffect(() => {
    const remainsEligible = settings.enabledMovements.includes(artwork.movement)
      && !settings.skippedArtworkIds.includes(artwork.id)
      && artwork.luminanceScore <= settings.maxLuminance;
    if (!remainsEligible) selectArtwork(pickDailyArtwork(new Date(), fallbackArtworks, artworkPreferences));
  }, [artwork, artworkPreferences, selectArtwork, settings.enabledMovements, settings.maxLuminance, settings.skippedArtworkIds]);

  const setPanelVisible = useCallback((panel: WorkbenchPanel, visible: boolean) => {
    setPanelVisibility((current) => current[panel] === visible ? current : { ...current, [panel]: visible });
  }, []);

  const togglePanel = useCallback((panel: WorkbenchPanel) => {
    setPanelVisibility((current) => ({ ...current, [panel]: !current[panel] }));
  }, []);

  const focusCodexComposer = useCallback(() => {
    setPanelVisible("codex", true);
    window.setTimeout(() => composerRef.current?.focus());
  }, [setPanelVisible]);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimeoutRef.current) clearTimeout(noticeTimeoutRef.current);
    noticeTimeoutRef.current = setTimeout(() => setNotice(null), 2_400);
  }, []);

  const runWorkspaceSearch = useCallback((query: string) => {
    void workspace.search(query);
  }, [workspace]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        titlebarSearchRef.current?.focus();
      }
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        setCommandPaletteOpen(true);
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void workspace.saveActiveFile();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
        event.preventDefault();
        togglePanel("explorer");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (noticeTimeoutRef.current) clearTimeout(noticeTimeoutRef.current);
    };
  }, [focusCodexComposer, togglePanel, workspace.saveActiveFile]);

  const paletteCommands: PaletteCommand[] = [
    { id: "open-workspace", label: "Open workspace", detail: "Choose a local project folder", shortcut: "⌘O", run: () => void workspace.openWorkspace() },
    { id: "save-file", label: "Save active file", detail: workspace.activeFile?.path ?? "No file selected", shortcut: "⌘S", run: () => void workspace.saveActiveFile() },
    { id: "find-files", label: "Search workspace", detail: "Find file names and content", shortcut: "⌘K", run: () => titlebarSearchRef.current?.focus() },
    { id: "focus-codex", label: "Focus Codex composer", detail: "Continue the current AI task", run: focusCodexComposer },
    { id: "open-settings", label: "Open settings", detail: "Theme, artwork, and focus preferences", run: () => setSettingsOpen(true) },
  ];

  const appStyle = {
    "--background-intensity": String(settings.backgroundIntensity / 100),
    "--explorer-width": `${panelLayout.layout.explorerWidth}px`,
    "--codex-width": `${panelLayout.layout.codexWidth}px`,
  } as CSSProperties;

  const allWorkbenchPanelsHidden = !panelVisibility.explorer && !panelVisibility.editor && !panelVisibility.codex;
  const visiblePanelCount = Object.values(panelVisibility).filter(Boolean).length;
  const visibilityClasses = [
    !panelVisibility.explorer && "panel-explorer-hidden",
    !panelVisibility.editor && "panel-editor-hidden",
    !panelVisibility.codex && "panel-codex-hidden",
    allWorkbenchPanelsHidden && "workbench-panels-hidden",
    visiblePanelCount === 1 && panelVisibility.explorer && "panel-only-explorer",
    visiblePanelCount === 1 && panelVisibility.editor && "panel-only-editor",
    visiblePanelCount === 1 && panelVisibility.codex && "panel-only-codex",
  ].filter(Boolean).join(" ");

  return (
    <div
      className={`aureum-app theme-${settings.themeMode}${visibilityClasses ? ` ${visibilityClasses}` : ""}`}
      data-testid="aureum-app"
      data-theme={settings.themeMode}
      style={appStyle}
    >
      <ArtworkBackdrop
        artwork={artwork}
        intensity={settings.backgroundIntensity}
        mode={settings.themeMode}
      />

      <header className="titlebar aureum-panel">
        <div className="brand">
          <span className="brand__mark"><Sparkles size={14} /></span>
          <div>
            <h1>Aureum Atelier</h1>
            <span>Codex Workspace</span>
          </div>
        </div>
        <button
          aria-label="Toggle sidebar"
          aria-pressed={panelVisibility.explorer}
          className="icon-button titlebar__sidebar-toggle"
          onClick={() => togglePanel("explorer")}
          type="button"
        >
          <PanelLeftClose size={15} />
        </button>

        <label className="command-palette">
          <Search size={13} />
          <input
            aria-label="Search files or ask Codex"
            ref={titlebarSearchRef}
            onChange={(event) => runWorkspaceSearch(event.target.value)}
            onClick={(event) => event.stopPropagation()}
            onFocus={() => setTitlebarSearchFocused(true)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                focusCodexComposer();
              }
            }}
            onBlur={() => setTimeout(() => setTitlebarSearchFocused(false), 160)}
            placeholder={workspace.rootName ? "Search files or ask Codex…" : "Open a workspace, then search files…"}
            type="search"
            value={workspace.searchQuery}
          />
          <kbd><Command size={11} /> K</kbd>
          {titlebarSearchFocused && workspace.searchResults.length > 0 ? (
            <div className="titlebar-search-results">
              {workspace.searchResults.slice(0, 8).map((result) => (
                <button
                  key={`${result.path}:${result.line}:${result.column}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => void workspace.selectFile(result.path)}
                  type="button"
                >
                  <FileCode2 size={12} />
                  <span>{result.path}</span>
                  <small>{result.line}:{result.column}</small>
                </button>
              ))}
            </div>
          ) : null}
        </label>

        <div className="mode-switcher" aria-label="Visual mode">
          {themeModes.map((mode) => (
            <button
              aria-pressed={settings.themeMode === mode}
              className={settings.themeMode === mode ? "mode-switcher__button mode-switcher__button--active" : "mode-switcher__button"}
              key={mode}
              onClick={() => setThemeMode(mode)}
              type="button"
            >
              {themeModeLabels[mode]}
            </button>
          ))}
        </div>

        <div className="workspace-picker-wrap">
          <button aria-label="Open workspace" className="workspace-picker" onClick={() => void workspace.openWorkspace()} type="button">
            <span className="workspace-picker__crest">AA</span>
            <span>{workspace.rootName ?? "Open workspace"}</span>
          </button>
          <button
            aria-expanded={recentMenuOpen}
            aria-label="Recent workspaces"
            className="workspace-picker__recent"
            onClick={() => setRecentMenuOpen((current) => !current)}
            type="button"
          >
            <ChevronDown size={12} />
          </button>
          {recentMenuOpen ? (
            <div className="recent-workspaces">
              <div><History size={12} /> Recent workspaces</div>
              {workspace.recentWorkspaces.length > 0 ? workspace.recentWorkspaces.map((entry) => (
                <button key={entry.root} onClick={() => { setRecentMenuOpen(false); void workspace.openRecentWorkspace(entry.root); }} title={entry.root} type="button">
                  <strong>{entry.name}</strong><span>{entry.root}</span>
                </button>
              )) : <span className="recent-workspaces__empty">No recent workspaces yet</span>}
            </div>
          ) : null}
        </div>
      </header>

      <main className="workbench">
        <Sidebar
          activePath={workspace.activeFile?.path ?? null}
          codexVisible={panelVisibility.codex}
          editorVisible={panelVisibility.editor}
          explorerVisible={panelVisibility.explorer}
          onOpenWorkspace={workspace.openWorkspace}
          onSearch={workspace.search}
          onSelectFile={workspace.selectFile}
          onExpandDirectory={workspace.expandDirectory}
          loadingDirectoryPaths={workspace.loadingDirectoryPaths}
          rootName={workspace.rootName}
          rootPath={workspace.rootPath}
          searchQuery={workspace.searchQuery}
          searchResults={workspace.searchResults}
          tree={workspace.tree}
          onCloseExplorer={() => setPanelVisible("explorer", false)}
          onShowExplorer={() => setPanelVisible("explorer", true)}
          onToggleCodex={() => panelVisibility.codex ? setPanelVisible("codex", false) : focusCodexComposer()}
          onToggleEditor={() => togglePanel("editor")}
          onToggleExplorer={() => togglePanel("explorer")}
          onOpenSettings={() => setSettingsOpen(true)}
          gitStatus={git.status}
          onRefreshGit={git.refresh}
          onNotice={showNotice}
        />
        <PanelResizeHandle
          ariaLabel="Resize Explorer panel"
          className="panel-resize-handle--explorer"
          direction={1}
          max={panelWidthLimits.explorer.max}
          min={panelWidthLimits.explorer.min}
          onReset={() => panelLayout.resetPanel("explorer")}
          onResize={(width) => panelLayout.resizePanel("explorer", width)}
          value={panelLayout.layout.explorerWidth}
        />
        <EditorPane
          activeFile={workspace.activeFile}
          activePath={workspace.activePath}
          dirtyPaths={workspace.dirtyPaths}
          isBusy={workspace.isBusy}
          hidden={!panelVisibility.editor}
          onActivateFile={workspace.activateFile}
          onChange={workspace.updateActiveContent}
          onCloseFile={workspace.closeFile}
          onOpenWorkspace={workspace.openWorkspace}
          onClosePanel={() => setPanelVisible("editor", false)}
          onSave={workspace.saveActiveFile}
          openFiles={workspace.openFiles}
        />
        <PanelResizeHandle
          ariaLabel="Resize Codex panel"
          className="panel-resize-handle--codex"
          direction={-1}
          max={panelWidthLimits.codex.max}
          min={panelWidthLimits.codex.min}
          onReset={() => panelLayout.resetPanel("codex")}
          onResize={(width) => panelLayout.resizePanel("codex", width)}
          value={panelLayout.layout.codexWidth}
        />
        <CodexPanel
          activeSessionId={codex.activeSessionId}
          activeGoal={codex.activeGoal}
          approvalMode={codex.approvalMode}
          approvals={codex.approvals}
          attachments={codex.attachments}
          error={codex.error}
          gitChanges={git.status.changes}
          hidden={!panelVisibility.codex}
          isRunning={codex.isRunning}
          messages={codex.messages}
          draft={codex.draft}
          runningSessionCount={codex.runningSessionCount}
          status={codex.status}
          workspaceOpen={Boolean(workspace.rootPath)}
          composerRef={composerRef}
          onPickAttachments={codex.pickAttachments}
          onClosePanel={() => setPanelVisible("codex", false)}
          onCloseSession={codex.closeSession}
          onDeleteSession={codex.deleteSession}
          onDraftChange={codex.setDraft}
          onAddSkill={codex.addSkill}
          onClearGoal={codex.clearGoal}
          onListSkills={codex.listSkills}
          onLoadGoal={codex.loadGoal}
          onNewSession={codex.newSession}
          onNotice={showNotice}
          onReopenSession={codex.reopenSession}
          onRemoveAttachment={codex.removeAttachment}
          onRemoveSkill={codex.removeSkill}
          onRespondToApproval={codex.respondToApproval}
          onSelectSession={codex.selectSession}
          onSetGoal={codex.setGoal}
          onStop={codex.stop}
          onSubmit={codex.submitPrompt}
          recentSessions={codex.recentSessions}
          selectedSkills={codex.selectedSkills}
          sessions={codex.sessions}
        />
      </main>

      {notice ? <div aria-live="polite" className="app-notice" role="status">{notice}</div> : null}

      {commandPaletteOpen ? <CommandPalette commands={paletteCommands} onClose={() => setCommandPaletteOpen(false)} /> : null}
      {settingsOpen ? <SettingsPanel onClose={() => setSettingsOpen(false)} onUpdate={updateSettings} settings={settings} /> : null}

      <StatusBar
        artwork={artwork}
        artworkHistory={artworkHistory}
        branch={git.status.branch}
        isFavorite={settings.favoriteArtworkIds.includes(artwork.id)}
        mode={settings.themeMode}
        onFavorite={toggleFavoriteArtwork}
        onNextArtwork={nextArtwork}
        onSelectHistory={selectArtwork}
        onSkipArtwork={skipArtwork}
      />
    </div>
  );
}
