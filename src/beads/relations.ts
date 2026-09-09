import { Effect } from "effect";
import { z } from "zod";
import { Issue, IssueID } from "./schema";
import { BeadsError, runBeads, type ProcessOptions } from "./process";
import type { createReader } from "./reader";
import {
  GraphQuery,
  NextQuery,
  type Neighborhood,
  type Relation,
  type Recommendations,
} from "./graph-schema";
import { errorMessage } from "../text";

const Neighbor = Issue.extend({ dependency_type: z.string() });
const Rows = z.union([
  z.array(Neighbor),
  z.object({ schema_version: z.literal(1), data: z.array(Neighbor) }),
]);
type Neighbor = z.infer<typeof Neighbor>;

export function createRelations(
  options: ProcessOptions,
  reader: Pick<ReturnType<typeof createReader>, "show" | "readyWork">,
) {
  const neighbors = (id: string, direction: "up" | "down") =>
    Effect.tryPromise({
      try: async (signal) => {
        const stdout = await runBeads(
          { ...options, timeout: 3000, maxBuffer: 1024 * 1024 },
          [
            "--readonly",
            "--sandbox",
            "--json",
            "--no-color",
            "dep",
            "list",
            IssueID.parse(id),
            "--direction",
            direction,
          ],
          signal,
        );
        const decoded = Rows.parse(JSON.parse(stdout));
        return Array.isArray(decoded) ? decoded : decoded.data;
      },
      catch: (error) =>
        error instanceof BeadsError
          ? error
          : new BeadsError(
              "invalid_output",
              "Beads returned unsupported dependency data.",
            ),
    });
  const graph = Effect.fn("Relations.graph")(function* (input: GraphQuery) {
    const query = GraphQuery.parse(input);
    const [issue, down, up] = yield* Effect.all(
      [
        reader.show(query.id),
        neighbors(query.id, "down"),
        neighbors(query.id, "up"),
      ],
      { concurrency: 3 },
    );
    const metadata = new Map(down.map((item) => [item.id, item]));
    const dependencies = issue.dependencies
      .slice(0, query.limit)
      .map((dep) =>
        relation(
          dep.depends_on_id,
          dep.type,
          metadata.get(dep.depends_on_id),
          dep.metadata,
        ),
      );
    const dependents = up
      .slice(0, query.limit)
      .map((item) => relation(item.id, item.dependency_type, item));
    return {
      id: query.id,
      directory: options.directory,
      fetchedAt: new Date().toISOString(),
      dependencies,
      dependents,
      truncated:
        issue.dependencies.length > query.limit || up.length > query.limit,
      scope:
        "Immediate relationships. Unavailable prerequisite references are retained; incoming external references may be absent. Edge types describe relationships, not Ready eligibility.",
    } satisfies Neighborhood;
  });
  const describe = (issue: Issue) =>
    neighbors(issue.id, "up").pipe(
      Effect.map((items) => ({
        issue,
        count: items.filter(
          (item) =>
            item.dependency_type === "blocks" && item.status !== "closed",
        ).length,
        warning: "",
      })),
      Effect.catch((error) =>
        Effect.succeed({
          issue,
          count: 0,
          warning: `${issue.id}: relationship counts unavailable: ${errorMessage(error)}`,
        }),
      ),
    );
  const next = Effect.fn("Relations.next")(function* (input: NextQuery) {
    const query = NextQuery.parse(input);
    const ready = yield* reader.readyWork();
    const candidates = [...ready].sort(priorityOrder).slice(0, 10);
    const described = yield* Effect.forEach(candidates, describe, {
      concurrency: 4,
    });
    const current = yield* reader.readyWork();
    const live = new Map(current.map((issue) => [issue.id, issue]));
    const ranked = described
      .filter((item) => live.has(item.issue.id))
      .sort(
        (a, b) =>
          a.issue.priority - b.issue.priority ||
          b.count - a.count ||
          a.issue.id.localeCompare(b.issue.id),
      );
    return {
      directory: options.directory,
      fetchedAt: new Date().toISOString(),
      readyCount: current.length,
      considered: candidates.length,
      items: ranked.slice(0, query.limit).map((item) => ({
        issue: live.get(item.issue.id)!,
        reasons: [
          "Observed Ready in Beads",
          `Priority P${live.get(item.issue.id)!.priority}`,
          dependencyReason(item),
        ],
      })),
      warnings: [
        ...described.flatMap((item) => (item.warning ? [item.warning] : [])),
        "Ranked within up to 10 priority-first candidates. Relationship counts are advisory; a dependent may have other blockers. Recommendations do not reserve work.",
      ],
    } satisfies Recommendations;
  });
  return { graph, next };
}

function priorityOrder(a: Issue, b: Issue) {
  return a.priority - b.priority || a.id.localeCompare(b.id);
}

function dependencyReason(item: { count: number; warning: string }) {
  if (item.warning) return "Dependency impact unavailable";
  return `${item.count} direct non-closed dependent(s) through blocks edges; not a predicted Ready count`;
}

function relation(
  id: string,
  type: string,
  issue?: Neighbor,
  metadata?: string,
): Relation {
  return {
    id,
    type,
    metadata,
    title: issue?.title ?? "Unavailable or external reference",
    status: issue?.status ?? "unknown",
    available: Boolean(issue),
    canInspect: Boolean(issue) && IssueID.safeParse(id).success,
  };
}
