import { promises as fs } from "node:fs";
import { dirname } from "node:path";

import { defaultSettings, parseSettings, type AureumSettings } from "../../shared/settings";

export class SettingsStore {
  constructor(private readonly path: string) {}

  async load(): Promise<AureumSettings> {
    try {
      return parseSettings(JSON.parse(await fs.readFile(this.path, "utf8")));
    } catch {
      return defaultSettings;
    }
  }

  async save(input: unknown): Promise<AureumSettings> {
    const settings = parseSettings(input);
    await fs.mkdir(dirname(this.path), { recursive: true });
    await fs.writeFile(this.path, JSON.stringify(settings, null, 2), "utf8");
    return settings;
  }
}
