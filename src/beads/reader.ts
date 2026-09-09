import { z } from "zod";
import { Effect } from "effect";
import { Issue, IssueID, ListQuery, type ListResult } from "./schema";
import { BeadsError, runBeads, type ProcessOptions } from "./process";

const Envelope = z.object({
  schema_version: z.literal(1),
  data: z.array(Issue),
  pagination: z.object({ truncated: z.boolean() }).optional(),
});

const flags = ["--readonly", "--sandbox", "--json", "--no-color"];

export function createReader(options: ProcessOptions) {
  const readyWork = () =>
    Effect.tryPromise({
      try: async (signal) => {
        const result = decode(
          await runBeads(
            options,
            [
              ...flags,
              "ready",
              "--brief",
              "--limit",
              "0",
              "--max-rows",
              "10000",
            ],
            signal,
          ),
        );
        if (result.truncated)
          throw new BeadsError(
            "output_limit",
            "Beads returned an incomplete Ready snapshot. No complete-work comparison is available.",
          );
        return result.issues;
      },
      catch: readerFailure,
    });
  return {
    readyWork,
    ready: (input: string) =>
      Effect.tryPromise({
        try: async (signal) => {
          const id = IssueID.parse(input);
          // This bd release explicitly rejects --ready with --id. Scan a bounded,
          // complete Ready set; --max-rows fails rather than silently truncating it.
          const result = decode(
            await runBeads(
              options,
              [
                ...flags,
                "ready",
                "--brief",
                "--limit",
                "0",
                "--max-rows",
                "10000",
              ],
              signal,
            ),
          );
          return result.issues.some((issue) => issue.id === id);
        },
        catch: readerFailure,
      }),
    list: (input: ListQuery) =>
      Effect.tryPromise({
        try: async (signal): Promise<ListResult> => {
          const query = ListQuery.parse(input);
          const args = listArgs(query);
          const result = decode(await runBeads(options, args, signal));
          return {
            issues: result.issues.slice(0, query.limit),
            view: query.view,
            limit: query.limit,
            mayHaveMore:
              result.truncated || result.issues.length >= query.limit,
            directory: options.directory,
          };
        },
        catch: readerFailure,
      }),
    show: (input: string) =>
      Effect.tryPromise({
        try: async (signal): Promise<Issue> => {
          const id = IssueID.parse(input);
          // `bd show --readonly` writes last-touched in Beads 7505e17.
          const args = [
            ...flags,
            "list",
            "--all",
            `--id=${id}`,
            "--limit",
            "1",
            "--no-pager",
          ];
          const result = decode(await runBeads(options, args, signal));
          const issue = result.issues.find((item) => item.id === id);
          if (!issue)
            throw new BeadsError(
              "not_found",
              `Bead ${id} was not found. Refresh the list; it may have moved or been deleted.`,
            );
          return issue;
        },
        catch: readerFailure,
      }),
  };
}

function readerFailure(error: unknown): BeadsError {
  if (error instanceof BeadsError) return error;
  if (error instanceof z.ZodError)
    return new BeadsError(
      "invalid_input",
      "Invalid Beads query. Use a valid ID and a list limit between 1 and 200.",
    );
  return new BeadsError(
    "command_failed",
    "Unable to execute Beads. Check the server workspace and refresh.",
  );
}

function listArgs(query: ListQuery): string[] {
  const filter = query.view === "ready" ? "--ready" : `--status=${query.view}`;
  return [
    ...flags,
    "list",
    filter,
    "--brief",
    "--limit",
    String(query.limit),
    "--sort",
    "priority",
    "--no-pager",
  ];
}

function decode(stdout: string): { issues: Issue[]; truncated: boolean } {
  try {
    const value: unknown = JSON.parse(stdout);
    if (Array.isArray(value))
      return { issues: z.array(Issue).parse(value), truncated: false };
    const envelope = Envelope.parse(value);
    return {
      issues: envelope.data,
      truncated: envelope.pagination?.truncated ?? false,
    };
  } catch {
    throw new BeadsError(
      "invalid_output",
      "Beads returned an unsupported JSON response. Check the supported versions in README.md and update the plugin or bd.",
    );
  }
}
