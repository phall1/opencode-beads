import { expect, test } from "bun:test";
import { Effect } from "effect";
import { createBrief } from "../src/work/brief";
import { BeadsError } from "../src/beads/process";
import type { WorkHost } from "../src/work/service";
import type { StoredWorkLink } from "../src/work/schema";
import { issue } from "./fixtures";

const sessionID = "ses-brief";

function link(id: string, promptID: string): StoredWorkLink {
  return {
    id,
    sessionID,
    directory: "/workspace/demo",
    workspaceID: null,
    actor: `opencode:${sessionID}`,
    promptID,
    prompt: `Work on ${id}`,
    phase: "started",
  };
}

test("work brief restores multiple owned links, budgets every bead, and excludes stale ownership", async () => {
  const links = [
    link("demo-old", "msg-1"),
    link("demo-new", "msg-4"),
    link("demo-closed", "msg-3"),
    link("demo-foreign", "msg-2"),
  ];
  const records = new Map([
    [
      "demo-old",
      {
        ...issue("demo-old", "Older active work"),
        status: "in_progress",
        assignee: `opencode:${sessionID}`,
        acceptance_criteria: "Older acceptance proof",
      },
    ],
    [
      "demo-new",
      {
        ...issue("demo-new", "Most recent active work"),
        status: "in_progress",
        assignee: `opencode:${sessionID}`,
        acceptance_criteria: "Newest acceptance proof",
      },
    ],
    ["demo-closed", { ...issue("demo-closed"), status: "closed" }],
    [
      "demo-foreign",
      { ...issue("demo-foreign"), status: "in_progress", assignee: "other" },
    ],
  ]);
  const host = {
    validate: () => Effect.void,
    list: () => Effect.succeed(links),
  } satisfies Pick<WorkHost, "validate" | "list">;
  const brief = createBrief(
    "/workspace/demo",
    host,
    { show: (id) => Effect.succeed(structuredClone(records.get(id)!)) },
    () => 1_000,
  );

  const result = await Effect.runPromise(brief.read(sessionID, true));
  expect(result.activeIDs).toEqual(["demo-new", "demo-old"]);
  expect(result.text).toContain("Newest acceptance proof");
  expect(result.text).toContain("Older acceptance proof");
  expect(result.text).toContain('"inactive":["demo-closed","demo-foreign"]');
  expect(result.bytes).toBeLessThanOrEqual(8000);
  expect(result.truncated).toBe(false);

  const restored = createBrief("/workspace/demo", host, {
    show: (id) => Effect.succeed(structuredClone(records.get(id)!)),
  });
  expect((await Effect.runPromise(restored.read(sessionID))).activeIDs).toEqual(
    ["demo-new", "demo-old"],
  );
});

test("brief cache is session-isolated, invalidatable, and honest about failed or omitted reads", async () => {
  let reads = 0;
  let now = 100;
  const links = Array.from({ length: 10 }, (_, index) =>
    link(`demo-${index}`, `msg-${index}`),
  );
  const brief = createBrief(
    "/workspace/demo",
    {
      validate: () => Effect.void,
      list: () => Effect.succeed(links),
    },
    {
      show: (id) => {
        reads++;
        if (id === "demo-9")
          return Effect.fail(
            new BeadsError("not_found", "Missing linked bead"),
          );
        return Effect.succeed({
          ...issue(id),
          status: "in_progress",
          assignee: `opencode:${sessionID}`,
          description: "🎉".repeat(3000),
          acceptance_criteria: "proof ".repeat(500),
          dependencies: [
            {
              depends_on_id: "demo-prerequisite",
              type: "related",
              metadata: "x".repeat(9000),
            },
          ],
        });
      },
    },
    () => now,
  );

  const first = await Effect.runPromise(brief.read(sessionID));
  const initialReads = reads;
  await Effect.runPromise(brief.read(sessionID));
  expect(reads).toBe(initialReads);
  expect(first.omitted).toBe(2);
  expect(first.warnings[0]).toContain("Missing linked bead");
  expect(first.bytes).toBeLessThanOrEqual(8000);
  expect(first.truncated).toBe(true);

  await Effect.runPromise(brief.read("ses-other"));
  const afterOther = reads;
  brief.invalidate(sessionID);
  await Effect.runPromise(brief.read("ses-other"));
  expect(reads).toBe(afterOther);
  await Effect.runPromise(brief.read(sessionID));
  expect(reads).toBeGreaterThan(afterOther);
  now += 20_000;
  await Effect.runPromise(brief.read("ses-other"));
  expect(reads).toBeGreaterThan(afterOther + initialReads);
});

test("brief refuses a moved session before resolving location-scoped IDs", async () => {
  let reads = 0;
  const brief = createBrief(
    "/workspace/a",
    {
      validate: () =>
        Effect.fail(new BeadsError("workspace_changed", "Session moved")),
      list: () => Effect.succeed([link("demo-1", "msg-1")]),
    },
    {
      show: () => {
        reads++;
        return Effect.succeed(issue());
      },
    },
  );
  await expect(Effect.runPromise(brief.read(sessionID))).rejects.toMatchObject({
    code: "workspace_changed",
  });
  expect(reads).toBe(0);
});
