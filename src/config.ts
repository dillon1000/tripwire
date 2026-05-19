import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { ActionConfig, TripwireConfig } from "./types.js";
import { TripwireError } from "./types.js";

const CONFIG_FILES = [
  "tripwire.config.json",
  ".tripwirerc.json",
  "tripwire.config.cjs",
  "tripwire.config.mjs",
  "tripwire.config.js",
  "package.json"
];

export type LoadedConfig = {
  path: string | undefined;
  config: TripwireConfig;
};

export async function loadConfig(cwd: string, explicitPath?: string): Promise<LoadedConfig> {
  if (explicitPath) {
    const path = resolve(cwd, explicitPath);
    return { path, config: await readConfigFile(path) };
  }

  for (const file of CONFIG_FILES) {
    const path = join(cwd, file);
    if (!existsSync(path)) {
      continue;
    }
    try {
      const config = await readConfigFile(path);
      if (file === "package.json" && Object.keys(config).length === 0) {
        continue;
      }
      return { path, config };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        continue;
      }
      throw error;
    }
  }

  return { path: undefined, config: {} };
}

export function resolveActionConfig(config: TripwireConfig, action: string): ActionConfig {
  const actionConfig = config.actions?.[action];
  if (!actionConfig) {
    throw new TripwireError(`No tripwire action named "${action}" is configured.`, 2);
  }
  return mergeActionConfig(config.defaults, actionConfig);
}

function mergeActionConfig(defaults: ActionConfig | undefined, action: ActionConfig): ActionConfig {
  return {
    ...defaults,
    ...action,
    forbidEnv: {
      ...defaults?.forbidEnv,
      ...action.forbidEnv
    },
    requireConfirmationIf: [
      ...(defaults?.requireConfirmationIf ?? []),
      ...(action.requireConfirmationIf ?? [])
    ],
    migrationPatterns: action.migrationPatterns ?? defaults?.migrationPatterns
  };
}

async function readConfigFile(path: string): Promise<TripwireConfig> {
  const name = basename(path);
  if (name === "package.json") {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as { tripwire?: TripwireConfig };
    return parsed.tripwire ?? {};
  }
  if (path.endsWith(".json")) {
    return JSON.parse(readFileSync(path, "utf8")) as TripwireConfig;
  }
  if (path.endsWith(".cjs")) {
    const imported = await import(pathToFileURL(path).href);
    return (imported.default ?? imported) as TripwireConfig;
  }
  if (path.endsWith(".mjs") || path.endsWith(".js")) {
    const imported = await import(`${pathToFileURL(path).href}?t=${Date.now()}`);
    return (imported.default ?? imported) as TripwireConfig;
  }
  throw new TripwireError(`Unsupported config file: ${dirname(path)}/${name}`);
}
