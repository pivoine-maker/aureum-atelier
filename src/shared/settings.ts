import { z } from "zod";

import { themeModes, type ThemeMode } from "./theme";

export const SettingsSchema = z.object({
  themeMode: z.enum(themeModes).catch("atelier"),
  backgroundIntensity: z.number().catch(42).transform((value) => Math.min(100, Math.max(0, Math.round(value)))),
  rotationSalt: z.string().min(1).catch("aureum-atelier"),
  enabledMovements: z
    .array(z.enum(["classicism", "neoclassicism", "baroque", "romanticism"]))
    .min(1)
    .catch(["classicism", "neoclassicism", "baroque", "romanticism"]),
  skippedArtworkIds: z.array(z.string()).catch([]),
  favoriteArtworkIds: z.array(z.string()).catch([]),
  maxLuminance: z.number().min(0).max(1).catch(0.78),
});

export type AureumSettings = z.infer<typeof SettingsSchema> & {
  themeMode: ThemeMode;
};

export type AureumSettingsUpdate = Partial<AureumSettings>;

export const defaultSettings: AureumSettings = SettingsSchema.parse({});

export function parseSettings(input: unknown): AureumSettings {
  return SettingsSchema.parse(input);
}
