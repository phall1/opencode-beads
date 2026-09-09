import type { Plugin } from "@opencode/plugin/effect";
import { Session } from "@opencode/schema/session";
import { SessionMessage } from "@opencode/schema/session-message";
import { Effect } from "effect";
import { BeadsError } from "../beads/process";
import { errorMessage } from "../text";
import { StoredWorkLink as WorkLink } from "./schema";
import type { WorkHost } from "./service";

export function workHost(ctx: Plugin.Context): WorkHost {
  const key = (sessionID: string) => `work/${sessionID}`;
  return {
    validate: (sessionID) =>
      ctx.session.get({ sessionID: Session.ID.make(sessionID) }).pipe(
        Effect.mapError(
          (error) => new BeadsError("workspace_changed", errorMessage(error)),
        ),
        Effect.flatMap((session) => {
          if (
            session.location.directory === ctx.location.directory &&
            session.location.workspaceID === ctx.location.workspaceID
          )
            return Effect.void;
          return Effect.fail(
            new BeadsError(
              "workspace_changed",
              "Session workspace changed. Reopen Beads in the session before claiming or starting work.",
            ),
          );
        }),
      ),
    load: (sessionID) =>
      ctx.storage.get(key(sessionID)).pipe(
        Effect.flatMap((value) => {
          if (value === undefined) return Effect.succeed(null);
          const result = WorkLink.safeParse(value);
          if (result.success) {
            if (
              result.data.directory !== ctx.location.directory ||
              result.data.workspaceID !== (ctx.location.workspaceID ?? null)
            )
              return Effect.fail(
                new BeadsError(
                  "workspace_changed",
                  `This session's bead is linked to ${result.data.directory}. Return to that workspace or use another session.`,
                ),
              );
            return Effect.succeed(result.data);
          }
          return Effect.fail(
            new BeadsError(
              "handoff_failed",
              "The saved Beads session link could not be decoded. It has been preserved; check the plugin version before continuing.",
            ),
          );
        }),
      ),
    save: (link) => ctx.storage.set(key(link.sessionID), link),
    remove: (sessionID) => ctx.storage.remove(key(sessionID)),
    prompt: (link) =>
      ctx.session
        .prompt({
          sessionID: Session.ID.make(link.sessionID),
          id: SessionMessage.ID.make(link.promptID),
          text: link.prompt,
          delivery: "queue",
          resume: true,
          metadata: {
            beads: {
              id: link.id,
              actor: link.actor,
              directory: link.directory,
            },
          },
        })
        .pipe(
          Effect.asVoid,
          Effect.mapError(
            (error) =>
              new BeadsError(
                "handoff_failed",
                `The bead remains claimed. Start again to retry the same work prompt without duplicating it. ${errorMessage(error)}`,
              ),
          ),
        ),
  };
}
