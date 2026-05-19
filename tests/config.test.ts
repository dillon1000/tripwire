import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig, resolveActionConfig } from "../src/config.js";

test("loads tripwire.config.json", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tripwire-"));
  writeFileSync(join(dir, "tripwire.config.json"), JSON.stringify({
    actions: {
      deploy: {
        requireCleanGit: true
      }
    }
  }));

  const loaded = await loadConfig(dir);
  const deploy = resolveActionConfig(loaded.config, "deploy");

  assert.equal(deploy.requireCleanGit, true);
});

test("loads package.json tripwire key", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tripwire-"));
  writeFileSync(join(dir, "package.json"), JSON.stringify({
    tripwire: {
      actions: {
        release: {
          requireBranch: "main"
        }
      }
    }
  }));

  const loaded = await loadConfig(dir);
  const release = resolveActionConfig(loaded.config, "release");

  assert.equal(release.requireBranch, "main");
});

test("merges defaults into actions", () => {
  const action = resolveActionConfig({
    defaults: {
      requireCleanGit: true,
      forbidEnv: {
        NODE_ENV: "development"
      }
    },
    actions: {
      deploy: {
        requireBranch: "main",
        forbidEnv: {
          DEBUG: true
        }
      }
    }
  }, "deploy");

  assert.equal(action.requireCleanGit, true);
  assert.equal(action.requireBranch, "main");
  assert.deepEqual(action.forbidEnv, { NODE_ENV: "development", DEBUG: true });
});
