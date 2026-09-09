import { afterEach, expect, test } from "bun:test";
import { testRender, useKeyboard } from "@opentui/solid";
import { createSignal, onCleanup } from "solid-js";
import { DEFAULT_THEME, resolveThemeDocument } from "@opencode/theme/tui";
import type { Context, KeymapLayer } from "@opencode/plugin/tui/context";
import { WorkbenchView } from "../src/workbench/view";
import type { Reader } from "../src/workbench/model";
import { deferred, issue, result } from "./fixtures";
import type { ListResult } from "../src/beads/schema";

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

async function render(reader: Reader, width = 80) {
  const layers = new Set<() => KeymapLayer>();
  const pending: Promise<unknown>[] = [];
  const [focused, setFocused] = createSignal(true);
  const attached: string[] = [];
  // Only the host methods this view consumes. The source is checked against the full SDK.
  const context = {
    theme: resolveThemeDocument(DEFAULT_THEME),
    keymap: {
      layer: (factory: () => KeymapLayer) => {
        layers.add(factory);
        onCleanup(() => layers.delete(factory));
      },
    },
    ui: { format: { path: (path: string) => path }, toast: { show: () => {} } },
  } as unknown as Context;
  const screen = await testRender(
    () => {
      // A minimal public keymap-contract driver. Native input still goes through OpenTUI.
      useKeyboard((event) => {
        const command = [...layers]
          .map((factory) => factory())
          .filter((layer) => enabled(layer.enabled))
          .flatMap((layer) => layer.commands ?? [])
          .find(
            (command) =>
              command.bind === event.name && enabled(command.enabled),
          );
        if (!command) return;
        event.preventDefault();
        event.stopPropagation();
        pending.push(Promise.resolve(command.run(undefined, event)));
      });
      return (
        <WorkbenchView
          context={context}
          reader={reader}
          directory="/workspace/demo"
          focused={focused()}
          close={() => {}}
          attach={async (item) => {
            attached.push(item.id);
          }}
        />
      );
    },
    { width, height: 24, kittyKeyboard: true },
  );
  cleanups.push(() => screen.renderer.destroy());
  async function key(value: string) {
    screen.mockInput.pressKey(value);
    await Promise.all(pending.splice(0));
    await screen.flush();
  }
  return { ...screen, attached, key, setFocused, layers };
}

function enabled(value: KeymapLayer["enabled"]) {
  return typeof value === "function" ? value() : value !== false;
}

test("native keyboard list → detail → attach; narrow terminal renders useful content", async () => {
  const issues = [issue(), issue("demo-2", "Finish with evidence")];
  const screen = await render(
    {
      list: async () => result(issues),
      show: async (id) => issues.find((item) => item.id === id)!,
    },
    48,
  );
  await screen.waitForFrame((frame) => frame.includes("demo-1"));
  expect(screen.captureCharFrame()).toContain("2 shown");
  screen.mockInput.pressArrow("down");
  await screen.flush();
  screen.mockInput.pressEnter();
  await screen.waitForFrame((frame) => frame.includes("Acceptance criteria"));
  expect(screen.captureCharFrame()).toContain("Finish with evidence");
  expect(screen.captureCharFrame()).toMatch(/BEADS +Your next useful move/);
  expect(screen.captureCharFrame()).toContain("/ Search loaded results");
  await screen.key("a");
  expect(screen.attached).toEqual(["demo-2"]);
  await screen.key("ESCAPE");
  expect(screen.captureCharFrame()).toContain("2 shown");
  await screen.key("r");
  screen.mockInput.pressEnter();
  await screen.waitForFrame((frame) => frame.includes("Acceptance criteria"));
  expect(screen.captureCharFrame()).toContain("Finish with evidence");
  await screen.key("ESCAPE");
  await screen.key("/");
  await screen.mockInput.typeText("ar123-not-a-bead");
  await screen.waitForFrame((frame) => frame.includes("No matches"));
});

test("loading transitions into honest empty state", async () => {
  const pending = deferred<ListResult>();
  const screen = await render({
    list: () => pending.promise,
    show: async () => issue(),
  });
  await screen.flush();
  expect(screen.captureCharFrame()).toContain("Loading beads");
  pending.resolve(result([]));
  await screen.waitForFrame((frame) => frame.includes("Nothing ready"));
  expect(screen.captureCharFrame()).toContain("0 shown");
});

test("backend error is visible instead of an empty queue; refresh recovers", async () => {
  let fail = true;
  const screen = await render({
    list: async () => {
      if (fail) throw new Error("Install Beads (bd) on the OpenCode server.");
      return result();
    },
    show: async () => issue(),
  });
  await screen.waitForFrame((frame) => frame.includes("Install Beads"));
  expect(screen.captureCharFrame()).not.toContain("Nothing ready");
  fail = false;
  await screen.key("r");
  expect(screen.captureCharFrame()).toContain("demo-1");
});

test("blurred panel shortcuts do not run; unmount releases its keymap layers", async () => {
  let lists = 0;
  const screen = await render({
    list: async () => {
      lists++;
      return result();
    },
    show: async () => issue(),
  });
  await screen.waitForFrame((frame) => frame.includes("demo-1"));
  screen.setFocused(false);
  await screen.key("r");
  expect(lists).toBe(1);
  screen.setFocused(true);
  await screen.key("r");
  expect(lists).toBe(2);
  screen.renderer.destroy();
  expect(screen.layers.size).toBe(0);
});
