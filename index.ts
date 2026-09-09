import { Plugin } from "@opencode/plugin/effect";
import { Tool } from "@opencode/schema/tool";
import { Effect } from "effect";
import { Beads } from "./rpc";
import { createReader } from "./src/beads/reader";
import { ListQuery, ShowQuery } from "./src/beads/schema";
import { errorMessage } from "./src/text";

export default Plugin.define({
  id: "beads.server",
  effect: (ctx) =>
    Effect.gen(function* () {
      const reader = createReader({ directory: ctx.location.directory });
      yield* ctx.rpc
        .register(Beads, {
          list: (input, call) =>
            reader.list(input).pipe(
              Effect.mapError((error) =>
                call.error("unavailable", error.message, {
                  code: error.code,
                }),
              ),
            ),
          show: (input, call) =>
            reader.show(input.id).pipe(
              Effect.mapError((error) =>
                call.error("unavailable", error.message, {
                  code: error.code,
                }),
              ),
            ),
        })
        .pipe(Effect.orDie);
      yield* ctx.tool.transform((editor) => {
        editor.namespace({
          name: "beads",
          description:
            "Read Beads work in this session's workspace. Browsing does not claim or change issues.",
        });
        editor.add({
          name: "list",
          description:
            "List ready, in-progress, or open beads. Ready uses Beads' dependency-aware scheduling rules. Results are bounded; mayHaveMore signals a potentially incomplete list.",
          input: ListQuery,
          options: { namespace: "beads", codemode: true },
          execute: (input, tool) =>
            Effect.gen(function* () {
              const session = yield* ctx.session.get({
                sessionID: tool.sessionID,
              });
              const result = yield* createReader({
                directory: session.location.directory,
              }).list(input);
              return { content: JSON.stringify(result) };
            }).pipe(
              Effect.mapError(
                (error) => new Tool.Error({ message: errorMessage(error) }),
              ),
            ),
        });
        editor.add({
          name: "show",
          description:
            "Read the full content of a bead by exact ID, including acceptance criteria and dependency references. Does not claim it or mark it last-touched.",
          input: ShowQuery,
          options: { namespace: "beads", codemode: true },
          execute: (input, tool) =>
            Effect.gen(function* () {
              const session = yield* ctx.session.get({
                sessionID: tool.sessionID,
              });
              const issue = yield* createReader({
                directory: session.location.directory,
              }).show(input.id);
              return { content: JSON.stringify(issue) };
            }).pipe(
              Effect.mapError(
                (error) => new Tool.Error({ message: errorMessage(error) }),
              ),
            ),
        });
      });
    }),
});
