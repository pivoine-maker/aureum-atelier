const { app, BrowserWindow, ipcMain } = require("electron");
const { mkdir, writeFile } = require("node:fs/promises");
const { dirname, join } = require("node:path");

const root = join(__dirname, "..");
const output = join(root, "artifacts", "m0-preview.png");

async function main() {
  await app.whenReady();

  ipcMain.handle("settings:getInitial", () => ({
    themeMode: "gallery",
    backgroundIntensity: 68,
    rotationSalt: "aureum-atelier",
    enabledMovements: ["classicism", "neoclassicism", "baroque", "romanticism"],
    skippedArtworkIds: [],
    maxLuminance: 0.78,
  }));

  ipcMain.handle("artwork:getToday", () => ({
    id: "met-blind-orion-searching-for-the-rising-sun",
    title: "Blind Orion Searching for the Rising Sun",
    artist: "Nicolas Poussin",
    year: "1658",
    movement: "classicism",
    museum: "The Metropolitan Museum of Art",
    sourceUrl: "https://www.metmuseum.org/art/collection/search/437326",
    imageUrl: "https://images.metmuseum.org/CRDImages/ep/web-large/DP148490.jpg",
    license: "public-domain",
    dominantColors: ["#15130d", "#5d5132", "#c0a15d"],
    luminanceScore: 0.55,
    composition: "landscape",
    tags: ["landscape", "classical", "island"],
  }));

  const previewTree = [
    { name: "src", path: "src", kind: "directory", children: [
      { name: "main", path: "src/main", kind: "directory", children: [
        { name: "index.ts", path: "src/main/index.ts", kind: "file" },
      ] },
      { name: "renderer", path: "src/renderer", kind: "directory", children: [
        { name: "App.tsx", path: "src/renderer/App.tsx", kind: "file" },
        { name: "styles", path: "src/renderer/styles", kind: "directory", children: [] },
      ] },
    ] },
    { name: "package.json", path: "package.json", kind: "file" },
    { name: "README.md", path: "README.md", kind: "file" },
  ];

  ipcMain.handle("workspace:open", () => ({ root, name: "aureum-atelier", tree: previewTree }));
  ipcMain.handle("workspace:getTree", () => previewTree);
  ipcMain.handle("workspace:readFile", (_event, path) => ({
    path,
    language: path.endsWith(".json") ? "json" : "typescript",
    content: `import { AtelierShell } from "./atelier";\n\nexport function App() {\n  const artwork = useDailyArtwork();\n  const workspace = useWorkspace();\n\n  return (\n    <AtelierShell artwork={artwork}>\n      <Workspace value={workspace} />\n      <CodexWorkbench mode="agentic" />\n    </AtelierShell>\n  );\n}\n`,
  }));
  ipcMain.handle("workspace:writeFile", () => undefined);
  ipcMain.handle("workspace:search", () => [
    { path: "src/renderer/App.tsx", line: 4, column: 9, preview: "const artwork = useDailyArtwork();" },
  ]);

  ipcMain.handle("codex:start", (_event, prompt) => {
    setTimeout(() => window.webContents.send("codex:event", { kind: "status", status: "started" }), 50);
    setTimeout(() => window.webContents.send("codex:event", { kind: "assistant-delta", text: `I can inspect this workspace for: ${prompt}` }), 180);
    setTimeout(() => window.webContents.send("codex:event", { kind: "status", status: "completed" }), 450);
  });
  ipcMain.handle("codex:stop", () => undefined);

  ipcMain.handle("terminal:create", () => ({ id: "preview-terminal" }));
  ipcMain.handle("terminal:write", () => undefined);
  ipcMain.handle("terminal:resize", () => undefined);
  ipcMain.handle("terminal:kill", () => undefined);
  ipcMain.handle("git:status", () => ({
    branch: "main",
    changes: [
      { path: "src/renderer/App.tsx", status: "modified" },
      { path: "src/shared/git.ts", status: "added" },
    ],
  }));
  ipcMain.handle("git:diff", () => "diff --git a/src/renderer/App.tsx b/src/renderer/App.tsx");

  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    show: false,
    backgroundColor: "#080604",
    webPreferences: {
      preload: join(root, "out", "preload", "index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.on("did-fail-load", (_event, code, description) => {
    console.error(`[renderer] did-fail-load ${code}: ${description}`);
  });

  await window.loadFile(join(root, "out", "renderer", "index.html"));
  await new Promise((resolve) => setTimeout(resolve, 900));
  await window.webContents.executeJavaScript(`
    document.querySelector('.aureum-primary-button')?.click();
    setTimeout(() => {
      [...document.querySelectorAll('.file-tree__row')]
        .find((node) => node.textContent?.includes('App.tsx'))?.click();
      document.querySelector('[aria-label="Message Codex"]').value = 'Summarize this workspace shell';
      document.querySelector('[aria-label="Message Codex"]').dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('[aria-label="Send message"]')?.click();
      window.dispatchEvent(new Event('resize'));
    }, 250);
  `);
  await new Promise((resolve) => setTimeout(resolve, 1_600));

  const image = await window.webContents.capturePage();
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, image.toPNG());
  console.log(output);

  window.destroy();
  app.quit();
}

main().catch((error) => {
  console.error(error);
  app.quit();
  process.exitCode = 1;
});
