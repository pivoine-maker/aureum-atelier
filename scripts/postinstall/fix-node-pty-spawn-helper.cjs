const fs = require("node:fs");
const path = require("node:path");

function findSpawnHelpers(projectRoot = process.cwd()) {
  return [
    path.join(projectRoot, "node_modules", "node-pty", "build", "Release", "spawn-helper"),
    path.join(projectRoot, "node_modules", "node-pty", "prebuilds", "darwin-arm64", "spawn-helper"),
    path.join(projectRoot, "node_modules", "node-pty", "prebuilds", "darwin-x64", "spawn-helper"),
  ];
}

function ensureExecutable(filePath, fsLike = fs) {
  try {
    const stats = fsLike.statSync(filePath);
    const executableBits = 0o111;
    if ((stats.mode & executableBits) === executableBits) return false;
    fsLike.chmodSync(filePath, stats.mode | executableBits);
    return true;
  } catch (error) {
    if (error && error.code === "ENOENT") return false;
    throw error;
  }
}

function fixNodePtySpawnHelper(projectRoot = process.cwd(), fsLike = fs) {
  if (process.platform !== "darwin") return [];

  return findSpawnHelpers(projectRoot)
    .filter((filePath) => ensureExecutable(filePath, fsLike));
}

if (require.main === module) {
  const fixed = fixNodePtySpawnHelper();
  if (fixed.length > 0) {
    console.log(`Fixed executable permissions for ${fixed.length} node-pty spawn-helper file(s).`);
  }
}

module.exports = { ensureExecutable, findSpawnHelpers, fixNodePtySpawnHelper };
