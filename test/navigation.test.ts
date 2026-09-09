import { expect, test } from "bun:test";
import type { Context, Destination, Route } from "@opencode/plugin/tui/context";
import { toggleWorkbench, workbenchName } from "../src/workbench/navigation";

test("workbench toggles the current session or home route without closing another session's panel", () => {
  let route: Route = { type: "session", sessionID: "ses-a" };
  let panel: ReturnType<Context["ui"]["panel"]["current"]>;
  let closes = 0;
  const context = {
    ui: {
      router: {
        current: () => route,
        navigate: (next: Destination) => {
          route = next.type === "plugin" ? { ...next, id: "beads.tui" } : next;
        },
      },
      panel: {
        current: () => panel,
        close: () => {
          closes++;
          panel = undefined;
        },
        open: (name: string) => {
          if (route.type !== "session") return false;
          panel = { name, sessionID: route.sessionID };
          return true;
        },
      },
    },
  } as unknown as Context;
  toggleWorkbench(context);
  expect(panel).toEqual({ name: workbenchName, sessionID: "ses-a" });
  toggleWorkbench(context);
  expect(panel).toBeUndefined();
  expect(closes).toBe(1);
  panel = { name: workbenchName, sessionID: "ses-b" };
  toggleWorkbench(context);
  expect(panel?.sessionID).toBe("ses-a");
  expect(closes).toBe(1);
  panel = { name: "other.panel", sessionID: "ses-a" };
  toggleWorkbench(context);
  expect(panel.name).toBe(workbenchName);
  expect(closes).toBe(1);
  route = { type: "home" };
  toggleWorkbench(context);
  expect<Route>(route).toEqual({
    type: "plugin",
    id: "beads.tui",
    name: workbenchName,
  });
  toggleWorkbench(context);
  expect(route).toEqual({ type: "home" });
});
