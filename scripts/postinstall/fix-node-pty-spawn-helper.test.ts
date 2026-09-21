import path from "node:path";
import { describe, expect, it, vi } from "vitest";

const { ensureExecutable, findSpawnHelpers } = await import("./fix-node-pty-spawn-helper.cjs");

describe("node-pty spawn-helper postinstall fix", () => {
  it("checks both build and macOS prebuild helper locations", () => {
    expect(findSpawnHelpers("/project")).toEqual([
      path.join("/project", "node_modules", "node-pty", "build", "Release", "spawn-helper"),
      path.join("/project", "node_modules", "node-pty", "prebuilds", "darwin-arm64", "spawn-helper"),
      path.join("/project", "node_modules", "node-pty", "prebuilds", "darwin-x64", "spawn-helper"),
    ]);
  });

  it("adds executable bits when the helper is readable but not executable", () => {
    const fsLike = {
      statSync: vi.fn(() => ({ mode: 0o644 })),
      chmodSync: vi.fn(),
    };

    expect(ensureExecutable("/helper", fsLike)).toBe(true);
    expect(fsLike.chmodSync).toHaveBeenCalledWith("/helper", 0o755);
  });

  it("does not rewrite already executable helpers", () => {
    const fsLike = {
      statSync: vi.fn(() => ({ mode: 0o755 })),
      chmodSync: vi.fn(),
    };

    expect(ensureExecutable("/helper", fsLike)).toBe(false);
    expect(fsLike.chmodSync).not.toHaveBeenCalled();
  });

  it("ignores missing helper files", () => {
    const fsLike = {
      statSync: vi.fn(() => {
        const error = new Error("missing") as NodeJS.ErrnoException;
        error.code = "ENOENT";
        throw error;
      }),
      chmodSync: vi.fn(),
    };

    expect(ensureExecutable("/missing", fsLike)).toBe(false);
    expect(fsLike.chmodSync).not.toHaveBeenCalled();
  });
});
