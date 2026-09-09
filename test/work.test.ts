import { expect, test } from "bun:test";
import { Effect } from "effect";
import { createWork, type WorkHost } from "../src/work/service";
import type { StoredWorkLink } from "../src/work/schema";
import { BeadsError } from "../src/beads/process";
import { issue, deferred } from "./fixtures";

function rig() {
  const links = new Map<string, StoredWorkLink>();
  const admitted = new Map<string, string>();
  let current = issue();
  current.assignee = "";
  let claims = 0;
  let submissions = 0;
  let losePromptResponse = false;
  let claimFailure: "applied" | "unapplied" | "conflict" | undefined;
  let wrongWorkspace = false;
  const host: WorkHost = {
    validate: () =>
      wrongWorkspace
        ? Effect.fail(new BeadsError("workspace_changed", "Workspace moved"))
        : Effect.void,
    load: (id) => Effect.sync(() => links.get(id) ?? null),
    save: (link) =>
      Effect.sync(() => {
        links.set(link.sessionID, structuredClone(link));
      }),
    remove: (id) =>
      Effect.sync(() => {
        links.delete(id);
      }),
    prompt: (link) =>
      Effect.gen(function* () {
        submissions++;
        const previous = admitted.get(link.promptID);
        if (previous !== undefined) expect(link.prompt).toBe(previous);
        admitted.set(link.promptID, link.prompt);
        if (losePromptResponse) {
          losePromptResponse = false;
          return yield* Effect.fail(
            new BeadsError("handoff_failed", "Response lost after admission"),
          );
        }
      }),
  };
  const reader = {
    show: () => Effect.sync(() => structuredClone(current)),
    ready: () => Effect.succeed(true),
  };
  const writer = {
    claim: (_id: string, actor: string) =>
      Effect.gen(function* () {
        claims++;
        if (claimFailure === "conflict")
          return yield* Effect.fail(
            new BeadsError("ownership_conflict", "Owned by another session"),
          );
        if (claimFailure !== "unapplied")
          current = { ...current, assignee: actor, status: "in_progress" };
        if (claimFailure)
          return yield* Effect.fail(
            new BeadsError("timeout", "Outcome unknown"),
          );
      }),
  };
  return {
    host,
    reader,
    writer,
    make: () =>
      createWork({ directory: "/workspace/demo" }, host, reader, writer),
    links,
    admitted,
    counts: () => ({ claims, submissions }),
    losePromptResponse: () => {
      losePromptResponse = true;
    },
    failClaim: (mode: typeof claimFailure) => {
      claimFailure = mode;
    },
    move: () => {
      wrongWorkspace = true;
    },
    changeTitle: () => {
      current.title = "Changed since original submission";
    },
    loseOwnership: () => {
      current.assignee = "another-session";
    },
  };
}

const query = { id: "demo-1", sessionID: "ses-alpha" };

test("concurrent Start clicks claim and submit only once", async () => {
  const test = rig();
  const work = test.make();
  const results = await Promise.all([
    Effect.runPromise(work.start(query)),
    Effect.runPromise(work.start(query)),
  ]);
  expect(results.map((result) => result.link.phase)).toEqual([
    "started",
    "started",
  ]);
  expect(test.counts()).toEqual({ claims: 1, submissions: 1 });
  expect(test.links.get(query.sessionID)?.actor).toBe("opencode:ses-alpha");
});

test("lost prompt response recovers across reload using the exact persisted ID and body", async () => {
  const test = rig();
  test.losePromptResponse();
  await expect(
    Effect.runPromise(test.make().start(query)),
  ).rejects.toMatchObject({ code: "handoff_failed" });
  expect(test.links.get(query.sessionID)?.phase).toBe("claimed");
  test.changeTitle();
  expect((await Effect.runPromise(test.make().start(query))).link.phase).toBe(
    "started",
  );
  expect(test.admitted.size).toBe(1);
  expect(test.counts()).toEqual({ claims: 1, submissions: 2 });
});

test("an uncertain write that landed is reconciled without another claim", async () => {
  const test = rig();
  test.failClaim("applied");
  await expect(
    Effect.runPromise(test.make().start(query)),
  ).rejects.toMatchObject({ code: "outcome_unknown" });
  expect(test.links.get(query.sessionID)?.phase).toBe("claim_pending");
  await Effect.runPromise(test.make().start(query));
  expect(test.counts()).toEqual({ claims: 1, submissions: 1 });
});

test("unconfirmed ownership never triggers a blind mutation replay or a prompt", async () => {
  const test = rig();
  test.failClaim("unapplied");
  await expect(
    Effect.runPromise(test.make().start(query)),
  ).rejects.toMatchObject({ code: "outcome_unknown" });
  await expect(
    Effect.runPromise(test.make().start(query)),
  ).rejects.toMatchObject({ code: "outcome_unknown" });
  expect(test.counts()).toEqual({ claims: 1, submissions: 0 });
});

test("a refused claim releases the pending link without submitting work", async () => {
  const test = rig();
  test.failClaim("conflict");
  await expect(
    Effect.runPromise(test.make().start(query)),
  ).rejects.toMatchObject({ code: "ownership_conflict" });
  expect(test.links.size).toBe(0);
  expect(test.admitted.size).toBe(0);
});

test("moved sessions, a different linked bead, and ownership loss cannot start work", async () => {
  const moved = rig();
  moved.move();
  await expect(
    Effect.runPromise(moved.make().start(query)),
  ).rejects.toMatchObject({ code: "workspace_changed" });
  expect(moved.counts().claims).toBe(0);
  const linked = rig();
  await Effect.runPromise(linked.make().claim(query));
  await expect(
    Effect.runPromise(linked.make().start({ ...query, id: "demo-2" })),
  ).rejects.toMatchObject({ code: "session_linked" });
  linked.loseOwnership();
  await expect(
    Effect.runPromise(linked.make().start(query)),
  ).rejects.toMatchObject({ code: "ownership_conflict" });
  expect(linked.admitted.size).toBe(0);
});

test("agent claim returns context without queueing a second agent prompt", async () => {
  const test = rig();
  const result = await Effect.runPromise(test.make().claim(query));
  expect(result.issue.description).toContain("thoughtful workbench");
  expect(result.link.phase).toBe("claimed");
  expect(test.counts()).toEqual({ claims: 1, submissions: 0 });
});

test("retained old claim executor and new Start share one canonical intent", async () => {
  const r = rig();
  const entered = deferred<void>();
  const release = deferred<void>();
  const old = createWork({ directory: "/workspace/demo" }, r.host, r.reader, {
    claim: (id, actor) =>
      Effect.gen(function* () {
        entered.resolve();
        yield* Effect.promise(() => release.promise);
        yield* r.writer.claim(id, actor);
      }),
  });
  const pending = Effect.runPromise(old.claim(query));
  await entered.promise;
  const current = r.make();
  const starting = Effect.runPromise(current.start(query));
  release.resolve();
  await Promise.all([pending, starting]);
  await Effect.runPromise(current.start(query));
  expect(r.links.get(query.sessionID)?.phase).toBe("started");
  expect(r.admitted.size).toBe(1);
  expect(r.counts()).toEqual({ claims: 1, submissions: 1 });
});

test("location failure after saving intent but before mutation can be retried", async () => {
  const r = rig();
  let validations = 0;
  const host = {
    ...r.host,
    validate: () =>
      Effect.suspend(() => {
        validations++;
        return validations === 2
          ? Effect.fail(
              new BeadsError("workspace_changed", "Moved before write"),
            )
          : Effect.void;
      }),
  };
  const work = createWork(
    { directory: "/workspace/demo" },
    host,
    r.reader,
    r.writer,
  );
  await expect(Effect.runPromise(work.start(query))).rejects.toMatchObject({
    code: "workspace_changed",
  });
  expect(r.links.size).toBe(0);
  expect(r.counts().claims).toBe(0);
  await Effect.runPromise(work.start(query));
  expect(r.counts()).toEqual({ claims: 1, submissions: 1 });
});

test("a delayed operation from the old workspace cannot erase the moved session's link", async () => {
  const r = rig();
  let directory = "/a";
  const entered = deferred<void>();
  const release = deferred<void>();
  const hostAt = (at: string): WorkHost => ({
    ...r.host,
    validate: () =>
      Effect.suspend(() =>
        directory === at
          ? Effect.void
          : Effect.fail(new BeadsError("workspace_changed", "Session moved")),
      ),
  });
  const old = createWork(
    { directory: "/a" },
    hostAt("/a"),
    {
      ...r.reader,
      show: () =>
        Effect.gen(function* () {
          entered.resolve();
          yield* Effect.promise(() => release.promise);
          return yield* r.reader.show();
        }),
    },
    r.writer,
  );
  const pending = Effect.runPromise(old.start(query));
  await entered.promise;
  directory = "/b";
  const current = createWork(
    { directory },
    hostAt(directory),
    r.reader,
    r.writer,
  );
  const starting = Effect.runPromise(current.start(query));
  release.resolve();
  const results = await Promise.allSettled([pending, starting]);
  expect(results.map((result) => result.status)).toEqual([
    "rejected",
    "fulfilled",
  ]);
  expect(r.links.get(query.sessionID)).toMatchObject({
    directory: "/b",
    phase: "started",
  });
  expect(r.counts()).toEqual({ claims: 1, submissions: 1 });
});

test("a failed final storage write retains prompt identity after admission", async () => {
  const r = rig();
  let fail = true;
  const host: WorkHost = {
    ...r.host,
    save: (link) =>
      Effect.suspend(() => {
        if (fail && link.phase === "started") {
          fail = false;
          return Effect.fail(
            new BeadsError("handoff_failed", "Storage unavailable"),
          );
        }
        return r.host.save(link);
      }),
  };
  const work = createWork(
    { directory: "/workspace/demo" },
    host,
    r.reader,
    r.writer,
  );
  await expect(Effect.runPromise(work.start(query))).rejects.toMatchObject({
    code: "handoff_failed",
  });
  expect(r.links.get(query.sessionID)?.phase).toBe("claimed");
  await Effect.runPromise(work.start(query));
  expect(r.admitted.size).toBe(1);
  expect(r.counts().claims).toBe(1);
});
