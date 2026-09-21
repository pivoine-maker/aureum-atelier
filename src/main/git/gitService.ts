import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { parseGitLog, parseGitStatus, type GitCommit, type GitStatus } from "../../shared/git";

const execFileAsync = promisify(execFile);

export class GitService {
  constructor(private readonly cwd: string) {}

  async status(): Promise<GitStatus> {
    try {
      const [{ stdout: branchStdout }, { stdout: statusStdout }] = await Promise.all([
        this.run(["branch", "--show-current"]),
        this.run(["status", "--porcelain=v1"]),
      ]);
      return {
        branch: branchStdout.trim() || null,
        changes: parseGitStatus(statusStdout),
        isRepository: true,
      };
    } catch {
      return { branch: null, changes: [], isRepository: false };
    }
  }

  async diff(path: string, staged: boolean): Promise<string> {
    const args = ["diff"];
    if (staged) args.push("--cached");
    args.push("--", path);
    return (await this.run(args)).stdout;
  }

  async stage(path: string): Promise<void> {
    await this.run(["add", "--", path]);
  }

  async unstage(path: string): Promise<void> {
    try {
      await this.run(["restore", "--staged", "--", path]);
    } catch {
      await this.run(["reset", "HEAD", "--", path]);
    }
  }

  async revert(path: string, staged: boolean): Promise<void> {
    if (staged) {
      await this.unstage(path);
      return;
    }
    try {
      await this.run(["restore", "--worktree", "--", path]);
    } catch {
      await this.run(["checkout", "--", path]);
    }
  }

  async commit(message: string): Promise<string> {
    const normalizedMessage = message.trim();
    if (!normalizedMessage) throw new Error("Commit message is required");
    const { stdout } = await this.run(["commit", "-m", normalizedMessage]);
    return stdout.trim();
  }

  async log(limit = 30): Promise<GitCommit[]> {
    const normalizedLimit = Math.min(100, Math.max(1, Math.round(limit)));
    try {
      const { stdout } = await this.run([
        "log",
        "--graph",
        "--decorate",
        "--date=iso-strict",
        "--pretty=format:%H%x1f%h%x1f%P%x1f%an%x1f%ad%x1f%D%x1f%s",
        `--max-count=${normalizedLimit}`,
      ]);
      return parseGitLog(stdout);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("does not have any commits yet") || message.includes("bad default revision")) return [];
      throw error;
    }
  }

  private run(args: string[]) {
    return execFileAsync("git", args, { cwd: this.cwd, maxBuffer: 4_000_000 });
  }
}
