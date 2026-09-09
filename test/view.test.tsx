import { afterEach, expect, test } from "bun:test";
import { testRender, useKeyboard } from "@opentui/solid";
import { createSignal, onCleanup } from "solid-js";
import { DEFAULT_THEME, resolveThemeDocument } from "@opencode/theme/tui";
import type { Context, KeymapLayer } from "@opencode/plugin/tui/context";
import { WorkbenchView } from "../src/workbench/view";
import type { Reader } from "../src/workbench/model";
import { deferred, issue, result } from "./fixtures";
import type { ListResult } from "../src/beads/schema";
import type { WorkActions } from "../src/workbench/work-actions";
import type { WorkLink } from "../src/work/schema";
import { BoxRenderable, type ScrollBoxRenderable } from "@opentui/core";

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

async function render(
  reader: Reader,
  width = 80,
  work?: WorkActions,
  height = 24,
) {
  const layers = new Set<() => KeymapLayer>();
  const pending: Promise<unknown>[] = [];
  const [focused, setFocused] = createSignal(true);
  const attached: string[] = [];
  const alerts: string[] = [];
  const prompts: string[] = [];
  let host: BoxRenderable;
  // Only the host methods this view consumes. The source is checked against the full SDK.
  const context = {
    theme: resolveThemeDocument(DEFAULT_THEME),
    keymap: {
      shortcuts: () => [],
      layer: (factory: () => KeymapLayer) => {
        layers.add(factory);
        onCleanup(() => layers.delete(factory));
      },
    },
    ui: {
      format: { path: (path: string) => path },
      toast: { show: () => {} },
      dialog: {
        alert: async ({ message }: { message: string }) => {
          alerts.push(message);
        },
        prompt: async () => prompts.shift(),
        select: async <Value,>({
          options,
        }: {
          options: Array<{ value: Value }>;
        }) => options[0]?.value,
      },
    },
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
        <box
          id="host-panel"
          ref={(node) => {
            host = node;
          }}
          focusable
          flexGrow={1}
          onMouseDown={() => {
            setFocused(true);
            host.focus();
          }}
        >
          <WorkbenchView
            context={context}
            reader={reader}
            directory="/workspace/demo"
            focused={focused()}
            work={work}
            close={() => {}}
            attach={async (item) => {
              attached.push(item.id);
            }}
          />
        </box>
      );
    },
    { width, height, kittyKeyboard: true },
  );
  cleanups.push(() => screen.renderer.destroy());
  async function key(value: string) {
    screen.mockInput.pressKey(value);
    await Promise.all(pending.splice(0));
    await screen.flush();
  }
  async function click(id: string) {
    const target = screen.renderer.root.findDescendantById(id)!;
    expect(target).toBeDefined();
    await screen.mockMouse.click(target.x + 1, target.y);
    await screen.flush();
  }
  return {
    ...screen,
    attached,
    alerts,
    prompts,
    key,
    click,
    setFocused,
    focused,
    layers,
  };
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
  expect(screen.captureCharFrame()).toContain("Keyboard in Beads");
  expect(screen.captureCharFrame()).not.toContain("/ Search loaded results");
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

test("mouse rows and actions work; ancestor focus restores search without stealing a dialog", async () => {
  const issues = [issue(), issue("demo-2", "Mouse-selected bead")];
  const screen = await render({
    list: async () => result(issues),
    show: async (id) => issues.find((item) => item.id === id)!,
  });
  await screen.waitForFrame((frame) => frame.includes("demo-2"));
  await screen.click("bead-row-demo-2");
  await screen.waitForFrame((frame) => frame.includes("Acceptance criteria"));
  await screen.click("beads-attach");
  expect(screen.attached).toEqual(["demo-2"]);
  await screen.click("beads-back");
  await screen.click("beads-search");
  const host = screen.renderer.root.findDescendantById("host-panel")!;
  host.focus();
  await screen.flush();
  expect(screen.renderer.currentFocusedRenderable?.id).toBe(
    "beads-search-input",
  );
  await screen.mockInput.typeText("Mouse-selected");
  await screen.flush();
  expect(screen.captureCharFrame()).toContain("1 shown");
  const dialog = new BoxRenderable(screen.renderer, {
    id: "dialog",
    focusable: true,
  });
  screen.renderer.root.add(dialog);
  dialog.focus();
  await screen.flush();
  expect(screen.renderer.currentFocusedRenderable).toBe(dialog);
  dialog.destroy();
  host.focus();
  await screen.flush();
  expect(screen.renderer.currentFocusedRenderable?.id).toBe(
    "beads-search-input",
  );
  await screen.click("bead-row-demo-2");
  await screen.waitForFrame((frame) => frame.includes("Acceptance criteria"));
  expect(screen.captureCharFrame()).not.toContain("Enter apply");
  await screen.key("a");
  expect(screen.attached).toEqual(["demo-2", "demo-2"]);
});

test("row, search, clear and back clicks acquire ownership before replacing their targets", async () => {
  const screen = await render({
    list: async () => result(),
    show: async () => issue(),
  });
  const composer = new BoxRenderable(screen.renderer, {
    id: "composer",
    focusable: true,
  });
  screen.renderer.root.add(composer);
  const blur = () => {
    screen.setFocused(false);
    composer.focus();
  };
  await screen.waitForFrame((frame) => frame.includes("demo-1"));
  blur();
  await screen.click("bead-row-demo-1");
  await screen.waitForFrame((frame) => frame.includes("Acceptance criteria"));
  expect(screen.focused()).toBe(true);
  expect(screen.renderer.currentFocusedRenderable?.id).toBe("beads-detail");
  blur();
  await screen.click("beads-back");
  expect(screen.focused()).toBe(true);
  blur();
  await screen.click("beads-search");
  expect(screen.focused()).toBe(true);
  expect(screen.renderer.currentFocusedRenderable?.id).toBe(
    "beads-search-input",
  );
  await screen.mockInput.typeText("missing");
  await screen.flush();
  blur();
  await screen.click("beads-clear-search");
  expect(screen.focused()).toBe(true);
  expect(screen.renderer.currentFocusedRenderable?.id).toBe(
    "beads-search-input",
  );
  expect(screen.captureCharFrame()).toContain("1 shown");
});

test("Enter cannot inspect retained selection during loading or after a failed refresh", async () => {
  const refresh = deferred<ListResult>();
  let lists = 0;
  let shows = 0;
  const screen = await render({
    list: () => (++lists === 1 ? Promise.resolve(result()) : refresh.promise),
    show: async () => {
      shows++;
      return issue();
    },
  });
  await screen.waitForFrame((frame) => frame.includes("demo-1"));
  await screen.click("beads-refresh");
  expect(screen.captureCharFrame()).toContain("Loading beads");
  await screen.key("RETURN");
  expect(shows).toBe(0);
  refresh.reject(new Error("Refresh unavailable"));
  await screen.waitForFrame((frame) => frame.includes("Refresh unavailable"));
  await screen.key("RETURN");
  expect(shows).toBe(0);
});

test.each([24, 40])(
  "mouse controls fit a %i-column side panel",
  async (width) => {
    const long = issue(
      `demo-1-${"x".repeat(200)}-ID-END`,
      `${"A long valid title with meaningful words. ".repeat(5)}TITLE-END`,
    );
    const screen = await render(
      { list: async () => result([long]), show: async () => long },
      width,
      {
        links: async () => [],
        start: async () => {
          throw new Error("Unexpected claim");
        },
      },
    );
    const fits = (id: string) => {
      const target = screen.renderer.root.findDescendantById(id)!;
      expect(target.x).toBeGreaterThanOrEqual(0);
      expect(target.x + target.width).toBeLessThanOrEqual(width);
      expect(target.y + target.height).toBeLessThanOrEqual(24);
    };
    await screen.waitForFrame((frame) => frame.includes("demo-1"));
    for (const id of [
      "beads-close",
      "beads-tab-ready",
      "beads-tab-in_progress",
      "beads-tab-open",
      "beads-refresh",
    ])
      fits(id);
    await screen.click(`bead-row-${long.id}`);
    await screen.waitForFrame((frame) => frame.includes("Add context"));
    for (const id of [
      "beads-close",
      "beads-back",
      "beads-attach",
      "beads-start",
      "beads-refresh",
    ])
      fits(id);
    const detail = screen.renderer.root.findDescendantById(
      "beads-detail",
    ) as ScrollBoxRenderable;
    expect(detail.height).toBeGreaterThan(0);
    detail.scrollTo(detail.scrollHeight);
    await screen.flush();
    expect(screen.captureCharFrame()).toContain("ID-END");
    await screen.click("beads-back");
    expect(screen.captureCharFrame()).toContain("1 shown");
  },
);

test("a new pending preview replaces the previous selection's error", async () => {
  const first = deferred<ReturnType<typeof issue>>();
  const second = deferred<ReturnType<typeof issue>>();
  const screen = await render(
    {
      list: async () => result([issue(), issue("demo-2")]),
      show: (id) => (id === "demo-1" ? first.promise : second.promise),
    },
    80,
    undefined,
    36,
  );
  first.reject(new Error("First bead unavailable"));
  await screen.waitForFrame((frame) =>
    frame.includes("First bead unavailable"),
  );
  await screen.key("j");
  expect(screen.captureCharFrame()).toContain("SELECTED · demo-2");
  expect(screen.captureCharFrame()).toContain("Loading preview");
  expect(screen.captureCharFrame()).not.toContain("First bead unavailable");
  second.resolve({ ...issue("demo-2"), description: "New preview loaded" });
  await screen.waitForFrame((frame) => frame.includes("New preview loaded"));
});

test("selection previews cancel old reads and disappear at compact heights", async () => {
  const first = deferred<ReturnType<typeof issue>>();
  const second = deferred<ReturnType<typeof issue>>();
  const calls: Array<{ id: string; signal: AbortSignal }> = [];
  const screen = await render(
    {
      list: async () => result([issue(), issue("demo-2")]),
      show: (id, signal) => {
        calls.push({ id, signal });
        return id === "demo-1" ? first.promise : second.promise;
      },
    },
    80,
    undefined,
    36,
  );
  await screen.waitForFrame((frame) => frame.includes("Loading preview"));
  await screen.key("j");
  expect(calls.map((call) => call.id)).toEqual(["demo-1", "demo-2"]);
  expect(calls[0]!.signal.aborted).toBe(true);
  second.resolve({
    ...issue("demo-2"),
    description: "Current selected preview",
  });
  first.resolve({ ...issue(), description: "Stale preview must not return" });
  await screen.waitForFrame((frame) =>
    frame.includes("Current selected preview"),
  );
  expect(screen.captureCharFrame()).not.toContain("Stale preview");
  screen.resize(24, 24);
  await screen.flush();
  expect(screen.captureCharFrame()).not.toContain("SELECTED");
  expect(calls[1]!.signal.aborted).toBe(true);
});

test("keyboard selection stays visible beyond the first screen of rows", async () => {
  const issues = Array.from({ length: 30 }, (_, i) =>
    issue(`demo-${i}`, `Bead number ${i}`),
  );
  const screen = await render({
    list: async () => result(issues),
    show: async (id) => issues.find((item) => item.id === id)!,
  });
  await screen.waitForFrame((frame) => frame.includes("demo-0"));
  const list = screen.renderer.root.findDescendantById(
    "beads-list",
  ) as ScrollBoxRenderable;
  await screen.mockMouse.scroll(list.x + 1, list.y + 1, "down");
  await screen.flush();
  expect(list.scrollTop).toBeGreaterThan(0);
  for (let i = 0; i < 20; i++) await screen.key("j");
  expect(screen.captureCharFrame()).toContain("Bead number 20");
  await screen.key("RETURN");
  await screen.waitForFrame((frame) => frame.includes("Acceptance criteria"));
  expect(screen.captureCharFrame()).toContain("Bead number 20");
  await screen.key("ESCAPE");
  expect(screen.captureCharFrame()).toContain("Bead number 20");
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

test("Start is explicit, then displays the durable link and refreshes Ready", async () => {
  let started = false;
  const initialLink = deferred<[]>();
  let requests = 0;
  const startedLink = {
    id: "demo-1",
    sessionID: "ses-alpha",
    actor: "opencode:ses-alpha",
    phase: "started" as const,
    directory: "/workspace/demo",
    workspaceID: null,
  };
  const screen = await render(
    {
      list: async () => result(started ? [] : [issue()]),
      show: async () => issue(),
    },
    80,
    {
      links: () =>
        ++requests === 1 ? initialLink.promise : Promise.resolve([startedLink]),
      start: async (id) => {
        started = true;
        return {
          issue: issue(id),
          link: {
            id,
            sessionID: "ses-alpha",
            actor: "opencode:ses-alpha",
            phase: "started",
            directory: "/workspace/demo",
            workspaceID: null,
          },
        };
      },
    },
  );
  await screen.waitForFrame((frame) => frame.includes("demo-1"));
  expect(started).toBe(false);
  screen.mockInput.pressEnter();
  await screen.waitForFrame((frame) => frame.includes("Claim & start"));
  expect(started).toBe(false);
  await screen.key("s");
  initialLink.resolve([]);
  await screen.renderer.idle();
  expect(screen.captureCharFrame()).toContain("Linked: demo-1 · started");
  expect(screen.captureCharFrame()).toContain("Nothing ready");
});

test("detail explains relationships and supports mouse, keyboard, and Back navigation", async () => {
  const issues = [issue(), issue("demo-2", "Related work")];
  const screen = await render(
    {
      list: async () => result(issues),
      show: async (id) => issues.find((item) => item.id === id)!,
      graph: async (id) => ({
        id,
        directory: "/workspace/demo",
        fetchedAt: new Date(0).toISOString(),
        dependencies:
          id === "demo-1"
            ? [
                {
                  id: "demo-2",
                  title: "Related work",
                  status: "open",
                  type: "blocks",
                  available: true,
                  canInspect: true,
                },
              ]
            : [],
        dependents: [],
        truncated: false,
        scope: "Relationships are advisory, not Ready eligibility.",
      }),
    },
    80,
    undefined,
    36,
  );
  await screen.waitForFrame((frame) => frame.includes("demo-1"));
  await screen.key("RETURN");
  await screen.waitForFrame((frame) => frame.includes("Prerequisites"));
  expect(screen.captureCharFrame()).toContain("Related work");
  await screen.click("beads-dependency-0");
  await screen.waitForFrame((frame) =>
    frame.includes("No immediate relationships"),
  );
  expect(screen.captureCharFrame()).toContain("Related work");
  await screen.key("ESCAPE");
  await screen.waitForFrame((frame) => frame.includes("Prerequisites"));
  await screen.key("g");
  await screen.waitForFrame((frame) => frame.includes("Related work"));
  expect(screen.captureCharFrame()).toContain("demo-2");
});

test("session work brief is inspectable and Finish collects explicit evidence", async () => {
  let closed = false;
  let submitted:
    { summary: string; validation: string; artifacts: string } | undefined;
  const linked: WorkLink = {
    id: "demo-1",
    sessionID: "ses-alpha",
    actor: "opencode:ses-alpha",
    phase: "started",
    directory: "/workspace/demo",
    workspaceID: null,
  };
  const screen = await render(
    {
      list: async () => result(closed ? [] : [issue()]),
      show: async () => issue(),
    },
    80,
    {
      links: async () => (closed ? [] : [linked]),
      start: async () => {
        throw new Error("Unexpected start");
      },
      brief: async () => ({
        directory: "/workspace/demo",
        fetchedAt: new Date(0).toISOString(),
        text: "BEADS WORK BRIEF\nActive demo-1",
        bytes: 36,
        truncated: false,
        activeIDs: ["demo-1"],
        omitted: 0,
        warnings: [],
      }),
      finish: async (_id, evidence) => {
        submitted = evidence;
        closed = true;
        return {
          issue: { ...issue(), status: "closed" },
          evidence,
          newlyReady: [issue("demo-2")],
          warnings: [],
        };
      },
    },
  );
  await screen.waitForFrame((frame) => frame.includes("Work brief"));
  await screen.key("b");
  expect(screen.alerts[0]).toContain("Active demo-1");
  await screen.key("RETURN");
  await screen.waitForFrame((frame) => frame.includes("Finish"));
  screen.prompts.push("Built workflow", "bun test passed", "commit abc");
  await screen.key("x");
  expect(submitted).toEqual({
    summary: "Built workflow",
    validation: "bun test passed",
    artifacts: "commit abc",
  });
  expect(screen.captureCharFrame()).toContain("Nothing ready");
});

test("Start refreshes existing links even when the initial collection arrives late", async () => {
  const initial = deferred<WorkLink[]>();
  const first: WorkLink = {
    id: "demo-1",
    sessionID: "ses-alpha",
    actor: "opencode:ses-alpha",
    phase: "started",
    directory: "/workspace/demo",
    workspaceID: null,
  };
  const second = { ...first, id: "demo-2" };
  let started = false;
  let requests = 0;
  const screen = await render(
    {
      list: async () =>
        result(started ? [issue()] : [issue("demo-2"), issue()]),
      show: async (id) => issue(id),
    },
    80,
    {
      links: () =>
        ++requests === 1 ? initial.promise : Promise.resolve([first, second]),
      start: async () => {
        started = true;
        return { issue: issue("demo-2"), link: second };
      },
    },
  );
  await screen.waitForFrame((frame) => frame.includes("demo-2"));
  screen.mockInput.pressEnter();
  await screen.waitForFrame((frame) => frame.includes("Claim & start"));
  await screen.key("s");
  initial.resolve([{ ...first, phase: "claimed" }]);
  await screen.renderer.idle();
  expect(screen.captureCharFrame()).toContain("2 linked beads");
  screen.mockInput.pressEnter();
  await screen.waitForFrame((frame) =>
    frame.includes("Linked: demo-1 · started"),
  );
});
