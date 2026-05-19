import type { TripwireConfig } from "./types.js";

export type * from "./types.js";

export function defineConfig(config: TripwireConfig): TripwireConfig {
  return config;
}
