import { Effect } from "effect";
import { BeadsError } from "../beads/process";
import type { Issue } from "../beads/schema";
import type { StoredWorkLink } from "./schema";
import type { RetirableWorkHost } from "./service";
import {
  Evidence,
  FinishQuery,
  type FinishReceipt,
  type FinishResult,
} from "./intelligence-schema";
import { withSessionLock } from "./lock";
import { errorMessage } from "../text";

export interface FinishHost extends Pick<
  RetirableWorkHost,
  "validate" | "load" | "retire"
> {
  loadReceipt(
    sessionID: string,
    id: string,
  ): Effect.Effect<FinishReceipt | null, BeadsError>;
  saveReceipt(receipt: FinishReceipt): Effect.Effect<void, BeadsError>;
  retire(
    sessionID: string,
    id: string,
    promptID: string,
  ): Effect.Effect<void, BeadsError>;
}
export interface FinishReader {
  show(id: string): Effect.Effect<Issue, BeadsError>;
  readyWork(): Effect.Effect<Issue[], BeadsError>;
}
export interface FinishWriter {
  close(
    id: string,
    actor: string,
    reason: string,
  ): Effect.Effect<void, BeadsError>;
}

export function createFinish(
  host: FinishHost,
  reader: FinishReader,
  writer: FinishWriter,
) {
  const prepare = Effect.fn("Finish.prepare")(function* (input: FinishQuery) {
    yield* host.validate(input.sessionID);
    const previous = yield* host.loadReceipt(input.sessionID, input.id);
    const link = yield* host.load(input.sessionID, input.id);
    if (previous && (!link || previous.promptID === link.promptID)) {
      yield* matchEvidence(previous, input.evidence);
      return previous;
    }
    if (!link || link.phase === "claim_pending")
      return yield* Effect.fail(
        new BeadsError(
          "not_claimable",
          "Finish requires a confirmed link owned by this session. Claim the bead first.",
        ),
      );
    yield* checkOwner(yield* reader.show(input.id), link.actor);
    const readyBefore = (yield* reader.readyWork()).map((issue) => issue.id);
    const receipt = newReceipt(link, input.evidence, readyBefore);
    yield* host.saveReceipt(receipt);
    return receipt;
  });
  const close = Effect.fn("Finish.close")(function* (receipt: FinishReceipt) {
    const issue = yield* reader.show(receipt.id);
    if (issue.status === "closed") {
      if (!matchesClose(issue, receipt))
        return yield* Effect.fail(
          new BeadsError(
            "ownership_conflict",
            "This bead was closed with different evidence or ownership. Its completion was preserved.",
          ),
        );
      return issue;
    }
    if (receipt.phase === "closed")
      return yield* Effect.fail(
        new BeadsError(
          "ownership_conflict",
          "This completed bead was reopened. Claim its new work before finishing again.",
        ),
      );
    yield* checkOwner(issue, receipt.actor);
    yield* host.validate(receipt.sessionID);
    yield* writer.close(receipt.id, receipt.actor, receipt.reason);
    const closed = yield* reader.show(receipt.id);
    if (!matchesClose(closed, receipt))
      return yield* Effect.fail(
        new BeadsError(
          "outcome_unknown",
          "Completion could not be confirmed with the submitted evidence. Retry Finish to reconcile.",
        ),
      );
    return closed;
  });
  const complete = Effect.fn("Finish.complete")(function* (input: FinishQuery) {
    const receipt = yield* prepare(input);
    const issue = yield* close(receipt);
    yield* host.validate(input.sessionID);
    yield* host.saveReceipt({ ...receipt, phase: "closed" });
    yield* host.retire(input.sessionID, input.id, receipt.promptID);
    const result: FinishResult = {
      issue,
      evidence: receipt.evidence,
      newlyReady: [],
      warnings: [],
    };
    yield* reader.readyWork().pipe(
      Effect.tap((ready) =>
        Effect.sync(() => {
          const before = new Set(receipt.readyBefore);
          result.newlyReady = ready.filter((item) => !before.has(item.id));
        }),
      ),
      Effect.catch((error) =>
        Effect.sync(() =>
          result.warnings.push(
            `Closed successfully; Ready refresh unavailable: ${errorMessage(error)}`,
          ),
        ),
      ),
    );
    return result;
  });
  return (raw: FinishQuery) =>
    Effect.try({
      try: () => FinishQuery.parse(raw),
      catch: () =>
        new BeadsError(
          "invalid_input",
          "Finish requires a bead ID, summary and validation evidence within the documented limits.",
        ),
    }).pipe(
      Effect.flatMap((input) =>
        withSessionLock(input.sessionID, complete(input)),
      ),
    );
}

function matchesClose(issue: Issue, receipt: FinishReceipt) {
  return (
    issue.status === "closed" &&
    issue.assignee === receipt.actor &&
    issue.close_reason === receipt.reason &&
    issue.closed_by_session === receipt.sessionID
  );
}

function checkOwner(issue: Issue, actor: string) {
  if (issue.status === "in_progress" && issue.assignee === actor)
    return Effect.void;
  return Effect.fail(
    new BeadsError(
      "ownership_conflict",
      `${issue.id} is ${issue.status}, assigned to ${issue.assignee || "nobody"}. Finish did not change it.`,
    ),
  );
}

function matchEvidence(receipt: FinishReceipt, evidence: Evidence) {
  if (JSON.stringify(receipt.evidence) === JSON.stringify(evidence))
    return Effect.void;
  return Effect.fail(
    new BeadsError(
      "invalid_input",
      "A previous Finish saved different evidence. Retry with the original evidence to reconcile its outcome.",
    ),
  );
}

function newReceipt(
  link: StoredWorkLink,
  evidence: Evidence,
  readyBefore: string[],
): FinishReceipt {
  return {
    id: link.id,
    sessionID: link.sessionID,
    directory: link.directory,
    workspaceID: link.workspaceID,
    actor: link.actor,
    promptID: link.promptID,
    evidence,
    readyBefore,
    phase: "prepared",
    reason: [
      `OpenCode completion (${link.promptID})`,
      `Summary: ${evidence.summary}`,
      `Validation: ${evidence.validation}`,
      `Artifacts: ${evidence.artifacts || "None supplied"}`,
    ].join("\n\n"),
  };
}
