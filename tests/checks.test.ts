import test from "node:test";
import assert from "node:assert/strict";
import { buildCheckPlan, runRequiredCommands } from "../src/checks.js";
import type { CheckContext } from "../src/checks.js";
import type { GitState } from "../src/git.js";

const cleanGit: GitState = {
  available: true,
  branch: "main",
  clean: true,
  changedFiles: [],
  root: "/repo"
};

function context(overrides: Partial<CheckContext> = {}): CheckContext {
  return {
    action: "deploy",
    cwd: process.cwd(),
    env: {},
    git: cleanGit,
    rootConfig: {},
    options: {
      action: "deploy",
      configPath: undefined,
      command: [],
      cwd: process.cwd(),
      yes: false,
      noInput: false,
      dryRun: false,
      databaseMigration: false,
      listActions: false,
      help: false,
      version: false
    },
    actionConfig: {},
    ...overrides
  };
}

test("requireCleanGit blocks a dirty working tree", () => {
  const plan = buildCheckPlan(context({
    actionConfig: { requireCleanGit: true },
    git: { ...cleanGit, clean: false, changedFiles: ["src/index.ts"] }
  }));

  assert.equal(plan.results.length, 1);
  assert.equal(plan.results[0]?.ok, false);
  assert.match(plan.results[0]?.message ?? "", /clean/);
});

test("requireBranch accepts allowed branches and blocks others", () => {
  const pass = buildCheckPlan(context({ actionConfig: { requireBranch: ["main", "release"] } }));
  const fail = buildCheckPlan(context({
    actionConfig: { requireBranch: "main" },
    git: { ...cleanGit, branch: "feature" }
  }));

  assert.equal(pass.results[0]?.ok, true);
  assert.equal(fail.results[0]?.ok, false);
  assert.match(fail.results[0]?.message ?? "", /current branch is feature/);
});

test("forbidEnv blocks exact values and set variables", () => {
  const plan = buildCheckPlan(context({
    env: { NODE_ENV: "development", DANGER: "1" },
    actionConfig: {
      forbidEnv: {
        NODE_ENV: "development",
        DANGER: true
      }
    }
  }));

  assert.equal(plan.results.length, 2);
  assert.equal(plan.results.every((result) => !result.ok), true);
});

test("databaseMigration confirmation triggers from changed migration files", () => {
  const plan = buildCheckPlan(context({
    actionConfig: {
      requireConfirmationIf: [{ databaseMigration: true }]
    },
    git: {
      ...cleanGit,
      changedFiles: ["packages/db/migrations/0001_init.sql"]
    }
  }));

  assert.equal(plan.confirmations.length, 1);
  assert.match(plan.confirmations[0]?.message ?? "", /Database migration/);
});

test("databaseMigration confirmation can be forced by cli flag", () => {
  const base = context({
    actionConfig: {
      requireConfirmationIf: [{ databaseMigration: true }]
    }
  });

  const plan = buildCheckPlan(context({
    ...base,
    options: { ...base.options, databaseMigration: true }
  }));

  assert.equal(plan.confirmations.length, 1);
});

test("requirePassingCommand reports failing commands", () => {
  const [result] = runRequiredCommands("node -e \"process.exit(7)\"", process.cwd());

  assert.equal(result?.ok, false);
  assert.match(result?.message ?? "", /exit code 7/);
});
