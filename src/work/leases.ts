import type { Plugin } from "@opencode/plugin/effect";
import { Cause, Deferred, Effect, Schedule, Stream } from "effect";
import type { createReader } from "../beads/reader";
import type { createClaims } from "../beads/claims";
import type { StoredWorkLink } from "./schema";
import type { WorkHost } from "./service";
import type { BeadsError } from "../beads/process";

const reportFailure = (error: BeadsError) =>
  Effect.logWarning("Beads heartbeat failed", {
    code: error.code,
    message: error.message,
  });

/** Live activity tokens invalidate pending reads across terminal events/reconnections. */
export function createLeaseMonitor(
  host: WorkHost,
  reader: Pick<ReturnType<typeof createReader>, "show">,
  claims: Pick<ReturnType<typeof createClaims>, "heartbeat">,
) {
  const active = new Map<string, Deferred.Deferred<void>>();
  let connected = true;
  function deactivate(sessionID: string) {
    const token = active.get(sessionID);
    active.delete(sessionID);
    if (token) Deferred.doneUnsafe(token, Effect.void);
  }
  const sessionFailure = (sessionID: string) => (error: BeadsError) =>
    reportFailure(error).pipe(
      Effect.andThen(
        Effect.sync(() => {
          if (error.code === "workspace_changed") deactivate(sessionID);
        }),
      ),
    );
  const renewLink = Effect.fn("Leases.renewLink")(
    function* (link: StoredWorkLink, token: Deferred.Deferred<void>) {
      if (link.phase === "claim_pending") return;
      const issue = yield* reader.show(link.id);
      yield* host.validate(link.sessionID);
      if (active.get(link.sessionID) !== token) return;
      if (issue.assignee !== link.actor || issue.status !== "in_progress")
        return;
      yield* claims.heartbeat(link.id, link.actor);
    },
    (effect, link) => effect.pipe(Effect.catch(sessionFailure(link.sessionID))),
  );
  const renewSession = Effect.fn("Leases.renewSession")(
    function* ([sessionID, token]: [string, Deferred.Deferred<void>]) {
      yield* host.validate(sessionID);
      const links = yield* host.list(sessionID);
      yield* Effect.forEach(links, (link) => renewLink(link, token), {
        discard: true,
      });
    },
    (effect, [sessionID, token]) =>
      effect.pipe(
        Effect.catch(sessionFailure(sessionID)),
        Effect.raceFirst(Deferred.await(token)),
      ),
  );
  return {
    activate: (sessionID: string) => {
      if (connected && !active.has(sessionID))
        active.set(sessionID, Deferred.makeUnsafe<void>());
    },
    deactivate,
    connection: (available: boolean) => {
      for (const sessionID of active.keys()) deactivate(sessionID);
      connected = available;
    },
    renew: Effect.fn("Leases.renew")(function* () {
      yield* Effect.forEach([...active], renewSession, {
        concurrency: 4,
        discard: true,
      });
    }),
  };
}

export function watchLeases(
  ctx: Plugin.Context,
  host: WorkHost,
  reader: Pick<ReturnType<typeof createReader>, "show">,
  claims: Pick<ReturnType<typeof createClaims>, "heartbeat">,
) {
  return Effect.gen(function* () {
    const monitor = createLeaseMonitor(host, reader, claims);
    monitor.connection(false);
    yield* ctx.session.hook("model.request", (event) =>
      Effect.sync(() => {
        if (event.kind === "primary") monitor.activate(event.sessionID);
      }),
    );
    const consume = () =>
      ctx.event.subscribe().pipe(
        Stream.runForEach((event) =>
          Effect.sync(() => {
            if (
              event.type === "session.execution.succeeded" ||
              event.type === "session.execution.failed" ||
              event.type === "session.execution.interrupted"
            )
              return monitor.deactivate(event.data.sessionID);
            if (event.location?.directory !== ctx.location.directory) return;
            if (event.type === "session.execution.started")
              monitor.activate(event.data.sessionID);
          }),
        ),
        Effect.andThen(
          Effect.fail(new Error("Beads activity subscription ended")),
        ),
      );
    const connected = Effect.gen(function* () {
      monitor.connection(true);
      yield* Effect.all(
        [
          consume(),
          monitor
            .renew()
            .pipe(Effect.repeat({ schedule: Schedule.spaced("60 seconds") })),
        ],
        { concurrency: "unbounded", discard: true },
      );
    }).pipe(
      Effect.ensuring(Effect.sync(() => monitor.connection(false))),
      Effect.tapCause((cause) =>
        Cause.hasInterrupts(cause)
          ? Effect.void
          : Effect.logWarning("Beads activity tracking stopped", { cause }),
      ),
      Effect.retry({ schedule: Schedule.spaced("5 seconds") }),
    );
    yield* connected.pipe(Effect.forkScoped({ startImmediately: true }));
    return monitor;
  });
}
