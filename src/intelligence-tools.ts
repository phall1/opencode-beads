import { Effect } from "effect";
import { z } from "zod";
import type { Plugin } from "@opencode/plugin/effect";
import { Tool } from "@opencode/schema/tool";
import { createReader } from "./beads/reader";
import { createRelations } from "./beads/relations";
import { GraphQuery, NextQuery } from "./beads/graph-schema";
import { FinishQuery } from "./work/intelligence-schema";
import type { intelligence } from "./work/intelligence";
import { errorMessage } from "./text";

type Intelligence = Effect.Success<ReturnType<typeof intelligence>>;
const toolResult = <A, E>(operation: Effect.Effect<A, E>) =>
  operation.pipe(
    Effect.map((result) => ({ content: JSON.stringify(result) })),
    Effect.mapError(
      (error) => new Tool.Error({ message: errorMessage(error) }),
    ),
  );

export function addIntelligenceTools(
  ctx: Plugin.Context,
  insights: Intelligence,
) {
  const relations = (
    sessionID: Parameters<typeof ctx.session.get>[0]["sessionID"],
  ) =>
    ctx.session.get({ sessionID }).pipe(
      Effect.map((session) => {
        const options = { directory: session.location.directory };
        return createRelations(options, createReader(options));
      }),
    );
  return ctx.tool.transform((editor) => {
    editor.add({
      name: "context",
      description:
        "Refresh and inspect the automatic work brief for this session/location. Current owned work, acceptance criteria, notes, dependency references and honest truncation/errors. Read-only; does not submit a model turn.",
      input: z.object({}),
      options: { namespace: "beads", codemode: true },
      execute: (_, tool) => toolResult(insights.brief(tool.sessionID)),
    });
    editor.add({
      name: "graph",
      description:
        "Read a bead's immediate dependencies and dependents with titles, states and recorded edge types. Preserves unavailable outgoing references. Graph relationships do not establish Ready eligibility.",
      input: GraphQuery,
      options: { namespace: "beads", codemode: true },
      execute: (input, tool) =>
        toolResult(
          relations(tool.sessionID).pipe(
            Effect.flatMap((reader) => reader.graph(input)),
          ),
        ),
    });
    editor.add({
      name: "next",
      description:
        "Recommend current Beads Ready work with explicit priority and direct-dependent counts. Limited candidate window is reported; impact is advisory and does not reserve work or imply parallel code-edit safety.",
      input: NextQuery,
      options: { namespace: "beads", codemode: true },
      execute: (input, tool) =>
        toolResult(
          relations(tool.sessionID).pipe(
            Effect.flatMap((reader) => reader.next(input)),
          ),
        ),
    });
    editor.add({
      name: "finish",
      description:
        "Explicitly close this session's linked, owned bead with a summary and validation evidence (optional artifact/commit references). Verify acceptance criteria before calling. Saves evidence, retires the link and returns newly observed Ready work. Retry uncertain outcomes with exactly the same evidence.",
      input: FinishQuery.omit({ sessionID: true }),
      options: {
        namespace: "beads",
        codemode: true,
        permission: "beads.write",
      },
      execute: (input, tool) =>
        toolResult(insights.finish({ ...input, sessionID: tool.sessionID })),
    });
  });
}
