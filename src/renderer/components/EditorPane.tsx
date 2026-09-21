import Editor from "@monaco-editor/react";
import { Braces, Check, Eye, FileCode2, Image, Pencil, Save, Sparkles, X } from "lucide-react";
import { Fragment, useEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from "react";

import type { WorkspaceFile } from "../../shared/workspace";
import { terminalHeightLimits, useTerminalLayout } from "../layout/useTerminalLayout";
import { TerminalResizeHandle } from "./TerminalResizeHandle";
import { TerminalPanel } from "./TerminalPanel";

type EditorPaneProps = {
  activeFile: WorkspaceFile | null;
  activePath: string | null;
  openFiles: WorkspaceFile[];
  dirtyPaths: Set<string>;
  isBusy: boolean;
  onActivateFile: (path: string) => void;
  onChange: (content: string) => void;
  onCloseFile: (path: string) => void;
  onSave: () => void;
  onOpenWorkspace: () => void;
  onClosePanel?: () => void;
  hidden?: boolean;
};

export function EditorPane({
  activeFile,
  activePath,
  openFiles,
  dirtyPaths,
  isBusy,
  onActivateFile,
  onChange,
  onCloseFile,
  onSave,
  onOpenWorkspace,
  onClosePanel = () => undefined,
  hidden = false,
}: EditorPaneProps) {
  const [previewMarkdown, setPreviewMarkdown] = useState(false);
  const [maximumTerminalHeight, setMaximumTerminalHeight] = useState<number>(terminalHeightLimits.max);
  const contentStackRef = useRef<HTMLDivElement | null>(null);
  const terminalLayout = useTerminalLayout();
  const terminalHeight = Math.min(terminalLayout.height, maximumTerminalHeight);

  useEffect(() => {
    setPreviewMarkdown(false);
  }, [activePath]);

  useEffect(() => {
    const contentStack = contentStackRef.current;
    if (!contentStack) return;
    const updateMaximumHeight = () => {
      const availableHeight = contentStack.getBoundingClientRect().height - 166;
      setMaximumTerminalHeight(Math.min(
        terminalHeightLimits.max,
        Math.max(terminalHeightLimits.min, Math.floor(availableHeight)),
      ));
    };
    const resizeObserver = new ResizeObserver(updateMaximumHeight);
    resizeObserver.observe(contentStack);
    updateMaximumHeight();
    return () => resizeObserver.disconnect();
  }, []);

  return (
    <section aria-hidden={hidden} aria-label="Editor workspace" className="editor-workspace aureum-panel" hidden={hidden} id="editor-panel">
      <div className="editor-tabs" role="tablist" aria-label="Open files">
        {openFiles.length > 0 ? openFiles.map((file) => {
          const active = file.path === activePath;
          const dirty = dirtyPaths.has(file.path);
          return (
            <div
              aria-selected={active}
              className={`editor-tab${active ? " editor-tab--active" : ""}`}
              key={file.path}
              onClick={() => onActivateFile(file.path)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") onActivateFile(file.path);
              }}
              role="tab"
              tabIndex={active ? 0 : -1}
              title={file.path}
            >
              {file.kind === "image" ? <Image size={13} /> : <Braces size={13} />}
              <span>{file.path.split("/").at(-1)}</span>
              {dirty ? <span aria-label="Unsaved" className="editor-tab__dot" /> : <Check size={12} />}
              <button
                aria-label={`Close ${file.path.split("/").at(-1)}`}
                className="editor-tab__close"
                onClick={(event) => {
                  event.stopPropagation();
                  onCloseFile(file.path);
                }}
                type="button"
              >
                <X size={11} />
              </button>
            </div>
          );
        }) : (
          <div className="editor-tab editor-tab--active" role="tab" aria-selected="true">
            <Sparkles size={13} />
            <span>Welcome</span>
          </div>
        )}

        <span className="editor-tabs__spacer" />
        {activeFile?.kind === "markdown" ? (
          <button
            aria-label={previewMarkdown ? "Edit Markdown" : "Preview Markdown"}
            className="aureum-small-button"
            onClick={() => setPreviewMarkdown((current) => !current)}
            type="button"
          >
            {previewMarkdown ? <Pencil size={13} /> : <Eye size={13} />}
            {previewMarkdown ? "Edit" : "Preview"}
          </button>
        ) : null}
        <button
          className="aureum-small-button"
          disabled={!activeFile || activeFile.kind === "image" || !dirtyPaths.has(activeFile.path) || isBusy}
          onClick={onSave}
          type="button"
        >
          <Save size={13} />
          Save
        </button>
        <button aria-label="Close Editor panel" className="icon-button panel-close-button" onClick={onClosePanel} type="button">
          <X size={13} />
        </button>
      </div>

      <div className="breadcrumbs">
        {activeFile ? activeFile.path.split("/").map((segment, index, segments) => (
          <span key={`${segment}-${index}`}>
            {segment}{index < segments.length - 1 ? " /" : ""}
          </span>
        )) : <span>No file selected</span>}
      </div>

      <div
        className="editor-content-stack"
        ref={contentStackRef}
        style={{ "--terminal-height": `${terminalHeight}px` } as CSSProperties}
      >
        <div className="monaco-host">
          {activeFile?.kind === "image" ? (
            <div className="image-preview">
              <img alt={activeFile.path.split("/").at(-1)} src={activeFile.content} />
              <span>{activeFile.mimeType ?? "image"}</span>
            </div>
          ) : activeFile?.kind === "markdown" && previewMarkdown ? (
            <MarkdownPreview content={activeFile.content} />
          ) : activeFile ? (
            <Editor
              height="100%"
              language={activeFile.language}
              onChange={(value) => onChange(value ?? "")}
              options={{
                fontFamily: "JetBrains Mono, SFMono-Regular, monospace",
                fontSize: 12,
                lineHeight: 20,
                minimap: { enabled: true },
                renderLineHighlight: "all",
                scrollBeyondLastLine: false,
                smoothScrolling: true,
                wordWrap: "on",
              }}
              path={activeFile.path}
              theme="vs-dark"
              value={activeFile.content}
            />
          ) : (
            <div className="empty-editor">
              <span className="empty-editor__icon"><FileCode2 size={28} /></span>
              <h2>Open a workspace to begin</h2>
              <p>Browse files, edit source, and prepare this atelier for Codex-powered development.</p>
              <button className="aureum-primary-button" onClick={onOpenWorkspace} type="button">
                Open Workspace
              </button>
            </div>
          )}
        </div>
        <TerminalResizeHandle
          max={maximumTerminalHeight}
          min={terminalHeightLimits.min}
          onReset={terminalLayout.reset}
          onResize={(height) => terminalLayout.resize(Math.min(height, maximumTerminalHeight))}
          value={terminalHeight}
        />
        <TerminalPanel />
      </div>
    </section>
  );
}

function MarkdownPreview({ content }: { content: string }) {
  const blocks: ReactNode[] = [];
  let listItems: string[] = [];
  let codeLines: string[] = [];
  let inCode = false;

  const flushList = () => {
    if (listItems.length === 0) return;
    const items = listItems;
    listItems = [];
    blocks.push(<ul key={`list-${blocks.length}`}>{items.map((item, index) => <li key={`${item}-${index}`}>{renderInline(item)}</li>)}</ul>);
  };
  const flushCode = () => {
    if (codeLines.length === 0) return;
    const code = codeLines.join("\n");
    codeLines = [];
    blocks.push(<pre key={`code-${blocks.length}`}><code>{code}</code></pre>);
  };

  for (const line of content.split("\n")) {
    if (line.trim().startsWith("```")) {
      if (inCode) flushCode();
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      codeLines.push(line);
      continue;
    }
    const listMatch = /^\s*[-*+]\s+(.+)$/.exec(line);
    if (listMatch) {
      listItems.push(listMatch[1]);
      continue;
    }
    flushList();
    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(line);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const Heading = `h${level}` as ElementType;
      blocks.push(<Heading key={`heading-${blocks.length}`}>{renderInline(headingMatch[2])}</Heading>);
    } else if (line.trim()) {
      blocks.push(<p key={`paragraph-${blocks.length}`}>{renderInline(line.trim())}</p>);
    }
  }
  flushList();
  flushCode();

  return <article className="markdown-preview">{blocks}</article>;
}

function renderInline(text: string): ReactNode {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) return <code key={`${part}-${index}`}>{part.slice(1, -1)}</code>;
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>;
    return <Fragment key={`${part}-${index}`}>{part}</Fragment>;
  });
}
