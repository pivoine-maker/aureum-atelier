import { execFileSync } from "node:child_process";

const file = process.argv[2] ?? "build/icon.iconset/icon_512x512.png";
const magick = process.env.MAGICK_BIN ?? "magick";
const dimensions = execFileSync(magick, ["identify", "-format", "%w %h", file], { encoding: "utf8" }).trim().split(" ").map(Number);
const [width, height] = dimensions;
const coordinates = [`0,0`, `${width - 1},0`, `0,${height - 1}`, `${width - 1},${height - 1}`];

for (const coordinate of coordinates) {
  const alpha = execFileSync(magick, [file, "-format", `%[fx:p{${coordinate}}.a]`, "info:"], { encoding: "utf8" }).trim();
  if (Number(alpha) !== 0) throw new Error(`${file} corner ${coordinate} has alpha ${alpha}; expected 0`);
}
