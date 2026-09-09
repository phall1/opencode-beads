import { expect, test } from "bun:test";
import { beadEntry } from "../src/workbench/context";
import { issue } from "./fixtures";

test("passive bead context has stable case-sensitive, location-specific keys and preserves all fields", async () => {
  const item = issue("DEMO-1");
  const location = { directory: "/workspace/a" };
  const entry = await beadEntry(item, location);
  expect(entry.key).toMatch(/^[a-z0-9][a-z0-9._-]*$/);
  expect(entry).toEqual(await beadEntry(item, location));
  expect(entry.value.issue).toEqual(item);
  expect((await beadEntry(issue("demo-1"), location)).key).not.toBe(entry.key);
  expect((await beadEntry(item, { directory: "/workspace/b" })).key).not.toBe(
    entry.key,
  );
  expect(
    (await beadEntry(item, { ...location, workspaceID: "ws-b" })).key,
  ).not.toBe(entry.key);
});

test("oversized UTF-8 context becomes an explicit full-lookup reference within the host limit", async () => {
  const entry = await beadEntry(
    { ...issue(), description: "🎉".repeat(3000) },
    { directory: "/workspace/a" },
  );
  expect(
    new TextEncoder().encode(JSON.stringify(entry.value)).length,
  ).toBeLessThanOrEqual(8192);
  expect(entry.value.issue.id).toBe("demo-1");
  expect(entry.value).toHaveProperty("lookup");
  expect(JSON.stringify(entry.value)).toContain("beads_show");
});
