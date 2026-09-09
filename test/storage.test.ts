import { expect, test } from "bun:test";
import type { Plugin } from "@opencode/plugin/effect";
import { Cause, Effect, Exit, type Schema } from "effect";
import { linkStore } from "../src/work/storage";
import { workHost } from "../src/work/opencode";
import { createWork, type WorkHost } from "../src/work/service";
import type { StoredWorkLink } from "../src/work/schema";
import { deferred, issue } from "./fixtures";
import { finishStore } from "../src/work/finish-storage";
import type { FinishReceipt } from "../src/work/intelligence-schema";

const link: StoredWorkLink = {
  id: "demo-1",
  sessionID: "ses-storage",
  directory: "/fixture",
  workspaceID: null,
  actor: "opencode:ses-storage",
  phase: "claimed",
  promptID: "msg-original",
  prompt: "Original work",
};

function memory() {
  const values = new Map<string, Schema.Json>();
  const storage: Plugin.Context["storage"] = {
    get: (key) => Effect.sync(() => values.get(key)),
    set: (key, value) =>
      Effect.sync(() => {
        values.set(key, structuredClone(value));
      }),
    remove: (key) =>
      Effect.sync(() => {
        values.delete(key);
      }),
    scan: ({ prefix, after }) =>
      Effect.sync(() => {
        const entries = [...values]
          .filter(([key]) => key.startsWith(prefix) && (!after || key > after))
          .sort(([a], [b]) => a.localeCompare(b));
        const first = entries
          .slice(0, 1)
          .map(([key, value]) => ({ key, value }));
        return {
          entries: first,
          next: entries.length > 1 ? first[0]!.key : undefined,
        };
      }),
  };
  return { values, storage };
}

test("legacy links migrate on write; per-bead records paginate, survive reload and isolate locations", async () => {
  const { values, storage } = memory();
  values.set(`work/${link.sessionID}`, link);
  const store = linkStore(storage, { directory: link.directory });
  expect(await Effect.runPromise(store.load(link.sessionID, link.id))).toEqual(
    link,
  );
  await Effect.runPromise(store.save({ ...link, phase: "started" }));
  await Effect.runPromise(
    store.save({ ...link, id: "demo-2", promptID: "msg-second" }),
  );
  const reloaded = linkStore(storage, { directory: link.directory });
  const links = await Effect.runPromise(reloaded.list(link.sessionID));
  expect(links.map((link) => [link.id, link.phase])).toEqual([
    ["demo-1", "started"],
    ["demo-2", "claimed"],
  ]);
  const moved = linkStore(storage, { directory: "/other" });
  expect(
    await Effect.runPromise(moved.load(link.sessionID, link.id)),
  ).toBeNull();
  await Effect.runPromise(
    moved.save({
      ...link,
      directory: "/other",
      promptID: "msg-other-location",
    }),
  );
  expect(
    (await Effect.runPromise(moved.list(link.sessionID)))[0]?.promptID,
  ).toBe("msg-other-location");
  expect(
    (await Effect.runPromise(reloaded.load(link.sessionID, link.id)))?.promptID,
  ).toBe("msg-original");
  await Effect.runPromise(reloaded.remove(link.sessionID, "demo-2"));
  expect(
    (await Effect.runPromise(reloaded.list(link.sessionID))).map(
      (link) => link.id,
    ),
  ).toEqual(["demo-1"]);
});

test("storage defects are typed at the adapter seam; cancellation stays interruption", async () => {
  const failure = Effect.die(new Error("Storage offline"));
  const storage: Plugin.Context["storage"] = {
    get: () => failure,
    set: () => failure,
    remove: () => failure,
    scan: () => failure,
  };
  const store = linkStore(storage, { directory: link.directory });
  for (const operation of [
    store.load(link.sessionID, link.id),
    store.save(link),
    store.remove(link.sessionID, link.id),
    store.list(link.sessionID),
  ]) {
    await expect(Effect.runPromise(operation)).rejects.toMatchObject({
      code: "handoff_failed",
    });
  }
  const interruptible = linkStore(
    { ...storage, get: () => Effect.never },
    { directory: link.directory },
  );
  const controller = new AbortController();
  const pending = Effect.runPromiseExit(
    interruptible.load(link.sessionID, link.id),
    { signal: controller.signal },
  );
  controller.abort();
  const exit = await pending;
  expect(Exit.isFailure(exit) && Cause.hasInterrupts(exit.cause)).toBe(true);
  const scanFailure = linkStore(
    { ...storage, get: () => Effect.succeed(undefined) },
    { directory: link.directory },
  );
  await expect(
    Effect.runPromise(scanFailure.list(link.sessionID)),
  ).rejects.toMatchObject({ code: "handoff_failed" });
});

test("retirement removes legacy fallback first and preserves a newer claim generation", async () => {
  const { values, storage } = memory();
  const store = linkStore(storage, { directory: link.directory });
  values.set(`work/${link.sessionID}`, link);
  await Effect.runPromise(store.save(link));
  await Effect.runPromise(store.retire(link.sessionID, link.id, link.promptID));
  expect(
    await Effect.runPromise(store.load(link.sessionID, link.id)),
  ).toBeNull();
  expect(values.has(`work/${link.sessionID}`)).toBe(false);

  const newer = { ...link, promptID: "msg-new-generation" };
  await Effect.runPromise(store.save(newer));
  await expect(
    Effect.runPromise(store.retire(link.sessionID, link.id, link.promptID)),
  ).rejects.toMatchObject({ code: "ownership_conflict" });
  expect(
    (await Effect.runPromise(store.load(link.sessionID, link.id)))?.promptID,
  ).toBe(newer.promptID);
});

test("finish receipts survive adapter recreation and stay location-scoped", async () => {
  const { storage } = memory();
  const receipt: FinishReceipt = {
    id: link.id,
    sessionID: link.sessionID,
    directory: link.directory,
    workspaceID: null,
    actor: link.actor,
    promptID: link.promptID,
    evidence: {
      summary: "Completed",
      validation: "Tests passed",
      artifacts: "commit abc",
    },
    reason: "Completion evidence",
    readyBefore: ["demo-existing"],
    phase: "prepared",
  };
  await Effect.runPromise(
    finishStore(storage, { directory: link.directory }).saveReceipt(receipt),
  );
  expect(
    await Effect.runPromise(
      finishStore(storage, { directory: link.directory }).loadReceipt(
        link.sessionID,
        link.id,
      ),
    ),
  ).toEqual(receipt);
  expect(
    await Effect.runPromise(
      finishStore(storage, { directory: "/other" }).loadReceipt(
        link.sessionID,
        link.id,
      ),
    ),
  ).toBeNull();
});

test("a production-adapter storage defect after admission preserves one prompt and claim", async () => {
  const { storage } = memory();
  let fail = true;
  const flaky: Plugin.Context["storage"] = {
    ...storage,
    set: (key, value) =>
      Effect.suspend(() => {
        if (
          fail &&
          typeof value === "object" &&
          value !== null &&
          "phase" in value &&
          value.phase === "started"
        ) {
          fail = false;
          return Effect.die(new Error("Final save failed"));
        }
        return storage.set(key, value);
      }),
  };
  const admitted = new Map<string, string>();
  const ctx = {
    location: { directory: link.directory },
    storage: flaky,
    session: {
      get: () => Effect.succeed({ location: { directory: link.directory } }),
      prompt: ({ id, text }: { id: string; text: string }) =>
        Effect.sync(() => {
          const previous = admitted.get(id);
          if (previous) expect(previous).toBe(text);
          admitted.set(id, text);
        }),
    },
  } as unknown as Plugin.Context;
  let claims = 0;
  let record = { ...issue(), assignee: "" };
  const host = workHost(ctx);
  const reader = {
    show: () => Effect.sync(() => record),
    ready: () => Effect.succeed(true),
  };
  const writer = {
    claim: (_id: string, actor: string) =>
      Effect.sync(() => {
        claims++;
        record = { ...record, assignee: actor, status: "in_progress" };
      }),
  };
  const work = createWork(ctx.location, host, reader, writer);
  const query = { id: record.id, sessionID: link.sessionID };
  await expect(Effect.runPromise(work.start(query))).rejects.toMatchObject({
    code: "handoff_failed",
  });
  await Effect.runPromise(
    createWork(ctx.location, workHost(ctx), reader, writer).start(query),
  );
  expect(claims).toBe(1);
  expect(admitted.size).toBe(1);
});

test("retained legacy storage executor and v2 adapter share one durable prompt", async () => {
  const { storage, values } = memory();
  const entered = deferred<void>();
  const release = deferred<void>();
  const admitted = new Map<string, string>();
  const current: WorkHost = {
    ...linkStore(storage, { directory: link.directory }),
    validate: () => Effect.void,
    prompt: (saved) =>
      Effect.sync(() => {
        const previous = admitted.get(saved.promptID);
        if (previous) expect(previous).toBe(saved.prompt);
        admitted.set(saved.promptID, saved.prompt);
      }),
  };
  // The retained executor uses the actual pre-upgrade session-only storage layout.
  const legacy: WorkHost = {
    ...current,
    load: (sessionID) =>
      Effect.sync(
        () => (values.get(`work/${sessionID}`) as StoredWorkLink) ?? null,
      ),
    save: (saved) => storage.set(`work/${saved.sessionID}`, saved),
    remove: (sessionID) => storage.remove(`work/${sessionID}`),
  };
  let record = { ...issue(), assignee: "" };
  let claims = 0;
  const reader = {
    show: () => Effect.sync(() => record),
    ready: () => Effect.succeed(true),
  };
  const writer = {
    claim: (_id: string, actor: string) =>
      Effect.sync(() => {
        claims++;
        record = { ...record, assignee: actor, status: "in_progress" };
      }),
  };
  const old = createWork({ directory: link.directory }, legacy, reader, {
    claim: (id, actor) =>
      writer
        .claim(id, actor)
        .pipe(
          Effect.andThen(Effect.sync(() => entered.resolve())),
          Effect.andThen(Effect.promise(() => release.promise)),
        ),
  });
  const query = { id: record.id, sessionID: link.sessionID };
  const claiming = Effect.runPromise(old.claim(query));
  await entered.promise;
  const work = createWork(
    { directory: link.directory },
    current,
    reader,
    writer,
  );
  const starting = Effect.runPromise(work.start(query));
  release.resolve();
  await Promise.all([claiming, starting]);
  await Effect.runPromise(old.start(query));
  await Effect.runPromise(work.start(query));
  expect(claims).toBe(1);
  expect(admitted.size).toBe(1);
  expect(
    (await Effect.runPromise(current.list(link.sessionID)))[0]?.phase,
  ).toBe("started");
});
