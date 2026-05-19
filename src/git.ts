import { runShell } from "./exec.js";

export type GitState = {
  available: boolean;
  branch: string | undefined;
  clean: boolean | undefined;
  changedFiles: string[];
  root: string | undefined;
  reason?: string;
};

export function readGitState(cwd: string, baseBranch = "main"): GitState {
  const root = runShell("git rev-parse --show-toplevel", cwd);
  if (root.status !== 0) {
    return {
      available: false,
      branch: undefined,
      clean: undefined,
      changedFiles: [],
      root: undefined,
      reason: cleanMessage(root.stderr || root.stdout || "not a git repository")
    };
  }

  const gitRoot = root.stdout.trim();
  const branchResult = runShell("git branch --show-current", cwd);
  const statusResult = runShell("git status --porcelain=v1", cwd);
  const changedFiles = new Set<string>();

  for (const line of statusResult.stdout.split(/\r?\n/)) {
    const file = parseStatusFile(line);
    if (file) {
      changedFiles.add(file);
    }
  }

  for (const file of readChangedFilesSinceBase(cwd, baseBranch)) {
    changedFiles.add(file);
  }

  return {
    available: true,
    branch: branchResult.stdout.trim() || undefined,
    clean: statusResult.status === 0 ? statusResult.stdout.trim().length === 0 : undefined,
    changedFiles: [...changedFiles].sort(),
    root: gitRoot
  };
}

function readChangedFilesSinceBase(cwd: string, baseBranch: string): string[] {
  const candidates = [`origin/${baseBranch}`, baseBranch];
  for (const candidate of candidates) {
    const mergeBase = runShell(`git merge-base HEAD ${candidate}`, cwd);
    if (mergeBase.status !== 0 || !mergeBase.stdout.trim()) {
      continue;
    }
    const diff = runShell(`git diff --name-only ${mergeBase.stdout.trim()}...HEAD`, cwd);
    if (diff.status === 0) {
      return diff.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    }
  }
  return [];
}

function parseStatusFile(line: string): string | undefined {
  if (!line.trim()) {
    return undefined;
  }
  const raw = line.slice(3).trim();
  const renameSeparator = " -> ";
  if (raw.includes(renameSeparator)) {
    return raw.split(renameSeparator).at(-1);
  }
  return raw || undefined;
}

function cleanMessage(message: string): string {
  return message.trim().replace(/\s+/g, " ");
}
