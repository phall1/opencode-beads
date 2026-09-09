import { expect, test } from "bun:test";
import type { Plugin } from "@opencode/plugin/effect";
import { Effect, type Schema } from "effect";
import { intelligence } from "../src/work/intelligence";
import { BeadsError } from "../src/beads/process";
import type { RetirableWorkHost } from "../src/work/service";
import type { StoredWorkLink } from "../src/work/schema";
import { issue } from "./fixtures";

type HookEvent = {
  sessionID: string;
  system: Array<{ type: "text"; text: string }>;
};
type ContextHook = (event: HookEvent) => Effect.Effect<void>;

test("the native context hook adds cached, invalidatable work data and stays silent after a move", async () => {
  const sessionID = "ses-context";
  const actor = `opencode:${sessionID}`;
  const link: StoredWorkLink = {
    id: "demo-1",
    sessionID,
    directory: "/workspace/demo",
    workspaceID: null,
    actor,
    promptID: "msg-context",
    prompt: "Work",
    phase: "started",
  };
  let hook: ContextHook | undefined;
  let moved = false;
  let reads = 0;
  const values = new Map<string, Schema.Json>();
  const ctx = {
    location: { directory: link.directory },
    options: {},
    storage: {
      get: (key: string) => Effect.sync(() => values.get(key)),
      set: (key: string, value: Schema.Json) =>
        Effect.sync(() => {
          values.set(key, value);
        }),
      remove: (key: string) =>
        Effect.sync(() => {
          values.delete(key);
        }),
      scan: () => Effect.succeed({ entries: [] }),
    },
    session: {
      hook: (_name: string, callback: ContextHook) =>
        Effect.sync(() => {
          hook = callback;
          return {};
        }),
    },
  } as unknown as Plugin.Context;
  const host: RetirableWorkHost = {
    validate: () =>
      moved
        ? Effect.fail(new BeadsError("workspace_changed", "Moved"))
        : Effect.void,
    load: () => Effect.succeed(link),
    list: () => Effect.succeed([link]),
    save: () => Effect.void,
    remove: () => Effect.void,
    retire: () => Effect.void,
    prompt: () => Effect.void,
  };
  const record = {
    ...issue(),
    status: "in_progress",
    assignee: actor,
    acceptance_criteria: "Context survives compaction",
  };
  const reader = {
    show: () =>
      Effect.sync(() => {
        reads++;
        return record;
      }),
    readyWork: () => Effect.succeed([]),
  };
  const claims = {
    close: () => Effect.void,
  };
  const insights = await Effect.runPromise(
    Effect.scoped(intelligence(ctx, host, reader as never, claims as never)),
  );
  expect(hook).toBeDefined();

  const first: HookEvent = { sessionID, system: [] };
  await Effect.runPromise(hook!(first));
  expect(first.system[0]?.text).toContain("Context survives compaction");
  expect(reads).toBe(1);

  await Effect.runPromise(hook!({ sessionID, system: [] }));
  expect(reads).toBe(1);
  await Effect.runPromise(insights.change(sessionID, Effect.void));
  await Effect.runPromise(hook!({ sessionID, system: [] }));
  expect(reads).toBe(2);

  moved = true;
  const movedEvent: HookEvent = { sessionID, system: [] };
  await Effect.runPromise(hook!(movedEvent));
  expect(movedEvent.system).toEqual([]);
  expect(reads).toBe(2);
});
