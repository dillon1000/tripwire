# Tripwire

Tripwire is a TypeScript dev dependency that runs configurable local safety checks before risky commands like deploys, pushes, deletes, migrations, or releases.

It is meant for the gap before CI: the moment where you are about to ask the machine to help you do something expensive or hard to undo.

## Install

```sh
pnpm add -D tripwire
```

## Configure

Create `tripwire.config.json`:

```json
{
  "$schema": "./tripwire.schema.json",
  "actions": {
    "deploy": {
      "requireCleanGit": true,
      "requireBranch": "main",
      "requirePassingCommand": "pnpm test",
      "forbidEnv": {
        "NODE_ENV": "development"
      },
      "requireConfirmationIf": [
        {
          "databaseMigration": true
        }
      ]
    }
  }
}
```

You can also put the same object under `"tripwire"` in `package.json`, or use `tripwire.config.js`, `tripwire.config.mjs`, or `tripwire.config.cjs`.

For typed JavaScript config:

```js
import { defineConfig } from "tripwire";

export default defineConfig({
  actions: {
    release: {
      requireCleanGit: true,
      requireBranch: ["main", "release"],
      command: "pnpm changeset publish"
    }
  }
});
```

## Run

```sh
pnpm tripwire deploy
pnpm tripwire deploy -- pnpm deploy
pnpm tripwire release --dry-run
```

If the action has a configured `command`, `tripwire deploy` runs checks and then runs that command. If you pass a command after `--`, it overrides the configured command.

## Checks

`requireCleanGit: true` blocks when the working tree has uncommitted changes.

`requireBranch: "main"` or `requireBranch: ["main", "release"]` blocks from any other branch.

`requirePassingCommand: "pnpm test"` runs a command and blocks if it exits non-zero.

`forbidEnv` blocks forbidden local environment values:

```json
{
  "forbidEnv": {
    "NODE_ENV": "development",
    "DANGEROUS_FLAG": true
  }
}
```

The boolean form means the variable must not be set at all.

`requireConfirmationIf` asks for a local `yes` confirmation when a condition matches. Conditions can match database migrations, env values, branches, or changed file patterns:

```json
{
  "requireConfirmationIf": [
    { "databaseMigration": true },
    { "fileChanged": ["infra/**", "**/*.sql"] },
    { "env": { "TARGET": "production" } }
  ]
}
```

Database migrations are detected from changed files using these default patterns:

```json
[
  "**/migrations/**",
  "**/migration/**",
  "**/*.migration.*",
  "**/schema.sql",
  "**/schema.ts",
  "prisma/**",
  "drizzle/**"
]
```

Override them globally with `migrationPatterns` or per action with `actions.<name>.migrationPatterns`. You can also force the condition with `--database-migration` or `TRIPWIRE_DATABASE_MIGRATION=true`.

Prompts are intentionally local. In a non-interactive terminal, Tripwire fails instead of silently continuing. Use `--yes` only when you intentionally want to bypass prompts in automation.

## Integrations

Tripwire integrations are configured under `integrations`. They intentionally use the CLIs and environment variables you already use locally, so Tripwire does not need provider SDKs or long-lived credentials of its own.

```json
{
  "actions": {
    "deploy": {
      "integrations": {
        "github": {
          "requireCli": true,
          "requireChecksPassing": true,
          "requireNoUnresolvedThreads": true
        },
        "deployment": {
          "vercel": {
            "requireProject": "my-production-app",
            "command": "vercel project ls"
          }
        },
        "cloud": {
          "aws": {
            "requireProfile": "production",
            "requireAccountId": "123456789012"
          }
        },
        "infrastructure": {
          "terraform": {
            "requireCleanPlan": true,
            "forbidDestroy": true
          }
        },
        "database": {
          "prisma": {
            "requireMigrationStatus": true
          },
          "requireRecentBackupCommand": "scripts/check-recent-backup.sh"
        },
        "docker": {
          "requireBuild": "docker build -t registry.example.com/app:$npm_package_version .",
          "requireTag": "registry.example.com/app:1.2.3",
          "forbidLatestTag": true
        },
        "kubernetes": {
          "requireContext": "prod-cluster",
          "requireNamespace": "production"
        },
        "sentry": {
          "requireRelease": "1.2.3"
        },
        "incident": {
          "pagerDutyStatusCommand": "scripts/pagerduty-open-incidents.sh"
        },
        "issueTracker": {
          "jira": {
            "requireBranchTicketPattern": "^[A-Z]+-[0-9]+"
          }
        },
        "packageRegistry": {
          "npm": {
            "requireVersionNotPublished": true
          }
        },
        "payments": {
          "stripe": {
            "forbidLiveModeEnv": "STRIPE_LIVE_MODE"
          }
        },
        "custom": [
          {
            "name": "internal.change-window",
            "command": "scripts/check-change-window.sh"
          }
        ]
      }
    }
  }
}
```

Supported integration groups:

- `github`: GitHub CLI checks for auth/availability, PR merge state, PR checks, unresolved review threads, and release existence.
- `deployment`: Vercel, Netlify, Fly.io, and Render command assertions.
- `cloud`: AWS account/profile, GCP project, and Azure subscription checks.
- `infrastructure`: Terraform and Pulumi plan/preview checks, including destructive-change blocking.
- `database`: Prisma, Drizzle, Knex, backup freshness, and replica health command hooks.
- `docker`: image build, tag existence, and `:latest` blocking.
- `kubernetes`: current context and namespace checks.
- `sentry`: release existence checks through `sentry-cli`.
- `notifications`: Slack and Discord webhook posts using webhook URL env vars.
- `incident`: PagerDuty and Opsgenie status command hooks that block on open incidents.
- `issueTracker`: Linear and Jira branch ticket pattern checks.
- `packageRegistry`: npm package/version publish guard.
- `payments`: Stripe and Polar account/workspace or live-mode guards.
- `custom`: any command assertion with expected or forbidden output.

## Config Reference

```ts
type TripwireConfig = {
  defaults?: ActionConfig;
  actions?: Record<string, ActionConfig>;
  migrationPatterns?: string[];
};

type ActionConfig = {
  command?: string | string[];
  requireCleanGit?: boolean;
  requireBranch?: string | string[];
  requirePassingCommand?: string | string[];
  forbidEnv?: Record<string, string | string[] | boolean>;
  requireConfirmationIf?: ConfirmationCondition[];
  migrationPatterns?: string[];
  baseBranch?: string;
  integrations?: IntegrationsConfig;
};
```

## Example Package Scripts

```json
{
  "scripts": {
    "deploy": "tripwire deploy -- pnpm vercel deploy --prod",
    "release": "tripwire release -- pnpm changeset publish",
    "db:migrate": "tripwire migrate -- pnpm prisma migrate deploy"
  }
}
```
