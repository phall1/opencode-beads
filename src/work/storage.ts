import type { Plugin } from "@opencode/plugin/effect";
import { Effect } from "effect";
import { BeadsError } from "../beads/process";
import { StoredWorkLink as WorkLink } from "./schema";

type Location = { directory: string; workspaceID?: string };

function storageCall<A>(operation: string, effect: Effect.Effect<A>) {
  return effect.pipe(
    Effect.catchDefect((cause) =>
      Effect.logError("Beads link storage failed", { operation, cause }).pipe(
        Effect.andThen(
          Effect.fail(
            new BeadsError(
              "handoff_failed",
              `Could not ${operation} the saved Beads link. Retry after storage recovers; existing claims have not been rolled back.`,
            ),
          ),
        ),
      ),
    ),
  );
}

function decode(value: unknown) {
  return Effect.try({
    try: () => WorkLink.parse(value),
    catch: () =>
      new BeadsError(
        "handoff_failed",
        "The saved Beads link could not be decoded. It has been preserved; check the plugin version before continuing.",
      ),
  });
}

/** One record per location and bead; legacy single-link records remain readable. */
export function linkStore(
  storage: Plugin.Context["storage"],
  location: Location,
) {
  const identity = encodeURIComponent(
    JSON.stringify([location.directory, location.workspaceID ?? null]),
  );
  const prefix = (sessionID: string) => `work/v2/${sessionID}/${identity}/`;
  const key = (sessionID: string, id: string) => `${prefix(sessionID)}${id}`;
  const belongs = (link: WorkLink, sessionID: string) =>
    link.sessionID === sessionID &&
    link.directory === location.directory &&
    link.workspaceID === (location.workspaceID ?? null);

  const legacy = Effect.fn("LinkStore.legacy")(function* (sessionID: string) {
    const value = yield* storageCall("read", storage.get(`work/${sessionID}`));
    if (value === undefined) return null;
    const link = yield* decode(value);
    return belongs(link, sessionID) ? link : null;
  });
  const load = Effect.fn("LinkStore.load")(function* (
    sessionID: string,
    id: string,
  ) {
    const value = yield* storageCall("read", storage.get(key(sessionID, id)));
    if (value === undefined) {
      const old = yield* legacy(sessionID);
      return old?.id === id ? old : null;
    }
    const link = yield* decode(value);
    if (!belongs(link, sessionID) || link.id !== id)
      return yield* Effect.fail(
        new BeadsError(
          "handoff_failed",
          "Saved Beads link identity does not match its storage key.",
        ),
      );
    return link;
  });
  const list = Effect.fn("LinkStore.list")(function* (sessionID: string) {
    const links = new Map<string, WorkLink>();
    const old = yield* legacy(sessionID);
    if (old) links.set(old.id, old);
    let after: string | undefined;
    do {
      const page = yield* storageCall(
        "scan",
        storage.scan({ prefix: prefix(sessionID), after, limit: 100 }),
      );
      for (const entry of page.entries) {
        const link = yield* decode(entry.value);
        if (!belongs(link, sessionID) || entry.key !== key(sessionID, link.id))
          return yield* Effect.fail(
            new BeadsError(
              "handoff_failed",
              "Saved Beads link identity does not match its storage key.",
            ),
          );
        links.set(link.id, link);
      }
      after = page.next;
    } while (after);
    return [...links.values()];
  });
  return {
    load,
    list,
    save: (link: WorkLink) =>
      storageCall("save", storage.set(key(link.sessionID, link.id), link)),
    remove: (sessionID: string, id: string) =>
      storageCall("remove", storage.remove(key(sessionID, id))),
  };
}
