import { expect, test } from "bun:test";
import { Deferred, Effect, Queue, Stream } from "effect";
import { TestClock } from "effect/testing";
import type { Plugin } from "@opencode/plugin/effect";
import { createLeaseMonitor, watchLeases } from "../src/work/leases";
import { BeadsError } from "../src/beads/process";
import type { WorkHost } from "../src/work/service";
import { issue, deferred } from "./fixtures";
import type { StoredWorkLink } from "../src/work/schema";
import type { Issue } from "../src/beads/schema";

const link: StoredWorkLink = {
  id: "demo-1",
  sessionID: "ses-alpha",
  directory: "/workspace/demo",
  workspaceID: null,
  actor: "opencode:ses-alpha",
  phase: "started",
  promptID: "msg-test",
  prompt: "Work",
};
const host: WorkHost = {
  validate: () => Effect.void,
  load: () => Effect.succeed(link),
  list: () => Effect.succeed([link]),
  save: () => Effect.void,
  remove: () => Effect.void,
  prompt: () => Effect.void,
};

test("a saved link is not activity; only live work and current ownership renew", async () => {
  let owner = link.actor;
  const renewed: string[] = [];
  const monitor = createLeaseMonitor(
    host,
    {
      show: () =>
        Effect.sync(() => ({
          ...issue(),
          assignee: owner,
          status: "in_progress",
        })),
    },
    {
      heartbeat: (id, actor) =>
        Effect.sync(() => {
          renewed.push(`${id}:${actor}`);
        }),
    },
  );
  await Effect.runPromise(monitor.renew());
  expect(renewed).toEqual([]);
  monitor.activate(link.sessionID);
  await Effect.runPromise(monitor.renew());
  expect(renewed).toEqual(["demo-1:opencode:ses-alpha"]);
  owner = "another-session";
  await Effect.runPromise(monitor.renew());
  await Effect.runPromise(monitor.renew());
  expect(renewed).toHaveLength(1);
});

test("renewal reads activity lazily and ended execution cannot revive a pending read", async () => {
  const slow = deferred<Issue>();
  const entered = deferred<void>();
  let renewals = 0;
  const monitor = createLeaseMonitor(
    host,
    {
      show: () =>
        Effect.sync(() => entered.resolve()).pipe(
          Effect.andThen(Effect.promise(() => slow.promise)),
        ),
    },
    {
      heartbeat: () =>
        Effect.sync(() => {
          renewals++;
        }),
    },
  );
  const effect = monitor.renew();
  monitor.activate(link.sessionID);
  const pending = Effect.runPromise(effect);
  await entered.promise;
  monitor.deactivate(link.sessionID);
  monitor.activate(link.sessionID);
  slow.resolve({ ...issue(), assignee: link.actor, status: "in_progress" });
  await pending;
  expect(renewals).toBe(0);
  await Effect.runPromise(monitor.renew());
  expect(renewals).toBe(1);
});

test("a terminal event during a slow ownership read prevents the pending heartbeat", async () => {
  const slow = deferred<Issue>();
  const entered = deferred<void>();
  let renewals = 0;
  const monitor = createLeaseMonitor(
    host,
    {
      show: () =>
        Effect.sync(() => entered.resolve()).pipe(
          Effect.andThen(Effect.promise(() => slow.promise)),
        ),
    },
    {
      heartbeat: () =>
        Effect.sync(() => {
          renewals++;
        }),
    },
  );
  monitor.activate(link.sessionID);
  const pending = Effect.runPromise(monitor.renew());
  await entered.promise;
  monitor.deactivate(link.sessionID);
  slow.resolve({ ...issue(), assignee: link.actor, status: "in_progress" });
  await pending;
  expect(renewals).toBe(0);
});

test("failure or ownership loss on one link does not stop sibling heartbeats", async () => {
  const renewed: string[] = [];
  const monitor = createLeaseMonitor(
    {
      ...host,
      list: () =>
        Effect.succeed([
          link,
          { ...link, id: "demo-2" },
          { ...link, id: "demo-3" },
        ]),
    },
    {
      show: (id) =>
        Effect.succeed({
          ...issue(id),
          assignee: id === "demo-1" ? "another" : link.actor,
          status: "in_progress",
        }),
    },
    {
      heartbeat: (id) =>
        id === "demo-2"
          ? Effect.fail(new BeadsError("command_failed", "Backend failed"))
          : Effect.sync(() => {
              renewed.push(id);
            }),
    },
  );
  monitor.activate(link.sessionID);
  await Effect.runPromise(monitor.renew());
  expect(renewed).toEqual(["demo-3"]);
});

function leaseContext(subscribe: () => Stream.Stream<string, Error>) {
  return {
    location: { directory: link.directory },
    session: { hook: () => Effect.succeed({ dispose: Effect.void }) },
    event: {
      subscribe: () =>
        subscribe().pipe(
          Stream.map((type) => ({
            type,
            location: {
              directory:
                type === "session.execution.succeeded"
                  ? "/other"
                  : link.directory,
            },
            data: { sessionID: link.sessionID },
          })),
        ),
    },
  } as unknown as Plugin.Context;
}

test("subscription loss invalidates activity; scoped reconnect requires fresh evidence", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const first = yield* Queue.unbounded<string, Error>();
      const second = yield* Queue.unbounded<string, Error>();
      let subscriptions = 0;
      let renewals = 0;
      const ctx = leaseContext(() =>
        Stream.suspend(() =>
          Stream.fromQueue(++subscriptions === 1 ? first : second),
        ),
      );
      yield* Effect.scoped(
        Effect.gen(function* () {
          yield* watchLeases(
            ctx,
            host,
            {
              show: () =>
                Effect.succeed({
                  ...issue(),
                  assignee: link.actor,
                  status: "in_progress",
                }),
            },
            {
              heartbeat: () =>
                Effect.sync(() => {
                  renewals++;
                }),
            },
          );
          yield* Queue.offer(first, "session.execution.started");
          yield* TestClock.adjust("60 seconds");
          expect(renewals).toBe(1);
          yield* Queue.fail(first, new Error("Subscription disconnected"));
          yield* TestClock.adjust("5 seconds");
          expect(subscriptions).toBe(2);
          yield* TestClock.adjust("60 seconds");
          expect(renewals).toBe(1);
          yield* Queue.offer(second, "session.execution.started");
          yield* TestClock.adjust("60 seconds");
          expect(renewals).toBe(2);
        }),
      );
      yield* TestClock.adjust("120 seconds");
      expect(renewals).toBe(2);
    }).pipe(Effect.provide(TestClock.layer())),
  );
});

test.each(["unload", "terminal", "disconnect"])(
  "%s interrupts an in-flight heartbeat",
  async (ending) => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const queue = yield* Queue.unbounded<string, Error>();
        const entered = yield* Deferred.make<void>();
        const stopped = yield* Deferred.make<void>();
        let interrupted = false;
        yield* Effect.scoped(
          Effect.gen(function* () {
            yield* watchLeases(
              leaseContext(() => Stream.fromQueue(queue)),
              host,
              {
                show: () =>
                  Effect.succeed({
                    ...issue(),
                    assignee: link.actor,
                    status: "in_progress",
                  }),
              },
              {
                heartbeat: () =>
                  Deferred.succeed(entered, undefined).pipe(
                    Effect.andThen(Effect.never),
                    Effect.ensuring(
                      Effect.sync(() => {
                        interrupted = true;
                      }).pipe(
                        Effect.andThen(Deferred.succeed(stopped, undefined)),
                      ),
                    ),
                  ),
              },
            );
            yield* Queue.offer(queue, "session.execution.started");
            yield* TestClock.adjust("60 seconds");
            yield* Deferred.await(entered);
            if (ending === "terminal")
              yield* Queue.offer(queue, "session.execution.succeeded");
            if (ending === "disconnect")
              yield* Queue.fail(
                queue,
                new Error("Disconnected during heartbeat"),
              );
            if (ending !== "unload") yield* Deferred.await(stopped);
          }),
        );
        expect(interrupted).toBe(true);
      }).pipe(Effect.provide(TestClock.layer())),
    );
  },
);

test.each(["before", "during"])(
  "moving %s renewal invalidates activity until fresh execution",
  async (when) => {
    const slow = deferred<Issue>();
    const entered = deferred<void>();
    let moved = when === "before";
    let heartbeats = 0;
    const monitor = createLeaseMonitor(
      {
        ...host,
        validate: () =>
          Effect.suspend(() =>
            moved
              ? Effect.fail(
                  new BeadsError("workspace_changed", "Session moved"),
                )
              : Effect.void,
          ),
      },
      {
        show: () =>
          Effect.sync(() => entered.resolve()).pipe(
            Effect.andThen(Effect.promise(() => slow.promise)),
          ),
      },
      {
        heartbeat: () =>
          Effect.sync(() => {
            heartbeats++;
          }),
      },
    );
    monitor.activate(link.sessionID);
    const pending = Effect.runPromise(monitor.renew());
    if (when === "during") await entered.promise;
    moved = true;
    slow.resolve({ ...issue(), assignee: link.actor, status: "in_progress" });
    await pending;
    moved = false;
    await Effect.runPromise(monitor.renew());
    expect(heartbeats).toBe(0);
    monitor.activate(link.sessionID);
    await Effect.runPromise(monitor.renew());
    expect(heartbeats).toBe(1);
  },
);
