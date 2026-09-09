import type { Plugin } from "@opencode/plugin/effect";
import { Session } from "@opencode/schema/session";
import { SessionMessage } from "@opencode/schema/session-message";
import { Effect } from "effect";
import { BeadsError } from "../beads/process";
import { errorMessage } from "../text";
import { linkStore } from "./storage";
import type { RetirableWorkHost } from "./service";

export function workHost(ctx: Plugin.Context): RetirableWorkHost {
  return {
    ...linkStore(ctx.storage, ctx.location),
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
