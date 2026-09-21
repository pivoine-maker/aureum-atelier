import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { SettingsStore } from "./settingsStore";

describe("SettingsStore", () => {
  it("persists validated settings and restores them", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aureum-settings-"));
    const path = join(directory, "settings.json");
    const store = new SettingsStore(path);

    const saved = await store.save({
      themeMode: "gallery",
      backgroundIntensity: 73,
      enabledMovements: ["baroque", "romanticism"],
    });

    expect(saved.themeMode).toBe("gallery");
    expect(saved.backgroundIntensity).toBe(73);
    await expect(new SettingsStore(path).load()).resolves.toEqual(saved);
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual(saved);
  });

  it("falls back safely when the settings file is invalid", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aureum-settings-"));
    const store = new SettingsStore(join(directory, "missing.json"));

    await expect(store.load()).resolves.toMatchObject({ themeMode: "atelier", backgroundIntensity: 42 });
  });
});
