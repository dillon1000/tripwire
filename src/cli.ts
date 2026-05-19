#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCheckPlan, runRequiredCommands, assertResults } from "./checks.js";
import { loadConfig, resolveActionConfig } from "./config.js";
import { quoteCommand, runShell } from "./exec.js";
import { readGitState } from "./git.js";
import { runIntegrationChecks } from "./integrations.js";
import { confirmRequests } from "./prompt.js";
import type { CliOptions } from "./types.js";
import { TripwireError } from "./types.js";

export async function main(argv = process.argv.slice(2), cwd = process.cwd()): Promise<number> {
  try {
    const options = parseArgs(argv, cwd);
    if (options.version) {
      console.log(readVersion());
      return 0;
    }
    if (options.help) {
      printHelp();
      return 0;
    }

    const loaded = await loadConfig(options.cwd, options.configPath);
    if (options.listActions) {
      const actions = Object.keys(loaded.config.actions ?? {});
      console.log(actions.length ? actions.join("\n") : "No tripwire actions configured.");
      return 0;
    }
    if (!options.action) {
      printHelp();
      return 2;
    }

    const actionConfig = resolveActionConfig(loaded.config, options.action);
    const git = readGitState(options.cwd, actionConfig.baseBranch ?? "main");
    const context = {
      action: options.action,
      actionConfig,
      rootConfig: loaded.config,
      cwd: options.cwd,
      env: process.env,
      git,
      options
    };

    const plan = buildCheckPlan(context);
    assertResults(plan.results);
    assertResults(runRequiredCommands(actionConfig.requirePassingCommand, options.cwd));
    assertResults(runIntegrationChecks(context));
    await confirmRequests(plan.confirmations, { yes: options.yes, noInput: options.noInput });

    const command = options.command.length > 0 ? quoteCommand(options.command) : configCommand(actionConfig.command);
    if (!command) {
      console.log(`Tripwire checks passed for ${options.action}.`);
      return 0;
    }

    if (options.dryRun) {
      console.log(`Tripwire checks passed for ${options.action}. Dry run skipped command: ${command}`);
      return 0;
    }

    const result = runShell(command, options.cwd, "inherit");
    return result.status ?? 1;
  } catch (error) {
    if (error instanceof TripwireError) {
      console.error(error.message);
      return error.exitCode;
    }
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

export function parseArgs(argv: string[], cwd: string): CliOptions {
  const options: CliOptions = {
    action: undefined,
    configPath: undefined,
    command: [],
    cwd,
    yes: false,
    noInput: false,
    dryRun: false,
    databaseMigration: false,
    listActions: false,
    help: false,
    version: false
  };

  const commandIndex = argv.indexOf("--");
  const args = commandIndex === -1 ? argv : argv.slice(0, commandIndex);
  options.command = commandIndex === -1 ? [] : argv.slice(commandIndex + 1);

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--version" || arg === "-v") {
      options.version = true;
    } else if (arg === "--config" || arg === "-c") {
      index += 1;
      options.configPath = requiredValue(args[index], arg);
    } else if (arg === "--cwd") {
      index += 1;
      options.cwd = requiredValue(args[index], arg);
    } else if (arg === "--yes" || arg === "-y") {
      options.yes = true;
    } else if (arg === "--no-input") {
      options.noInput = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--database-migration") {
      options.databaseMigration = true;
    } else if (arg === "--list-actions") {
      options.listActions = true;
    } else if (arg.startsWith("-")) {
      throw new TripwireError(`Unknown option: ${arg}`, 2);
    } else if (!options.action) {
      options.action = arg;
    } else {
      throw new TripwireError(`Unexpected argument: ${arg}`, 2);
    }
  }

  return options;
}

function requiredValue(value: string | undefined, option: string): string {
  if (!value) {
    throw new TripwireError(`Missing value for ${option}`, 2);
  }
  return value;
}

function configCommand(command: string | string[] | undefined): string | undefined {
  if (!command) {
    return undefined;
  }
  return Array.isArray(command) ? quoteCommand(command) : command;
}

function readVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const packageJson = JSON.parse(readFileSync(join(here, "..", "..", "package.json"), "utf8")) as { version: string };
  return packageJson.version;
}

function printHelp(): void {
  console.log(`tripwire <action> [options] [-- command...]

Runs local safety checks before risky commands such as deploys, pushes, deletes, migrations, or releases.

Options:
  -c, --config <path>       Use a specific config file
  --cwd <path>             Run checks from a specific directory
  -y, --yes                Accept confirmation prompts
  --no-input               Fail instead of prompting
  --database-migration     Mark this action as containing a database migration
  --dry-run                Run checks without executing the wrapped command
  --list-actions           Print configured action names
  -h, --help               Show help
  -v, --version            Show version

Examples:
  tripwire deploy
  tripwire deploy -- pnpm deploy
  tripwire release --dry-run
`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await main();
}
