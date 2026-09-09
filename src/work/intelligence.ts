import { Effect } from "effect";
import type { Plugin } from "@opencode/plugin/effect";
import { createBrief } from "./brief";
import { createFinish, type FinishHost } from "./finish";
import { finishStore } from "./finish-storage";
import { createRelations } from "../beads/relations";
import type { createReader } from "../beads/reader";
import type { createClaims } from "../beads/claims";
import { boundedText, errorMessage } from "../text";

export function intelligence(
  ctx: Plugin.Context,
  host: Omit<FinishHost, "loadReceipt" | "saveReceipt"> & {
    list: Parameters<typeof createBrief>[1]["list"];
  },
  reader: ReturnType<typeof createReader>,
  claims: ReturnType<typeof createClaims>,
) {
  return Effect.gen(function* () {
    const brief = createBrief(ctx.location.directory, host, reader);
    const finish = createFinish(
      { ...host, ...finishStore(ctx.storage, ctx.location) },
      reader,
      claims,
    );
    const relations = createRelations(
      { directory: ctx.location.directory },
      reader,
    );
    if (ctx.options.autoContext !== false)
      yield* ctx.session.hook("context", (event) =>
        brief.read(event.sessionID).pipe(
          Effect.tap((result) =>
            Effect.sync(() => {
              if (result.text)
                event.system.push({ type: "text", text: result.text });
            }),
          ),
          Effect.catch((error) =>
            Effect.sync(() => {
              if ("code" in error && error.code === "workspace_changed") return;
              event.system.push({
                type: "text",
                text: `BEADS WORK BRIEF UNAVAILABLE: ${boundedText(errorMessage(error), 500)}. Use beads_context to retry; do not infer that tracked work is complete.`,
              });
            }),
          ),
          Effect.asVoid,
        ),
      );
    const change = <A, E>(sessionID: string, operation: Effect.Effect<A, E>) =>
      Effect.sync(() => brief.invalidate(sessionID)).pipe(
        Effect.andThen(operation),
        Effect.ensuring(Effect.sync(() => brief.invalidate(sessionID))),
      );
    return {
      brief: (sessionID: string) => brief.read(sessionID, true),
      ...relations,
      finish: (input: Parameters<typeof finish>[0]) =>
        change(input.sessionID, finish(input)),
      change,
    };
  });
}
