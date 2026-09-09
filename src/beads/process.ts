import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { displayText } from "../text";

export type FailureCode =
  | "missing_cli"
  | "missing_workspace"
  | "not_initialized"
  | "timeout"
  | "output_limit"
  | "invalid_output"
  | "invalid_input"
  | "not_found"
  | "command_failed";

export class BeadsError extends Error {
  readonly _tag = "BeadsError";
  constructor(
    readonly code: FailureCode,
    message: string,
  ) {
    super(message);
    this.name = "BeadsError";
  }
}

export interface ProcessOptions {
  directory: string;
  executable?: string;
  timeout?: number;
  maxBuffer?: number;
}

/** No shell expansion; stdout/stderr and process lifetime are bounded. */
export async function runBeads(
  options: ProcessOptions,
  args: string[],
  signal?: AbortSignal,
): Promise<string> {
  signal?.throwIfAborted();
  const workspace = await stat(options.directory).catch(() => undefined);
  if (!workspace?.isDirectory())
    throw new BeadsError(
      "missing_workspace",
      "This workspace directory is unavailable. Reopen the session in an existing checkout, then refresh.",
    );
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    execFile(
      options.executable ?? "bd",
      args,
      {
        cwd: options.directory,
        encoding: "utf8",
        timeout: options.timeout ?? 10_000,
        maxBuffer: options.maxBuffer ?? 4 * 1024 * 1024,
        killSignal: "SIGKILL",
        signal,
        env: {
          ...workspaceEnvironment(),
          BD_DISABLE_METRICS: "1",
          BD_OTEL_ENABLED: "false",
          BD_JSON_ENVELOPE: "1",
          NO_COLOR: "1",
        },
      },
      (error, stdout, stderr) => {
        if (signal?.aborted) return reject(signal.reason);
        if (error) return reject(classifyFailure(error, stderr));
        resolve(stdout);
      },
    );
  });
}

function workspaceEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  // Preserve authentication/backend settings, but never inherit workspace selectors.
  for (const key of [
    "BEADS_DIR",
    "BEADS_DB",
    "BEADS_DATABASE",
    "BEADS_WORKING_DIR",
  ])
    delete env[key];
  return env;
}

function classifyFailure(
  error: Error & { code?: string | number; killed?: boolean },
  stderr: string,
): BeadsError {
  if (error.code === "ENOENT")
    return new BeadsError(
      "missing_cli",
      "Install Beads (bd) on the OpenCode server and ensure it is on PATH.",
    );
  if (error.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER")
    return new BeadsError(
      "output_limit",
      "Beads output exceeded the buffer limit. Reduce the list limit and retry.",
    );
  if (error.killed)
    return new BeadsError(
      "timeout",
      "Beads did not respond within the time limit. Check `bd doctor` in this workspace, then refresh.",
    );
  if (
    /no beads database|not initialized|no \.beads|could not find.*beads/i.test(
      stderr,
    )
  )
    return new BeadsError(
      "not_initialized",
      "This workspace has no Beads database. Run `bd init` in the intended repository, then refresh.",
    );
  return new BeadsError(
    "command_failed",
    `Beads command failed. Check \`bd doctor\` in this workspace. ${displayText(stderr).slice(0, 500)}`,
  );
}
