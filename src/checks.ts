import { runShell } from "./exec.js";
import type { GitState } from "./git.js";
import { matchesAnyPattern, migrationPatterns } from "./match.js";
import type { ActionConfig, CheckResult, CliOptions, ConfirmationCondition, TripwireConfig } from "./types.js";
import { TripwireError } from "./types.js";

export type CheckContext = {
  action: string;
  actionConfig: ActionConfig;
  rootConfig: TripwireConfig;
  cwd: string;
  env: NodeJS.ProcessEnv;
  git: GitState;
  options: CliOptions;
};

export type ConfirmationRequest = {
  condition: ConfirmationCondition;
  message: string;
  details: string[];
};

export type CheckPlan = {
  results: CheckResult[];
  confirmations: ConfirmationRequest[];
};

export function buildCheckPlan(context: CheckContext): CheckPlan {
  const results: CheckResult[] = [];
  const confirmations: ConfirmationRequest[] = [];

  if (context.actionConfig.requireCleanGit) {
    results.push(checkCleanGit(context.git));
  }

  if (context.actionConfig.requireBranch) {
    results.push(checkBranch(context.git, context.actionConfig.requireBranch));
  }

  if (context.actionConfig.forbidEnv) {
    results.push(...checkForbiddenEnv(context.actionConfig.forbidEnv, context.env));
  }

  for (const condition of context.actionConfig.requireConfirmationIf ?? []) {
    const match = evaluateConfirmationCondition(condition, context);
    if (match.matched) {
      confirmations.push({
        condition,
        message: condition.message ?? match.message,
        details: match.details
      });
    }
  }

  return { results, confirmations };
}

export function runRequiredCommands(commands: string | string[] | undefined, cwd: string): CheckResult[] {
  if (!commands) {
    return [];
  }
  return arrayOf(commands).map((command) => {
    const result = runShell(command, cwd, "inherit");
    return {
      name: "requirePassingCommand",
      ok: result.status === 0,
      message: result.status === 0
        ? `Command passed: ${command}`
        : `Command failed with exit code ${result.status ?? "unknown"}: ${command}`
    };
  });
}

export function assertResults(results: CheckResult[]): void {
  const failures = results.filter((result) => !result.ok);
  if (failures.length > 0) {
    const body = failures.map((failure) => {
      const details = failure.details?.length ? `\n  ${failure.details.join("\n  ")}` : "";
      return `- ${failure.message}${details}`;
    }).join("\n");
    throw new TripwireError(`Tripwire blocked this action:\n${body}`);
  }
}

function checkCleanGit(git: GitState): CheckResult {
  if (!git.available) {
    return {
      name: "requireCleanGit",
      ok: false,
      message: `Git checks require a repository, but git is unavailable here: ${git.reason ?? "unknown reason"}`
    };
  }
  if (git.clean) {
    return { name: "requireCleanGit", ok: true, message: "Git working tree is clean." };
  }
  return {
    name: "requireCleanGit",
    ok: false,
    message: "Git working tree must be clean.",
    details: git.changedFiles.length ? git.changedFiles : undefined
  };
}

function checkBranch(git: GitState, expected: string | string[]): CheckResult {
  const allowed = arrayOf(expected);
  if (!git.available) {
    return {
      name: "requireBranch",
      ok: false,
      message: `Branch check requires a git repository, but git is unavailable here: ${git.reason ?? "unknown reason"}`
    };
  }
  const ok = Boolean(git.branch && allowed.includes(git.branch));
  return {
    name: "requireBranch",
    ok,
    message: ok
      ? `Branch is ${git.branch}.`
      : `Branch must be ${allowed.join(" or ")}; current branch is ${git.branch ?? "detached HEAD"}.`
  };
}

function checkForbiddenEnv(forbidEnv: Record<string, string | string[] | boolean>, env: NodeJS.ProcessEnv): CheckResult[] {
  return Object.entries(forbidEnv).map(([key, forbidden]) => {
    const actual = env[key];
    const forbiddenValues = arrayOf(forbidden).map(String);
    const ok = forbidden === true ? actual === undefined : !forbiddenValues.includes(String(actual));
    return {
      name: "forbidEnv",
      ok,
      message: ok
        ? `Environment variable ${key} is allowed.`
        : `Environment variable ${key} must not be ${forbidden === true ? "set" : forbiddenValues.join(" or ")}.`
    };
  });
}

function evaluateConfirmationCondition(
  condition: ConfirmationCondition,
  context: CheckContext
): { matched: boolean; message: string; details: string[] } {
  const details: string[] = [];
  let matched = false;

  if (condition.databaseMigration) {
    const patterns = migrationPatterns(context.actionConfig.migrationPatterns, context.rootConfig.migrationPatterns);
    const migrationFiles = context.git.changedFiles.filter((file) => matchesAnyPattern(file, patterns));
    const envSaysMigration = truthy(context.env.TRIPWIRE_DATABASE_MIGRATION);
    if (context.options.databaseMigration || envSaysMigration || migrationFiles.length > 0) {
      matched = true;
      details.push(...migrationFiles);
      if (context.options.databaseMigration) {
        details.push("database migration was flagged with --database-migration");
      }
      if (envSaysMigration) {
        details.push("database migration was flagged by TRIPWIRE_DATABASE_MIGRATION");
      }
    }
  }

  if (condition.env) {
    for (const [key, expected] of Object.entries(condition.env)) {
      const values = arrayOf(expected).map(String);
      const actual = context.env[key];
      const envMatches = expected === true ? actual !== undefined : values.includes(String(actual));
      if (envMatches) {
        matched = true;
        details.push(`${key}=${actual ?? ""}`);
      }
    }
  }

  if (condition.branch) {
    const branches = arrayOf(condition.branch);
    if (context.git.branch && branches.includes(context.git.branch)) {
      matched = true;
      details.push(`branch=${context.git.branch}`);
    }
  }

  if (condition.fileChanged) {
    const patterns = arrayOf(condition.fileChanged);
    const files = context.git.changedFiles.filter((file) => matchesAnyPattern(file, patterns));
    if (files.length > 0) {
      matched = true;
      details.push(...files);
    }
  }

  return {
    matched,
    message: confirmationMessage(condition),
    details: [...new Set(details)]
  };
}

function confirmationMessage(condition: ConfirmationCondition): string {
  if (condition.databaseMigration) {
    return "Database migration changes were detected. Continue?";
  }
  if (condition.fileChanged) {
    return "Sensitive file changes were detected. Continue?";
  }
  if (condition.env) {
    return "A confirmation-gated environment condition matched. Continue?";
  }
  if (condition.branch) {
    return "A confirmation-gated branch condition matched. Continue?";
  }
  return "This action requires confirmation. Continue?";
}

function arrayOf<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value];
}

function truthy(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "yes";
}
