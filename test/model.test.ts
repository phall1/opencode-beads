import { expect, test } from "bun:test";
import { createWorkbench } from "../src/workbench/model";
import type { Issue, ListResult } from "../src/beads/schema";
import { deferred, issue, result } from "./fixtures";

test("filter matches title, owner, labels and ID; refresh preserves selection by ID", async () => {
  let page = result([issue(), issue("demo-2", "Ship the workbench")]);
  const model = createWorkbench({
    list: async () => page,
    show: async () => issue(),
  });
  await model.refresh();
  model.select("demo-2");
  page = result([...page.issues].reverse());
  await model.refresh();
  expect(model.state.selectedID).toBe("demo-2");
  model.search("ada ux ship");
  expect(model.visible().map((item) => item.id)).toEqual(["demo-2"]);
  model.search("absent");
  expect(model.visible()).toEqual([]);
  expect(model.state.selectedID).toBeUndefined();
  model.search("demo-1");
  expect(model.state.selectedID).toBe("demo-1");
  model.dispose();
});

test("superseded list and detail completions cannot replace current state", async () => {
  const old = deferred<ListResult>();
  const detail = deferred<Issue>();
  let first = true;
  const model = createWorkbench({
    list: async () => {
      if (first) {
        first = false;
        return old.promise;
      }
      return result();
    },
    show: () => detail.promise,
  });
  const initial = model.refresh();
  await model.refresh("open");
  old.resolve(result([issue("old-1")]));
  await initial;
  expect(model.state.result?.issues[0]?.id).toBe("demo-1");
  const inspect = model.inspect();
  model.back();
  detail.resolve(issue());
  await inspect;
  expect(model.state.detail).toBeUndefined();
  expect(model.state.inspecting).toBe(false);
  model.dispose();
});

test("failed refresh clears old results and surfaces an actionable error", async () => {
  let fail = false;
  const model = createWorkbench({
    list: async () => {
      if (fail) throw { message: "Database offline. Refresh after recovery." };
      return result();
    },
    show: async () => issue(),
  });
  await model.refresh();
  fail = true;
  await model.refresh();
  expect(model.state.phase).toBe("error");
  expect(model.state.result).toBeUndefined();
  expect(model.state.error).toContain("Database offline");
  model.dispose();
});

test("dispose aborts in-flight list requests", async () => {
  let signal: AbortSignal | undefined;
  const pending = deferred<ListResult>();
  const model = createWorkbench({
    list: (_query, current) => {
      signal = current;
      return pending.promise;
    },
    show: async () => issue(),
  });
  const task = model.refresh();
  model.dispose();
  expect(signal?.aborted).toBe(true);
  pending.resolve(result());
  await task;
  expect(model.state.result).toBeUndefined();
});
