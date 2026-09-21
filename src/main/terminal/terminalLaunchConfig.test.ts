import { describe, expect, it } from "vitest";

import { buildTerminalLaunchConfig, parseShellEnvironment } from "./terminalLaunchConfig";

describe("buildTerminalLaunchConfig", () => {
  it("uses the account login shell and launches it as a login session", () => {
    const config = buildTerminalLaunchConfig({
      env: { HOME: "/Users/atelier", PATH: "/usr/bin:/bin", SHELL: "/bin/bash" },
      platform: "darwin",
      userShell: "/bin/zsh",
    });

    expect(config.shell).toBe("/bin/zsh");
    expect(config.args).toEqual(["-l"]);
    expect(config.env).toMatchObject({
      HOME: "/Users/atelier",
      PATH: "/usr/bin:/bin",
      SHELL: "/bin/zsh",
      COLORTERM: "truecolor",
      TERM_PROGRAM: "Aureum Atelier",
    });
  });

  it("uses COMSPEC without Unix login flags on Windows", () => {
    const config = buildTerminalLaunchConfig({
      env: { COMSPEC: "C:\\Windows\\System32\\cmd.exe", PATH: "C:\\Windows\\System32" },
      platform: "win32",
      userShell: "",
    });

    expect(config.shell).toBe("C:\\Windows\\System32\\cmd.exe");
    expect(config.args).toEqual([]);
  });

  it("falls back to the platform shell when account metadata is unavailable", () => {
    expect(buildTerminalLaunchConfig({ env: {}, platform: "darwin", userShell: "" }).shell).toBe("/bin/zsh");
    expect(buildTerminalLaunchConfig({ env: {}, platform: "linux", userShell: "" }).shell).toBe("/bin/sh");
  });

  it("ignores shell startup output before the environment marker", () => {
    const output = Buffer.from("startup banner\n__AUREUM_LOGIN_ENVIRONMENT__\0PATH=/opt/homebrew/bin:/usr/bin\0CUSTOM=value=with=equals\0");

    expect(parseShellEnvironment(output)).toMatchObject({
      PATH: "/opt/homebrew/bin:/usr/bin",
      CUSTOM: "value=with=equals",
    });
  });
});
