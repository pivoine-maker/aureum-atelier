export const settingsChannels = {
  getInitial: "settings:getInitial",
  update: "settings:update",
} as const;

export const artworkChannels = {
  getToday: "artwork:getToday",
  resolveCachedImage: "artwork:resolveCachedImage",
  cacheReady: "artwork:cacheReady",
} as const;

export const workspaceChannels = {
  open: "workspace:open",
  restoreLast: "workspace:restoreLast",
  openRecent: "workspace:openRecent",
  getRecent: "workspace:getRecent",
  getTree: "workspace:getTree",
  readDirectory: "workspace:readDirectory",
  readFile: "workspace:readFile",
  writeFile: "workspace:writeFile",
  search: "workspace:search",
} as const;

export const codexChannels = {
  pickAttachments: "codex:pickAttachments",
  listSkills: "codex:listSkills",
  createThread: "codex:createThread",
  getGoal: "codex:getGoal",
  setGoal: "codex:setGoal",
  clearGoal: "codex:clearGoal",
  start: "codex:start",
  stop: "codex:stop",
  respondToApproval: "codex:respondToApproval",
  event: "codex:event",
} as const;

export const terminalChannels = {
  create: "terminal:create",
  write: "terminal:write",
  resize: "terminal:resize",
  kill: "terminal:kill",
  output: "terminal:output",
  exit: "terminal:exit",
} as const;

export const gitChannels = {
  status: "git:status",
  log: "git:log",
  diff: "git:diff",
  stage: "git:stage",
  unstage: "git:unstage",
  revert: "git:revert",
  commit: "git:commit",
} as const;
