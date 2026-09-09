import type { Plugin } from "@opencode/plugin/effect";
import { Effect, Schedule, Stream } from "effect";
import type { createReader } from "../beads/reader";
import type { createClaims } from "../beads/claims";
import type { WorkHost } from "./service";

/** Activity is live execution evidence, never inferred from persisted link state. */
export function createLeaseMonitor(
  host: WorkHost,
  reader: Pick<ReturnType<typeof createReader>, "show">,
  claims: Pick<ReturnType<typeof createClaims>, "heartbeat">,
) {
  const active = new Set<string>();
  const renewSession = (sessionID: string) =>
    Effect.gen(function* () {
      yield* host.validate(sessionID);
      const link = yield* host.load(sessionID);
      if (!link || link.phase === "claim_pending") return;
      const issue = yield* reader.show(link.id);
      if (!active.has(sessionID)) return;
      if (issue.assignee !== link.actor || issue.status !== "in_progress") {
        active.delete(sessionID);
        yield* Effect.logWarning("Beads claim lost; heartbeat stopped", {
          sessionID,
          id: link.id,
        });
        return;
      }
      yield* claims.heartbeat(link.id, link.actor);
    }).pipe(
      Effect.catch((error) => {
        if (error.code === "workspace_changed") active.delete(sessionID);
        return Effect.logWarning("Beads heartbeat failed", {
          sessionID,
          code: error.code,
          message: error.message,
        });
      }),
    );
  return {
    activate: (sessionID: string) => {
      active.add(sessionID);
    },
    deactivate: (sessionID: string) => {
      active.delete(sessionID);
    },
    renew: () =>
      Effect.forEach([...active], renewSession, {
        concurrency: 4,
        discard: true,
      }),
  };
}

export function watchLeases(
  ctx: Plugin.Context,
  host: WorkHost,
  reader: ReturnType<typeof createReader>,
  claims: ReturnType<typeof createClaims>,
) {
  return Effect.gen(function* () {
    const monitor = createLeaseMonitor(host, reader, claims);
    yield* ctx.event.subscribe().pipe(
      Stream.runForEach((event) =>
        Effect.sync(() => {
          if (event.location?.directory !== ctx.location.directory) return;
          if (event.type === "session.execution.started")
            monitor.activate(event.data.sessionID);
          if (
            event.type === "session.execution.succeeded" ||
            event.type === "session.execution.failed" ||
            event.type === "session.execution.interrupted"
          )
            monitor.deactivate(event.data.sessionID);
        }),
      ),
      Effect.forkScoped({ startImmediately: true }),
    );
    // Recovers positive activity after a plugin reload on the next primary model call.
    yield* ctx.session.hook("model.request", (event) =>
      Effect.sync(() => {
        if (event.kind === "primary") monitor.activate(event.sessionID);
      }),
    );
    yield* Effect.suspend(monitor.renew).pipe(
      Effect.repeat({ schedule: Schedule.spaced("60 seconds") }),
      Effect.forkScoped,
    );
    return monitor;
  });
}
