import test from "node:test";
import assert from "node:assert/strict";
import { runIntegrationChecks } from "../src/integrations.js";
import type { CheckContext } from "../src/checks.js";
import type { GitState } from "../src/git.js";

const git: GitState = {
  available: true,
  branch: "ABC-123-release",
  clean: true,
  changedFiles: [],
  root: "/repo"
};

function context(overrides: Partial<CheckContext> = {}): CheckContext {
  return {
    action: "deploy",
    cwd: process.cwd(),
    env: {},
    git,
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

test("custom integration assertions can require and forbid command output", () => {
  const [pass, fail] = runIntegrationChecks(context({
    actionConfig: {
      integrations: {
        custom: [
          {
            name: "custom.pass",
            command: "node -e \"console.log('ready')\"",
            expectStdoutIncludes: "ready"
          },
          {
            name: "custom.fail",
            command: "node -e \"console.log('destroy')\"",
            forbidStdoutIncludes: "destroy"
          }
        ]
      }
    }
  }));

  assert.equal(pass?.ok, true);
  assert.equal(fail?.ok, false);
  assert.match(fail?.details?.join("\n") ?? "", /forbidden output/);
});

test("cloud integration checks env profile and command output", () => {
  const results = runIntegrationChecks(context({
    env: { AWS_PROFILE: "production" },
    actionConfig: {
      integrations: {
        cloud: {
          aws: {
            requireProfile: "production",
            requireAccountId: "123456789012",
            command: "node -e \"console.log('123456789012')\""
          }
        }
      }
    }
  }));

  assert.equal(results.length, 2);
  assert.equal(results.every((result) => result.ok), true);
});

test("docker integration blocks latest tags", () => {
  const [result] = runIntegrationChecks(context({
    actionConfig: {
      integrations: {
        docker: {
          requireTag: "app:latest",
          forbidLatestTag: true
        }
      }
    }
  })).filter((item) => item.name === "docker.forbidLatestTag");

  assert.equal(result?.ok, false);
});

test("issue tracker integration validates branch ticket pattern", () => {
  const [result] = runIntegrationChecks(context({
    actionConfig: {
      integrations: {
        issueTracker: {
          jira: {
            requireBranchTicketPattern: "^[A-Z]+-[0-9]+"
          }
        }
      }
    }
  }));

  assert.equal(result?.ok, true);
});

test("payment integration can block live-mode env values", () => {
  const [result] = runIntegrationChecks(context({
    env: { STRIPE_LIVE_MODE: "true" },
    actionConfig: {
      integrations: {
        payments: {
          stripe: {
            forbidLiveModeEnv: "STRIPE_LIVE_MODE"
          }
        }
      }
    }
  }));

  assert.equal(result?.ok, false);
});
