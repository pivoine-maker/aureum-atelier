import { describe, expect, it } from "vitest";

import { getMonacoWorkerKind } from "./monacoWorkers";

describe("Monaco worker routing", () => {
  it("routes language labels to bundled worker kinds", () => {
    expect(getMonacoWorkerKind("json")).toBe("json");
    expect(getMonacoWorkerKind("css")).toBe("css");
    expect(getMonacoWorkerKind("scss")).toBe("css");
    expect(getMonacoWorkerKind("html")).toBe("html");
    expect(getMonacoWorkerKind("handlebars")).toBe("html");
    expect(getMonacoWorkerKind("typescript")).toBe("typescript");
    expect(getMonacoWorkerKind("javascript")).toBe("typescript");
    expect(getMonacoWorkerKind("plaintext")).toBe("editor");
  });
});
