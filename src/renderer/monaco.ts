import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/editor/editor.worker?worker";
import CssWorker from "monaco-editor/language/css/css.worker?worker";
import HtmlWorker from "monaco-editor/language/html/html.worker?worker";
import JsonWorker from "monaco-editor/language/json/json.worker?worker";
import TypeScriptWorker from "monaco-editor/language/typescript/ts.worker?worker";

import { getMonacoWorkerKind } from "./monacoWorkers";

globalThis.MonacoEnvironment = {
  getWorker(_moduleId: string, label: string) {
    const kind = getMonacoWorkerKind(label);
    if (kind === "json") return new JsonWorker();
    if (kind === "css") return new CssWorker();
    if (kind === "html") return new HtmlWorker();
    if (kind === "typescript") return new TypeScriptWorker();
    return new EditorWorker();
  },
};

loader.config({ monaco });
