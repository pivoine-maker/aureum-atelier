export const themeModes = ["gallery", "atelier", "monastic"] as const;

export type ThemeMode = (typeof themeModes)[number];

export const themeModeLabels: Record<ThemeMode, string> = {
  gallery: "Gallery",
  atelier: "Atelier",
  monastic: "Monastic",
};
