import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runShell } from "./exec.js";
import type {
  CheckResult,
  CloudIntegration,
  CommandAssertion,
  DatabaseIntegration,
  DeploymentIntegrations,
  DockerIntegration,
  GithubIntegration,
  IncidentIntegration,
  InfrastructureIntegration,
  IntegrationsConfig,
  IssueTrackerIntegration,
  KubernetesIntegration,
  NotificationIntegration,
  PackageRegistryIntegration,
  PaymentsIntegration,
  SentryIntegration
} from "./types.js";
import type { CheckContext } from "./checks.js";

export function runIntegrationChecks(context: CheckContext): CheckResult[] {
  const integrations = context.actionConfig.integrations;
  if (!integrations) {
    return [];
  }

  return [
    ...checkGithub(integrations.github, context),
    ...checkDeployment(integrations.deployment, context),
    ...checkCloud(integrations.cloud, context),
    ...checkInfrastructure(integrations.infrastructure, context),
    ...checkDatabase(integrations.database, context),
    ...checkDocker(integrations.docker, context),
    ...checkKubernetes(integrations.kubernetes, context),
    ...checkSentry(integrations.sentry, context),
    ...checkNotifications(integrations.notifications, context),
    ...checkIncident(integrations.incident, context),
    ...checkIssueTracker(integrations.issueTracker, context),
    ...checkPackageRegistry(integrations.packageRegistry, context),
    ...checkPayments(integrations.payments, context),
    ...(integrations.custom ?? []).map((assertion) => runAssertion(assertion, context.cwd))
  ];
}

function checkGithub(config: GithubIntegration | undefined, context: CheckContext): CheckResult[] {
  if (!config) {
    return [];
  }
  const results: CheckResult[] = [];
  if (config.requireCli) {
    results.push(runAssertion({ name: "github.requireCli", command: "gh --version" }, context.cwd));
  }
  if (config.requirePrMerged) {
    const selector = selectorArg(config.requirePrMerged);
    results.push(runAssertion({
      name: "github.requirePrMerged",
      command: `gh pr view ${selector} --json state,mergedAt --jq '.state == "MERGED" or (.mergedAt != null)'`,
      expectStdoutIncludes: "true"
    }, context.cwd));
  }
  if (config.requireChecksPassing) {
    const selector = selectorArg(config.requireChecksPassing);
    results.push(runAssertion({
      name: "github.requireChecksPassing",
      command: `gh pr checks ${selector} --fail-fast`
    }, context.cwd));
  }
  if (config.requireNoUnresolvedThreads) {
    results.push(checkGithubReviewThreads(config.requireNoUnresolvedThreads, context.cwd));
  }
  if (config.requireReleaseNotExists) {
    results.push(invertCommand({
      name: "github.requireReleaseNotExists",
      command: `gh release view ${quote(config.requireReleaseNotExists)}`,
      message: `GitHub release must not already exist: ${config.requireReleaseNotExists}`
    }, context.cwd));
  }
  return results;
}

function checkGithubReviewThreads(selector: boolean | string, cwd: string): CheckResult {
  const selectorValue = selectorArg(selector);
  const prNumber = runShell(`gh pr view ${selectorValue} --json number --jq .number`, cwd);
  const repo = runShell("gh repo view --json nameWithOwner --jq .nameWithOwner", cwd);
  if (prNumber.status !== 0 || repo.status !== 0) {
    return {
      name: "github.requireNoUnresolvedThreads",
      ok: false,
      message: "Could not inspect GitHub review threads.",
      details: compact([prNumber.stderr.trim(), repo.stderr.trim()])
    };
  }
  const [owner, name] = repo.stdout.trim().split("/");
  const number = prNumber.stdout.trim();
  const query = `
    query($owner: String!, $name: String!, $number: Int!) {
      repository(owner: $owner, name: $name) {
        pullRequest(number: $number) {
          reviewThreads(first: 100) {
            nodes {
              isResolved
            }
          }
        }
      }
    }
  `.replace(/\s+/g, " ").trim();
  return runAssertion({
    name: "github.requireNoUnresolvedThreads",
    command: `gh api graphql -f owner=${quote(owner ?? "")} -f name=${quote(name ?? "")} -F number=${quote(number)} -f query=${quote(query)} --jq '.data.repository.pullRequest.reviewThreads.nodes | map(select(.isResolved == false)) | length == 0'`,
    expectStdoutIncludes: "true"
  }, cwd);
}

function checkDeployment(config: DeploymentIntegrations | undefined, context: CheckContext): CheckResult[] {
  if (!config) {
    return [];
  }
  const results: CheckResult[] = [];
  if (config.vercel) {
    results.push(runAssertion({
      name: "deployment.vercel",
      command: config.vercel.command ?? "vercel project ls",
      expectStdoutIncludes: compact([config.vercel.requireProject, config.vercel.requireTarget])
    }, context.cwd));
  }
  if (config.netlify) {
    results.push(runAssertion({
      name: "deployment.netlify",
      command: config.netlify.command ?? "netlify status",
      expectStdoutIncludes: compact([config.netlify.requireSite])
    }, context.cwd));
  }
  if (config.fly) {
    results.push(runAssertion({
      name: "deployment.fly",
      command: config.fly.command ?? "fly status",
      expectStdoutIncludes: compact([config.fly.requireApp])
    }, context.cwd));
  }
  if (config.render) {
    results.push(runAssertion({
      name: "deployment.render",
      command: config.render.command ?? "render services",
      expectStdoutIncludes: compact([config.render.requireService])
    }, context.cwd));
  }
  return results;
}

function checkCloud(config: CloudIntegration | undefined, context: CheckContext): CheckResult[] {
  if (!config) {
    return [];
  }
  const results: CheckResult[] = [];
  if (config.aws) {
    if (config.aws.requireProfile) {
      results.push(envEquals("cloud.aws.requireProfile", "AWS_PROFILE", config.aws.requireProfile, context));
    }
    results.push(runAssertion({
      name: "cloud.aws",
      command: config.aws.command ?? "aws sts get-caller-identity --output text",
      expectStdoutIncludes: compact([config.aws.requireAccountId])
    }, context.cwd));
  }
  if (config.gcp) {
    results.push(runAssertion({
      name: "cloud.gcp",
      command: config.gcp.command ?? "gcloud config get-value project",
      expectStdoutIncludes: compact([config.gcp.requireProject])
    }, context.cwd));
  }
  if (config.azure) {
    results.push(runAssertion({
      name: "cloud.azure",
      command: config.azure.command ?? "az account show --query id -o tsv",
      expectStdoutIncludes: compact([config.azure.requireSubscription])
    }, context.cwd));
  }
  return results;
}

function checkInfrastructure(config: InfrastructureIntegration | undefined, context: CheckContext): CheckResult[] {
  if (!config) {
    return [];
  }
  const results: CheckResult[] = [];
  if (config.terraform?.requireCleanPlan) {
    results.push(runAssertion({
      name: "infrastructure.terraform.requireCleanPlan",
      command: typeof config.terraform.requireCleanPlan === "string"
        ? config.terraform.requireCleanPlan
        : "terraform plan -detailed-exitcode",
      expectExitCode: 0
    }, context.cwd));
  }
  if (config.terraform?.forbidDestroy) {
    results.push(runAssertion({
      name: "infrastructure.terraform.forbidDestroy",
      command: typeof config.terraform.forbidDestroy === "string"
        ? config.terraform.forbidDestroy
        : "terraform plan -no-color",
      forbidStdoutIncludes: ["-/+", "destroy", "must be replaced"]
    }, context.cwd));
  }
  if (config.pulumi?.requireCleanPreview) {
    results.push(runAssertion({
      name: "infrastructure.pulumi.requireCleanPreview",
      command: typeof config.pulumi.requireCleanPreview === "string"
        ? config.pulumi.requireCleanPreview
        : "pulumi preview --expect-no-changes"
    }, context.cwd));
  }
  if (config.pulumi?.forbidDeletes) {
    results.push(runAssertion({
      name: "infrastructure.pulumi.forbidDeletes",
      command: typeof config.pulumi.forbidDeletes === "string"
        ? config.pulumi.forbidDeletes
        : "pulumi preview",
      forbidStdoutIncludes: ["delete", "replace"]
    }, context.cwd));
  }
  return results;
}

function checkDatabase(config: DatabaseIntegration | undefined, context: CheckContext): CheckResult[] {
  if (!config) {
    return [];
  }
  const results: CheckResult[] = [];
  if (config.prisma?.requireMigrationStatus) {
    results.push(runAssertion({
      name: "database.prisma.requireMigrationStatus",
      command: typeof config.prisma.requireMigrationStatus === "string"
        ? config.prisma.requireMigrationStatus
        : "prisma migrate status"
    }, context.cwd));
  }
  if (config.drizzle?.requireCheckCommand) {
    results.push(runAssertion({
      name: "database.drizzle.requireCheckCommand",
      command: config.drizzle.requireCheckCommand
    }, context.cwd));
  }
  if (config.knex?.requireCurrent) {
    results.push(runAssertion({
      name: "database.knex.requireCurrent",
      command: typeof config.knex.requireCurrent === "string" ? config.knex.requireCurrent : "knex migrate:currentVersion"
    }, context.cwd));
  }
  if (config.requireRecentBackupCommand) {
    results.push(runAssertion({
      name: "database.requireRecentBackup",
      command: config.requireRecentBackupCommand
    }, context.cwd));
  }
  if (config.requireReplicaHealthyCommand) {
    results.push(runAssertion({
      name: "database.requireReplicaHealthy",
      command: config.requireReplicaHealthyCommand
    }, context.cwd));
  }
  return results;
}

function checkDocker(config: DockerIntegration | undefined, context: CheckContext): CheckResult[] {
  if (!config) {
    return [];
  }
  const results: CheckResult[] = [];
  if (config.requireBuild) {
    results.push(runAssertion({ name: "docker.requireBuild", command: config.requireBuild }, context.cwd));
  }
  if (config.requireTag) {
    results.push(runAssertion({ name: "docker.requireTag", command: `docker image inspect ${quote(config.requireTag)}` }, context.cwd));
  }
  if (config.forbidLatestTag && config.requireTag?.endsWith(":latest")) {
    results.push({ name: "docker.forbidLatestTag", ok: false, message: "Docker production tags must not use :latest." });
  }
  return results;
}

function checkKubernetes(config: KubernetesIntegration | undefined, context: CheckContext): CheckResult[] {
  if (!config) {
    return [];
  }
  const results: CheckResult[] = [];
  if (config.requireContext) {
    results.push(runAssertion({
      name: "kubernetes.requireContext",
      command: config.command ?? "kubectl config current-context",
      expectStdoutIncludes: config.requireContext
    }, context.cwd));
  }
  if (config.requireNamespace) {
    results.push(runAssertion({
      name: "kubernetes.requireNamespace",
      command: "kubectl config view --minify --output 'jsonpath={..namespace}'",
      expectStdoutIncludes: config.requireNamespace
    }, context.cwd));
  }
  return results;
}

function checkSentry(config: SentryIntegration | undefined, context: CheckContext): CheckResult[] {
  if (!config) {
    return [];
  }
  return [runAssertion({
    name: "sentry.requireRelease",
    command: config.command ?? `sentry-cli releases info ${quote(config.requireRelease ?? context.git.branch ?? context.action)}`
  }, context.cwd)];
}

function checkNotifications(config: NotificationIntegration | undefined, context: CheckContext): CheckResult[] {
  if (!config) {
    return [];
  }
  const results: CheckResult[] = [];
  if (config.slackWebhookEnv) {
    results.push(postWebhook("notifications.slack", context.env[config.slackWebhookEnv], config.message ?? notificationMessage(context), context.cwd));
  }
  if (config.discordWebhookEnv) {
    results.push(postWebhook("notifications.discord", context.env[config.discordWebhookEnv], config.message ?? notificationMessage(context), context.cwd));
  }
  return results;
}

function checkIncident(config: IncidentIntegration | undefined, context: CheckContext): CheckResult[] {
  if (!config) {
    return [];
  }
  const results: CheckResult[] = [];
  if (config.pagerDutyStatusCommand) {
    results.push(runAssertion({
      name: "incident.pagerDuty",
      command: config.pagerDutyStatusCommand,
      forbidStdoutIncludes: ["triggered", "acknowledged", "incident"]
    }, context.cwd));
  }
  if (config.opsgenieStatusCommand) {
    results.push(runAssertion({
      name: "incident.opsgenie",
      command: config.opsgenieStatusCommand,
      forbidStdoutIncludes: ["open", "acknowledged", "incident"]
    }, context.cwd));
  }
  return results;
}

function checkIssueTracker(config: IssueTrackerIntegration | undefined, context: CheckContext): CheckResult[] {
  if (!config) {
    return [];
  }
  const results: CheckResult[] = [];
  if (config.linear?.requireBranchTicketPattern) {
    results.push(branchPattern("issueTracker.linear", config.linear.requireBranchTicketPattern, context));
  }
  if (config.jira?.requireBranchTicketPattern) {
    results.push(branchPattern("issueTracker.jira", config.jira.requireBranchTicketPattern, context));
  }
  return results;
}

function checkPackageRegistry(config: PackageRegistryIntegration | undefined, context: CheckContext): CheckResult[] {
  if (!config?.npm?.requireVersionNotPublished) {
    return [];
  }
  const packageInfo = readPackage(context.cwd);
  const packageName = config.npm.packageName ?? packageInfo.name;
  const version = config.npm.version ?? packageInfo.version;
  if (!packageName || !version) {
    return [{ name: "packageRegistry.npm", ok: false, message: "npm registry check requires package name and version." }];
  }
  return [invertCommand({
    name: "packageRegistry.npm.requireVersionNotPublished",
    command: `npm view ${quote(`${packageName}@${version}`)} version`,
    message: `npm package version must not already exist: ${packageName}@${version}`
  }, context.cwd)];
}

function checkPayments(config: PaymentsIntegration | undefined, context: CheckContext): CheckResult[] {
  if (!config) {
    return [];
  }
  const results: CheckResult[] = [];
  if (config.stripe?.requireAccountCommand) {
    results.push(runAssertion({ name: "payments.stripe.requireAccount", command: config.stripe.requireAccountCommand }, context.cwd));
  }
  if (config.stripe?.forbidLiveModeEnv) {
    results.push(envNotTruthy("payments.stripe.forbidLiveModeEnv", config.stripe.forbidLiveModeEnv, context));
  }
  if (config.polar?.requireWorkspaceCommand) {
    results.push(runAssertion({ name: "payments.polar.requireWorkspace", command: config.polar.requireWorkspaceCommand }, context.cwd));
  }
  if (config.polar?.forbidProductionEnv) {
    results.push(envNotTruthy("payments.polar.forbidProductionEnv", config.polar.forbidProductionEnv, context));
  }
  return results;
}

function runAssertion(assertion: CommandAssertion, cwd: string): CheckResult {
  const result = runShell(assertion.command, cwd);
  const stdout = result.stdout.trim();
  const stderr = result.stderr.trim();
  const expectedCode = assertion.expectExitCode ?? 0;
  const required = compact(arrayOf(assertion.expectStdoutIncludes));
  const forbidden = compact(arrayOf(assertion.forbidStdoutIncludes));
  const combined = `${stdout}\n${stderr}`;
  const missing = required.filter((value) => !combined.includes(value));
  const presentForbidden = forbidden.filter((value) => combined.includes(value));
  const ok = result.status === expectedCode && missing.length === 0 && presentForbidden.length === 0;

  return {
    name: assertion.name ?? "integration.custom",
    ok,
    message: ok
      ? `Integration check passed: ${assertion.name ?? assertion.command}`
      : `Integration check failed: ${assertion.name ?? assertion.command}`,
    details: compact([
      result.status === expectedCode ? undefined : `exit code ${result.status ?? "unknown"} from ${assertion.command}`,
      missing.length ? `missing output: ${missing.join(", ")}` : undefined,
      presentForbidden.length ? `forbidden output: ${presentForbidden.join(", ")}` : undefined,
      stderr || undefined
    ])
  };
}

function invertCommand(assertion: { name: string; command: string; message: string }, cwd: string): CheckResult {
  const result = runShell(assertion.command, cwd);
  return {
    name: assertion.name,
    ok: result.status !== 0,
    message: result.status !== 0 ? `Integration check passed: ${assertion.name}` : assertion.message
  };
}

function envEquals(name: string, key: string, expected: string, context: CheckContext): CheckResult {
  return {
    name,
    ok: context.env[key] === expected,
    message: context.env[key] === expected
      ? `${key} is ${expected}.`
      : `${key} must be ${expected}; current value is ${context.env[key] ?? "unset"}.`
  };
}

function envNotTruthy(name: string, key: string, context: CheckContext): CheckResult {
  const value = context.env[key];
  const blocked = value === "1" || value === "true" || value === "yes" || value === "live" || value === "production";
  return {
    name,
    ok: !blocked,
    message: blocked ? `${key} must not indicate live or production mode.` : `${key} is not live/production.`
  };
}

function branchPattern(name: string, pattern: string, context: CheckContext): CheckResult {
  const ok = Boolean(context.git.branch && new RegExp(pattern).test(context.git.branch));
  return {
    name,
    ok,
    message: ok
      ? `Branch ${context.git.branch} matches ${pattern}.`
      : `Branch ${context.git.branch ?? "detached HEAD"} must match ${pattern}.`
  };
}

function postWebhook(name: string, webhookUrl: string | undefined, message: string, cwd: string): CheckResult {
  if (!webhookUrl) {
    return { name, ok: false, message: `${name} webhook environment variable is not set.` };
  }
  return runAssertion({
    name,
    command: `curl -fsS -X POST -H 'content-type: application/json' --data ${quote(JSON.stringify({ text: message, content: message }))} ${quote(webhookUrl)}`
  }, cwd);
}

function notificationMessage(context: CheckContext): string {
  return `Tripwire ${context.action} checks passed on ${context.git.branch ?? "unknown branch"}.`;
}

function selectorArg(value: boolean | string): string {
  return typeof value === "string" ? quote(value) : "";
}

function readPackage(cwd: string): { name?: string; version?: string } {
  try {
    return JSON.parse(readFileSync(join(cwd, "package.json"), "utf8")) as { name?: string; version?: string };
  } catch {
    return {};
  }
}

function quote(value: string): string {
  if (/^[A-Za-z0-9_/:=.,@%+-]+$/.test(value)) {
    return value;
  }
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function arrayOf<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function compact(values: Array<string | undefined>): string[] {
  return values.filter((value): value is string => Boolean(value));
}
