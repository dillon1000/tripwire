import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { main, parseArgs } from "../src/cli.js";

test("parseArgs captures action, options, and wrapped command", () => {
  const parsed = parseArgs(["deploy", "--yes", "--database-migration", "--", "pnpm", "deploy"], "/repo");

  assert.equal(parsed.action, "deploy");
  assert.equal(parsed.yes, true);
  assert.equal(parsed.databaseMigration, true);
  assert.deepEqual(parsed.command, ["pnpm", "deploy"]);
});

test("main runs configured command after passing checks", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tripwire-"));
  const output = join(dir, "ran.txt");
  writeFileSync(join(dir, "tripwire.config.json"), JSON.stringify({
    actions: {
      deploy: {
        command: `node -e "require('node:fs').writeFileSync('${output}', 'ok')"`
      }
    }
  }));

  const code = await main(["deploy", "--cwd", dir], dir);

  assert.equal(code, 0);
  assert.equal(readFileSync(output, "utf8"), "ok");
});

test("main fails non-interactively when confirmation is required", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tripwire-"));
  writeFileSync(join(dir, "tripwire.config.json"), JSON.stringify({
    actions: {
      deploy: {
        requireConfirmationIf: [{ databaseMigration: true }]
      }
    }
  }));

  const code = await main(["deploy", "--cwd", dir, "--database-migration", "--no-input"], dir);

  assert.equal(code, 1);
});

test("main prints package version", async () => {
  const code = await main(["--version"], process.cwd());

  assert.equal(code, 0);
});

test("main enforces git branch and clean working tree checks", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tripwire-"));
  git(dir, "init", "-b", "main");
  writeFileSync(join(dir, "README.md"), "ready\n");
  writeFileSync(join(dir, "tripwire.config.json"), JSON.stringify({
    actions: {
      deploy: {
        requireCleanGit: true,
        requireBranch: "main"
      }
    }
  }));
  git(dir, "add", ".");
  git(dir, "-c", "user.name=Tripwire", "-c", "user.email=tripwire@example.com", "commit", "-m", "init");

  const cleanCode = await main(["deploy", "--cwd", dir], dir);
  writeFileSync(join(dir, "dirty.txt"), "not committed\n");
  const dirtyCode = await main(["deploy", "--cwd", dir], dir);

  assert.equal(cleanCode, 0);
  assert.equal(dirtyCode, 1);
});

function git(cwd: string, ...args: string[]): void {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}
