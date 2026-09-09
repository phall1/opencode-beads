import { expect, test } from "bun:test";
import { chmod, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Effect } from "effect";
import { scratch } from "../scripts/temp";
import { createRelations } from "../src/beads/relations";
import { issue } from "./fixtures";

test("native relationship reads preserve edge types, missing references, caps, and Ready authority", async () => {
  const directory = await scratch("beads-relations-");
  const executable = join(directory, "bd-relations");
  await writeFile(
    executable,
    `#!${process.execPath}
const args = process.argv.slice(2);
if (!args.includes('--readonly') || !args.includes('--sandbox')) process.exit(9);
const at = args.indexOf('list');
const id = args[at + 1];
const direction = args[args.indexOf('--direction') + 1];
const make = (id, type, status = 'open') => ({id,title:'Title ' + id,priority:1,status,dependency_type:type});
let data = [];
if (direction === 'down' && id === 'demo-root') data = [make('demo-prereq', 'blocks')];
if (direction === 'up' && id === 'demo-root') data = [make('demo-child', 'conditional-blocks'), make('demo-note', 'related')];
if (direction === 'up' && id === 'demo-a') data = [make('a-child', 'blocks')];
if (direction === 'up' && id === 'demo-b') data = [make('b-child-1', 'blocks'), make('b-child-2', 'waits-for'), make('b-note', 'related')];
console.log(JSON.stringify(data));
`,
  );
  await chmod(executable, 0o755);
  const root = {
    ...issue("demo-root"),
    dependencies: [
      {
        depends_on_id: "demo-prereq",
        type: "blocks",
        metadata: '{"hard":true}',
      },
      {
        depends_on_id: "external-missing",
        type: "related",
        metadata: "{}",
      },
    ],
  };
  const ready = [
    { ...issue("demo-a"), priority: 1 },
    { ...issue("demo-b"), priority: 1 },
    { ...issue("demo-p2"), priority: 2 },
  ];
  const relations = createRelations(
    { directory, executable },
    {
      show: () => Effect.succeed(root),
      readyWork: () => Effect.succeed(ready),
    },
  );
  try {
    const graph = await Effect.runPromise(
      relations.graph({ id: root.id, limit: 30 }),
    );
    expect(graph.dependencies).toEqual([
      {
        id: "demo-prereq",
        title: "Title demo-prereq",
        status: "open",
        type: "blocks",
        metadata: '{"hard":true}',
        available: true,
        canInspect: true,
      },
      {
        id: "external-missing",
        title: "Unavailable or external reference",
        status: "unknown",
        type: "related",
        metadata: "{}",
        available: false,
        canInspect: false,
      },
    ]);
    expect(graph.dependents.map((item) => item.type)).toEqual([
      "conditional-blocks",
      "related",
    ]);
    expect(graph.scope).toContain("not Ready eligibility");
    expect(
      (await Effect.runPromise(relations.graph({ id: root.id, limit: 1 })))
        .truncated,
    ).toBe(true);

    const next = await Effect.runPromise(relations.next({ limit: 3 }));
    expect(next.items.map((item) => item.issue.id)).toEqual([
      "demo-b",
      "demo-a",
      "demo-p2",
    ]);
    expect(next.items[0]?.reasons.join(" ")).toContain(
      "2 direct non-closed blocking",
    );
    expect(
      next.items.every((item) => item.reasons[0] === "Observed Ready in Beads"),
    ).toBe(true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
