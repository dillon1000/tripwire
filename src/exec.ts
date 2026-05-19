import { spawnSync } from "node:child_process";

export type ExecResult = {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
};

export function runShell(command: string, cwd: string, stdio: "pipe" | "inherit" = "pipe"): ExecResult {
  const result = spawnSync(command, {
    cwd,
    shell: true,
    encoding: "utf8",
    stdio: stdio === "inherit" ? "inherit" : "pipe"
  });

  return {
    status: result.status,
    stdout: typeof result.stdout === "string" ? result.stdout : "",
    stderr: typeof result.stderr === "string" ? result.stderr : "",
    error: result.error
  };
}

export function quoteCommand(args: string[]): string {
  return args.map((arg) => {
    if (/^[A-Za-z0-9_/:=.,@%+-]+$/.test(arg)) {
      return arg;
    }
    return `'${arg.replaceAll("'", "'\\''")}'`;
  }).join(" ");
}
