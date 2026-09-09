import { expect, test } from "bun:test";
import { Effect } from "effect";
import { createLeaseMonitor } from "../src/work/leases";
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
  save: () => Effect.void,
  remove: () => Effect.void,
  prompt: () => Effect.void,
};

test("a saved link is not activity; only live work renews and ownership loss stops renewal", async () => {
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
  owner = link.actor;
  await Effect.runPromise(monitor.renew());
  expect(renewed).toHaveLength(1);
});

test("a terminal event during a slow ownership read prevents the pending heartbeat", async () => {
  const slow = deferred<Issue>();
  let renewals = 0;
  const monitor = createLeaseMonitor(
    host,
    { show: () => Effect.promise(() => slow.promise) },
    {
      heartbeat: () =>
        Effect.sync(() => {
          renewals++;
        }),
    },
  );
  monitor.activate(link.sessionID);
  const pending = Effect.runPromise(monitor.renew());
  monitor.deactivate(link.sessionID);
  slow.resolve({ ...issue(), assignee: link.actor, status: "in_progress" });
  await pending;
  expect(renewals).toBe(0);
});
