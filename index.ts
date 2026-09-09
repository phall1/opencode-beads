import { Plugin } from "@opencode/plugin/effect";
import { Tool } from "@opencode/schema/tool";
import { Effect } from "effect";
import { Beads } from "./rpc";
import { createReader } from "./src/beads/reader";
import { ListQuery, ShowQuery } from "./src/beads/schema";
import { errorMessage } from "./src/text";
import { createClaims } from "./src/beads/claims";
import { createWork } from "./src/work/service";
import { workHost } from "./src/work/opencode";
import { watchLeases } from "./src/work/leases";

export default Plugin.define({
  id: "beads.server",
  effect: (ctx) =>
    Effect.gen(function* () {
      const reader = createReader({ directory: ctx.location.directory });
      const claims = createClaims({ directory: ctx.location.directory });
      const host = workHost(ctx);
      const work = createWork(ctx.location, host, reader, claims);
      const leases = yield* watchLeases(ctx, host, reader, claims);
      yield* ctx.rpc
        .register(Beads, {
          links: (input, call) =>
            work.links(input.sessionID).pipe(
              Effect.mapError((error) =>
                call.error("unavailable", error.message, {
                  code: error.code,
                }),
              ),
            ),
          linked: (input, call) =>
            work.linked(input.sessionID).pipe(
              Effect.mapError((error) =>
                call.error("unavailable", error.message, {
                  code: error.code,
                }),
              ),
            ),
          start: (input, call) =>
            work.start(input).pipe(
              Effect.mapError((error) =>
                call.error("unavailable", error.message, {
                  code: error.code,
                }),
              ),
            ),
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
            "Browse Beads work and explicitly claim a bead for this session. Reads never claim or change issues.",
        });
        editor.add({
          name: "claim",
          description:
            "Atomically claim a Ready bead for this session and durably link it. Mutates assignee/status. Returns the full issue for work in the current agent turn; does not submit another prompt. Never steals another session's claim.",
          input: ShowQuery,
          options: {
            namespace: "beads",
            codemode: true,
            permission: "beads.write",
          },
          execute: (input, tool) =>
            work.claim({ id: input.id, sessionID: tool.sessionID }).pipe(
              Effect.tap(() =>
                Effect.sync(() => leases.activate(tool.sessionID)),
              ),
              Effect.map((result) => ({ content: JSON.stringify(result) })),
              Effect.mapError(
                (error) => new Tool.Error({ message: errorMessage(error) }),
              ),
            ),
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
