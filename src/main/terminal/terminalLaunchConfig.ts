import { spawn } from "node:child_process";

type TerminalPlatform = NodeJS.Platform;

type TerminalLaunchConfigInput = {
  env: NodeJS.ProcessEnv;
  platform: TerminalPlatform;
  userShell: string;
};

export type TerminalLaunchConfig = {
  args: string[];
  env: NodeJS.ProcessEnv;
  shell: string;
};

const environmentMarker = "__AUREUM_LOGIN_ENVIRONMENT__";
const environmentProbeCommand = `printf '${environmentMarker}\\0'; env -0`;
const environmentProbeTimeout = 5_000;
const maximumEnvironmentBytes = 2 * 1024 * 1024;
const environmentCache = new Map<string, Promise<NodeJS.ProcessEnv>>();

export function buildTerminalLaunchConfig({ env, platform, userShell }: TerminalLaunchConfigInput): TerminalLaunchConfig {
  const shell = resolveTerminalShell(env, platform, userShell);
  const isWindows = platform === "win32";
  return {
    shell,
    args: isWindows ? [] : ["-l"],
    env: {
      ...env,
      SHELL: isWindows ? env.SHELL : shell,
      COLORTERM: "truecolor",
      TERM: "xterm-256color",
      TERM_PROGRAM: "Aureum Atelier",
      TERM_PROGRAM_VERSION: "0.1.0",
    },
  };
}

export async function inheritLoginShellEnvironment(config: TerminalLaunchConfig, platform: TerminalPlatform): Promise<TerminalLaunchConfig> {
  if (platform === "win32") return config;
  const cacheKey = `${config.shell}\0${config.env.HOME ?? ""}\0${config.env.USER ?? ""}`;
  let environmentPromise = environmentCache.get(cacheKey);
  if (!environmentPromise) {
    environmentPromise = readLoginShellEnvironment(config.shell, config.env);
    environmentCache.set(cacheKey, environmentPromise);
  }
  const loginEnvironment = await environmentPromise;
  return {
    ...config,
    env: {
      ...config.env,
      ...loginEnvironment,
      SHELL: config.shell,
      COLORTERM: "truecolor",
      TERM: "xterm-256color",
      TERM_PROGRAM: "Aureum Atelier",
      TERM_PROGRAM_VERSION: "0.1.0",
    },
  };
}

export function parseShellEnvironment(output: Buffer): NodeJS.ProcessEnv {
  const marker = Buffer.from(`${environmentMarker}\0`);
  const markerIndex = output.indexOf(marker);
  if (markerIndex < 0) return {};
  const environment: NodeJS.ProcessEnv = {};
  const payload = output.subarray(markerIndex + marker.length).toString("utf8");
  for (const entry of payload.split("\0")) {
    const separatorIndex = entry.indexOf("=");
    if (separatorIndex <= 0) continue;
    environment[entry.slice(0, separatorIndex)] = entry.slice(separatorIndex + 1);
  }
  return environment;
}

function resolveTerminalShell(env: NodeJS.ProcessEnv, platform: TerminalPlatform, userShell: string): string {
  if (platform === "win32") return env.COMSPEC?.trim() || env.SHELL?.trim() || "powershell.exe";
  return userShell.trim() || env.SHELL?.trim() || (platform === "darwin" ? "/bin/zsh" : "/bin/sh");
}

function readLoginShellEnvironment(shell: string, baseEnvironment: NodeJS.ProcessEnv): Promise<NodeJS.ProcessEnv> {
  return new Promise((resolve) => {
    const child = spawn(shell, environmentProbeArgs(shell), {
      env: baseEnvironment,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const output: Buffer[] = [];
    let outputBytes = 0;
    let settled = false;
    const finish = (environment: NodeJS.ProcessEnv) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(environment);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish({});
    }, environmentProbeTimeout);

    child.stdout.on("data", (chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > maximumEnvironmentBytes) {
        child.kill();
        finish({});
        return;
      }
      output.push(chunk);
    });
    child.on("error", () => finish({}));
    child.on("close", (code) => finish(code === 0 ? parseShellEnvironment(Buffer.concat(output)) : {}));
  });
}

function environmentProbeArgs(shell: string): string[] {
  const shellName = shell.split(/[\\/]/).at(-1)?.toLowerCase();
  if (shellName === "fish") return ["--login", "--interactive", "--command", environmentProbeCommand];
  return ["-l", "-i", "-c", environmentProbeCommand];
}
