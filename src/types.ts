export type ForbidEnv = Record<string, string | string[] | boolean>;

export type ConfirmationCondition = {
  databaseMigration?: boolean;
  env?: Record<string, string | string[] | boolean>;
  branch?: string | string[];
  fileChanged?: string | string[];
  message?: string;
};

export type ActionConfig = {
  description?: string;
  command?: string | string[];
  requireCleanGit?: boolean;
  requireBranch?: string | string[];
  requirePassingCommand?: string | string[];
  forbidEnv?: ForbidEnv;
  requireConfirmationIf?: ConfirmationCondition[];
  migrationPatterns?: string[];
  baseBranch?: string;
  integrations?: IntegrationsConfig;
};

export type CommandAssertion = {
  command: string;
  name?: string;
  expectExitCode?: number;
  expectStdoutIncludes?: string | string[];
  forbidStdoutIncludes?: string | string[];
};

export type GithubIntegration = {
  requireCli?: boolean;
  requirePrMerged?: boolean | string;
  requireChecksPassing?: boolean | string;
  requireNoUnresolvedThreads?: boolean | string;
  requireReleaseNotExists?: string;
};

export type DeploymentIntegrations = {
  vercel?: { requireProject?: string; requireTarget?: string; command?: string };
  netlify?: { requireSite?: string; command?: string };
  fly?: { requireApp?: string; command?: string };
  render?: { requireService?: string; command?: string };
};

export type CloudIntegration = {
  aws?: { requireAccountId?: string; requireProfile?: string; command?: string };
  gcp?: { requireProject?: string; command?: string };
  azure?: { requireSubscription?: string; command?: string };
};

export type InfrastructureIntegration = {
  terraform?: { requireCleanPlan?: boolean | string; forbidDestroy?: boolean | string };
  pulumi?: { requireCleanPreview?: boolean | string; forbidDeletes?: boolean | string };
};

export type DatabaseIntegration = {
  prisma?: { requireMigrationStatus?: boolean | string };
  drizzle?: { requireCheckCommand?: string };
  knex?: { requireCurrent?: boolean | string };
  requireRecentBackupCommand?: string;
  requireReplicaHealthyCommand?: string;
};

export type DockerIntegration = {
  requireBuild?: string;
  requireTag?: string;
  forbidLatestTag?: boolean;
};

export type KubernetesIntegration = {
  requireContext?: string;
  requireNamespace?: string;
  command?: string;
};

export type SentryIntegration = {
  requireRelease?: string;
  command?: string;
};

export type NotificationIntegration = {
  slackWebhookEnv?: string;
  discordWebhookEnv?: string;
  message?: string;
};

export type IncidentIntegration = {
  pagerDutyStatusCommand?: string;
  opsgenieStatusCommand?: string;
};

export type IssueTrackerIntegration = {
  linear?: { requireBranchTicketPattern?: string };
  jira?: { requireBranchTicketPattern?: string };
};

export type PackageRegistryIntegration = {
  npm?: { packageName?: string; version?: string; requireVersionNotPublished?: boolean };
};

export type PaymentsIntegration = {
  stripe?: { requireAccountCommand?: string; forbidLiveModeEnv?: string };
  polar?: { requireWorkspaceCommand?: string; forbidProductionEnv?: string };
};

export type IntegrationsConfig = {
  github?: GithubIntegration;
  deployment?: DeploymentIntegrations;
  cloud?: CloudIntegration;
  infrastructure?: InfrastructureIntegration;
  database?: DatabaseIntegration;
  docker?: DockerIntegration;
  kubernetes?: KubernetesIntegration;
  sentry?: SentryIntegration;
  notifications?: NotificationIntegration;
  incident?: IncidentIntegration;
  issueTracker?: IssueTrackerIntegration;
  packageRegistry?: PackageRegistryIntegration;
  payments?: PaymentsIntegration;
  custom?: CommandAssertion[];
};

export type TripwireConfig = {
  actions?: Record<string, ActionConfig>;
  defaults?: ActionConfig;
  migrationPatterns?: string[];
};

export type CliOptions = {
  action: string | undefined;
  configPath: string | undefined;
  command: string[];
  cwd: string;
  yes: boolean;
  noInput: boolean;
  dryRun: boolean;
  databaseMigration: boolean;
  listActions: boolean;
  help: boolean;
  version: boolean;
};

export type CheckResult = {
  name: string;
  ok: boolean;
  message: string;
  details?: string[];
};

export class TripwireError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = "TripwireError";
    this.exitCode = exitCode;
  }
}
