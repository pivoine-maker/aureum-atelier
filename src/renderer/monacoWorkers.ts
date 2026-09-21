export type MonacoWorkerKind = "editor" | "json" | "css" | "html" | "typescript";

export function getMonacoWorkerKind(label: string): MonacoWorkerKind {
  if (label === "json") return "json";
  if (["css", "scss", "less"].includes(label)) return "css";
  if (["html", "handlebars", "razor"].includes(label)) return "html";
  if (["typescript", "javascript"].includes(label)) return "typescript";
  return "editor";
}
