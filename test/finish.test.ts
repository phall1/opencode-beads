import { expect, test } from "bun:test";
import { Effect } from "effect";
import { BeadsError } from "../src/beads/process";
import { createFinish } from "../src/work/finish";
import type { FinishReceipt } from "../src/work/intelligence-schema";
import type { StoredWorkLink } from "../src/work/schema";
import { issue } from "./fixtures";

const sessionID = "ses-finish";
const actor = `opencode:${sessionID}`;
const evidence = {
  summary: "Implemented finish workflow",
  validation: "bun test passed",
  artifacts: "commit abc123",
};

function rig() {
  let current = {
    ...issue("demo-work", "Finish linked work"),
    status: "in_progress",
    assignee: actor,
  };
  let savedLink: StoredWorkLink | null = {
    id: current.id,
    sessionID,
    directory: "/workspace/demo",
    workspaceID: null,
    actor,
    promptID: "msg-generation-1",
    prompt: "Work",
    phase: "started",
  };
  let receipt: FinishReceipt | null = null;
  let ready = [issue("demo-existing")];
  let closes = 0;
  let uncertain = false;
  let mutateBeforeClose: (() => void) | undefined;
  const host = {
    validate: () => Effect.void,
    load: () => Effect.succeed(savedLink),
    loadReceipt: () => Effect.succeed(receipt),
    saveReceipt: (value: FinishReceipt) =>
      Effect.sync(() => {
        receipt = structuredClone(value);
      }),
    retire: (_sessionID: string, _id: string, promptID: string) =>
      Effect.sync(() => {
        if (savedLink?.promptID === promptID) savedLink = null;
      }),
  };
  const reader = {
    show: () => Effect.sync(() => structuredClone(current)),
    readyWork: () =>
      Effect.sync(() => {
        mutateBeforeClose?.();
        mutateBeforeClose = undefined;
        return structuredClone(ready);
      }),
  };
  const writer = {
    close: (_id: string, owner: string, ownerSession: string, reason: string) =>
      Effect.gen(function* () {
        closes++;
        current = {
          ...current,
          status: "closed",
          assignee: owner,
          close_reason: reason,
          closed_by_session: ownerSession,
        };
        ready = [...ready, issue("demo-newly-ready")];
        if (uncertain) {
          uncertain = false;
          return yield* Effect.fail(
            new BeadsError("timeout", "Close response lost"),
          );
        }
      }),
  };
  return {
    finish: createFinish(host, reader, writer),
    host,
    state: () => ({ current, savedLink, receipt, closes }),
    loseCloseResponse: () => {
      uncertain = true;
    },
    changeBeforeClose: (change: () => void) => {
      mutateBeforeClose = change;
    },
    reassign: (owner: string) => {
      current = { ...current, assignee: owner };
    },
  };
}

test("finish retains evidence, verifies closure, retires only its link, and reveals newly Ready work", async () => {
  const test = rig();
  const input = { id: "demo-work", sessionID, evidence };
  const result = await Effect.runPromise(test.finish(input));
  expect(result.newlyReady.map((item) => item.id)).toEqual([
    "demo-newly-ready",
  ]);
  expect(result.issue.close_reason).toContain(evidence.validation);
  expect(result.issue.closed_by_session).toBe(sessionID);
  expect(test.state().receipt?.phase).toBe("closed");
  expect(test.state().savedLink).toBeNull();
  expect(test.state().closes).toBe(1);

  await Effect.runPromise(test.finish(input));
  expect(test.state().closes).toBe(1);
  await expect(
    Effect.runPromise(
      test.finish({
        ...input,
        evidence: { ...evidence, summary: "Different retry evidence" },
      }),
    ),
  ).rejects.toMatchObject({ code: "invalid_input" });
});

test("a lost close response reconciles the persisted reason without repeating the mutation", async () => {
  const test = rig();
  const input = { id: "demo-work", sessionID, evidence };
  test.loseCloseResponse();
  await expect(Effect.runPromise(test.finish(input))).rejects.toMatchObject({
    code: "timeout",
  });
  expect(test.state().receipt?.phase).toBe("prepared");
  expect(test.state().current.status).toBe("closed");
  await Effect.runPromise(test.finish(input));
  expect(test.state().closes).toBe(1);
  expect(test.state().receipt?.phase).toBe("closed");
});

test("finish checks live ownership before preparing and immediately before close", async () => {
  const foreign = rig();
  foreign.reassign("opencode:ses-other");
  await expect(
    Effect.runPromise(foreign.finish({ id: "demo-work", sessionID, evidence })),
  ).rejects.toMatchObject({ code: "ownership_conflict" });
  expect(foreign.state().receipt).toBeNull();
  expect(foreign.state().closes).toBe(0);

  const raced = rig();
  raced.changeBeforeClose(() => raced.reassign("opencode:ses-other"));
  await expect(
    Effect.runPromise(raced.finish({ id: "demo-work", sessionID, evidence })),
  ).rejects.toMatchObject({ code: "ownership_conflict" });
  expect(raced.state().receipt?.phase).toBe("prepared");
  expect(raced.state().closes).toBe(0);
});
