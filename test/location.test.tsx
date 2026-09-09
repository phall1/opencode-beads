import { expect, test } from "bun:test";
import { createSignal, onCleanup } from "solid-js";
import { testRender } from "@opentui/solid";
import { DEFAULT_THEME, resolveThemeDocument } from "@opencode/theme/tui";
import type {
  Context,
  PanelInput,
  SlotClaim,
} from "@opencode/plugin/tui/context";
import plugin from "../tui";
import { deferred, issue, result } from "./fixtures";
import type { ListResult } from "../src/beads/schema";

test("session cache miss never queries a fallback; moving the same session aborts and replaces the old workspace", async () => {
  const [session, setSession] = createSignal<{
    location: { directory: string };
  }>();
  const calls: Array<{ directory: string; signal: AbortSignal }> = [];
  const old = deferred<ListResult>();
  let panelSlot!: SlotClaim<"session.panel">;
  const panel: PanelInput = {
    name: "beads.workbench",
    sessionID: "ses-test",
    width: 80,
    presentation: "panel",
    focused: true,
    focus() {},
    close() {},
    toggleFullscreen() {},
  };
  const context = {
    theme: resolveThemeDocument(DEFAULT_THEME),
    location: { directory: "/wrong-default" },
    data: { session: { get: session, sync: async () => {} } },
    keymap: { layer: () => {}, shortcuts: () => [] },
    client: {
      rpc: () => ({
        linked: async () => null,
        list: (
          _query: unknown,
          options: { location: { directory: string }; signal: AbortSignal },
        ) => {
          calls.push({
            directory: options.location.directory,
            signal: options.signal,
          });
          return options.location.directory === "/workspace/A"
            ? old.promise
            : Promise.resolve(result([issue("beta-1")]));
        },
      }),
    },
    ui: {
      format: { path: (path: string) => path },
      toast: { show() {} },
      router: { register: () => () => {} },
      slot: (slot: SlotClaim) => {
        if (slot.append === "session.panel") panelSlot = slot;
        return () => {};
      },
    },
  } as unknown as Context;
  const cleanup = plugin.setup(context);
  const screen = await testRender(
    () => {
      onCleanup(() => {
        if (typeof cleanup === "function") cleanup();
      });
      return panelSlot.render(panel);
    },
    { width: 80, height: 24 },
  );
  try {
    await screen.flush();
    expect(screen.captureCharFrame()).toContain("Loading session workspace");
    expect(calls).toHaveLength(0);
    setSession({ location: { directory: "/workspace/A" } });
    await screen.flush();
    expect(calls[0]?.directory).toBe("/workspace/A");
    setSession({ location: { directory: "/workspace/B" } });
    await screen.waitForFrame((frame) => frame.includes("beta-1"));
    expect(calls[0]?.signal.aborted).toBe(true);
    expect(calls.map((call) => call.directory)).toEqual([
      "/workspace/A",
      "/workspace/B",
    ]);
    old.resolve(result([issue("alpha-1")]));
    await screen.flush();
    expect(screen.captureCharFrame()).toContain("/workspace/B");
    expect(screen.captureCharFrame()).not.toContain("alpha-1");
  } finally {
    screen.renderer.destroy();
  }
  expect(calls[1]?.signal.aborted).toBe(true);
});
