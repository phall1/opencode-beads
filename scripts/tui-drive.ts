import { execFile } from "node:child_process";
import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import { Effect } from "effect";
import { Llm, OpenCodeDriver } from "opencode-drive";

const plugin = process.env.BEADS_PLUGIN_DIRECTORY ?? resolve("dev-plugin");

function bd(artifacts: string, args: string[]) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !/^(BEADS_|BD_|GIT_|XDG_)/.test(key),
    ),
  );
  return Effect.tryPromise({
    try: (signal) =>
      new Promise<string>((yes, no) => {
        execFile(
          "bd",
          ["--sandbox", ...args],
          {
            cwd: join(artifacts, "files"),
            env: {
              ...env,
              HOME: join(artifacts, "home"),
              BD_DISABLE_METRICS: "1",
              BD_OTEL_ENABLED: "false",
            },
            signal,
            timeout: 30_000,
          },
          (error, stdout, stderr) =>
            error ? no(new Error(stderr || error.message)) : yes(stdout),
        );
      }),
    catch: (error) => error,
  });
}

export default OpenCodeDriver.use(
  {
    project: {
      git: true,
      files: { "README.md": "# Isolated Beads UI fixture\n" },
    },
    config: { autoupdate: false, plugins: [plugin] },
    tui: { viewport: { cols: 130, rows: 42 } },
  },
  ({ ui, llm, artifacts, opencode }) =>
    Effect.gen(function* () {
      const click = (id: string) =>
        ui
          .getElement({ id })
          .pipe(Effect.flatMap((element) => ui.click(element)));
      const command = (title: string) =>
        Effect.gen(function* () {
          yield* ui.press("p", { ctrl: true });
          yield* ui.type(title);
          yield* ui.waitFor(title);
          yield* ui.enter();
        });
      const closed = () =>
        ui.waitFor(
          (state) =>
            !state.elements.some((element) => element.id === "beads-close"),
        );
      const focusPane = (direction: "left" | "right") =>
        Effect.gen(function* () {
          yield* ui.press("x", { ctrl: true });
          yield* ui.arrow(direction);
        });
      const resizePanel = (width: number) =>
        Effect.gen(function* () {
          const panel = yield* ui.getElement({ id: "session-panel" });
          const x = 130 - width - 1;
          yield* ui.mouse({
            action: "down",
            x: panel.x - 1,
            y: panel.y + 1,
            button: "left",
          });
          yield* ui.mouse({ action: "move", x, y: panel.y + 1 });
          yield* ui.mouse({ action: "up", x, y: panel.y + 1, button: "left" });
          yield* ui.waitFor((state) =>
            state.elements.some(
              (element) =>
                element.id === "session-panel" && element.width === width,
            ),
          );
        });
      yield* bd(artifacts, [
        "init",
        "--prefix",
        "drv",
        "--non-interactive",
        "--skip-hooks",
        "--skip-agents",
      ]);
      yield* bd(artifacts, [
        "create",
        "Polish the Beads workbench",
        "--id",
        "drv-ready",
        "--description",
        "Make choosing work feel immediate.\n\nKeep the queue readable, make keyboard focus obvious, and place the next action beside the bead.",
        "--acceptance",
        "Mouse and keyboard agree. Search never steals typing. The workbench stays useful in a narrow panel.",
      ]);
      yield* bd(artifacts, [
        "create",
        "Recover claims after a reload",
        "--id",
        "drv-blocked",
        "--description",
        "Wait for the ready bead",
        "--deps",
        "drv-ready",
      ]);
      yield* command("Toggle Beads workbench");
      yield* ui.waitFor("drv-ready");
      yield* Effect.log(yield* ui.screenshot("beads-home"));
      yield* command("Toggle Beads workbench");
      yield* closed();
      yield* llm.queue(Llm.text("Ready to inspect the Beads fixture."));
      yield* ui.submit("Prepare to inspect work.");
      yield* ui.waitFor("Ready to inspect the Beads fixture.");
      yield* ui.type("/beads");
      yield* ui.waitFor("Toggle Beads workbench");
      yield* Effect.log(yield* ui.screenshot("beads-slash-command"));
      yield* ui.enter();
      yield* ui
        .waitFor("drv-ready")
        .pipe(
          Effect.tapError(() =>
            ui
              .screenshot("beads-loading-failure")
              .pipe(Effect.flatMap(Effect.log)),
          ),
        );
      yield* Effect.log(yield* ui.screenshot("beads-ready"));
      yield* command("Toggle Beads workbench");
      yield* closed();
      yield* ui.submit("/beads");
      yield* ui.waitFor("drv-ready");
      yield* focusPane("left");
      yield* ui.waitFor("Click here to focus Beads");
      yield* ui.submit("/beads");
      yield* closed();
      yield* ui.submit("/beads");
      yield* ui.waitFor("drv-ready");
      yield* click("beads-tab-open");
      yield* ui.waitFor("drv-blocked");
      yield* focusPane("left");
      yield* click("bead-row-drv-blocked");
      yield* ui.waitFor("Wait for the ready bead");
      yield* ui.waitFor("Keyboard in Beads");
      yield* focusPane("left");
      yield* click("beads-back");
      yield* click("beads-tab-ready");
      yield* ui.waitFor("drv-ready");
      yield* focusPane("left");
      yield* click("beads-search");
      yield* ui.waitFor((state) =>
        state.elements.some(
          (element) => element.id === "beads-search-input" && element.focused,
        ),
      );
      yield* ui.type("drv-ready");
      yield* focusPane("left");
      yield* focusPane("right");
      yield* focusPane("right");
      yield* ui.waitFor((state) =>
        state.elements.some(
          (element) => element.id === "beads-search-input" && element.focused,
        ),
      );
      yield* ui.type("-missing");
      yield* ui.waitFor("No matches");
      yield* focusPane("left");
      yield* click("beads-clear-search");
      yield* click("bead-row-drv-ready");
      yield* ui.waitFor("Acceptance criteria");
      yield* ui.press("escape");
      yield* ui.getElement({ id: "bead-row-drv-ready" });
      yield* click("beads-fullscreen");
      yield* ui.waitFor((state) =>
        state.elements.some(
          (element) => element.id === "beads-search" && element.width > 100,
        ),
      );
      yield* ui.waitFor("Make choosing work feel immediate.");
      yield* Effect.log(yield* ui.screenshot("beads-fullscreen"));
      yield* ui.waitFor(() =>
        ui.matches("ctrl+x ← conversation").pipe(Effect.map((shown) => !shown)),
      );
      yield* ui.press("f");
      yield* ui.waitFor((state) =>
        state.elements.some(
          (element) => element.id === "beads-search" && element.width < 100,
        ),
      );
      for (const width of [24, 40]) {
        yield* resizePanel(width);
        yield* click("bead-row-drv-ready");
        yield* ui.waitFor("Claim & start");
        const panel = yield* ui.getElement({ id: "session-panel" });
        for (const id of [
          "beads-fullscreen",
          "beads-close",
          "beads-start",
          "beads-attach",
          "beads-work-brief",
          "beads-back",
          "beads-refresh",
        ]) {
          const control = yield* ui.getElement({ id });
          assert.ok(
            control.x >= panel.x &&
              control.x + control.width <= panel.x + panel.width,
            `${id} fits ${width} columns`,
          );
          assert.ok(
            control.y + control.height <= panel.y + panel.height,
            `${id} stays visible`,
          );
        }
        yield* Effect.log(yield* ui.screenshot(`beads-panel-${width}`));
        yield* click("beads-back");
      }
      yield* resizePanel(65);
      const list = yield* ui.getElement({ id: "beads-list" });
      const close = yield* ui.getElement({ id: "beads-close" });
      yield* focusPane("left");
      yield* ui.waitFor("Click here to focus Beads");
      yield* ui.mouse({
        action: "down",
        x: list.x,
        y: close.y,
        button: "left",
      });
      yield* ui.mouse({ action: "up", x: list.x, y: close.y, button: "left" });
      yield* ui.waitFor("Keyboard in Beads");
      yield* focusPane("right");
      yield* ui.enter();
      yield* ui.waitFor("Acceptance criteria");
      yield* ui.waitFor("Dependents");
      yield* Effect.log(yield* ui.screenshot("beads-detail"));
      yield* click("beads-dependent-0");
      yield* ui.waitFor("Recover claims after a reload");
      yield* ui.waitFor("Prerequisites");
      yield* Effect.log(yield* ui.screenshot("beads-related-detail"));
      yield* ui.press("escape");
      yield* ui.waitFor("Polish the Beads workbench");
      yield* click("beads-attach");
      yield* ui.waitFor("drv-ready added to conversation context");
      const sessions = yield* opencode.session.list();
      assert.equal(sessions.data.length, 1);
      const sessionID = sessions.data[0]!.id;
      const entries = yield* opencode.session.instructions.entry.list({
        sessionID,
      });
      assert.equal(entries.length, 1);
      assert.match(JSON.stringify(entries[0]!.value), /"id":"drv-ready"/);
      assert.deepEqual(yield* opencode.session.inbox.list({ sessionID }), []);
      yield* llm.queue(Llm.text("Claimed work received."));
      yield* click("beads-start");
      yield* ui.waitFor("Linked: drv-ready");
      yield* ui.waitFor("started");
      yield* ui.waitFor("Nothing ready");
      yield* ui.waitFor("Claimed work received.");
      yield* Effect.log(yield* ui.screenshot("beads-started"));
      yield* click("beads-work-brief");
      yield* ui.waitFor("BEADS WORK BRIEF");
      yield* Effect.log(yield* ui.screenshot("beads-work-brief"));
      yield* ui.press("escape");
      yield* bd(artifacts, [
        "create",
        "Close work with evidence",
        "--id",
        "drv-second",
        "--description",
        "Claim a second bead in the same session",
        "--acceptance",
        "Keep independent durable links and prompts",
      ]);
      yield* ui.press("r");
      yield* ui.waitFor("drv-second");
      yield* ui.enter();
      yield* ui.waitFor("Keep independent durable links");
      yield* llm.queue(Llm.text("Second claimed work received."));
      yield* ui.press("s");
      yield* ui.waitFor("2 linked beads in this workspace");
      yield* ui.waitFor("Linked: drv-second");
      yield* ui.waitFor("Nothing ready");
      yield* ui.waitFor("Second claimed work received.");
      yield* Effect.log(yield* ui.screenshot("beads-multiple-started"));
      yield* ui.press("2");
      yield* ui.waitFor("in_progress");
      yield* ui.waitFor("2 shown");
      yield* ui.resize({ cols: 60, rows: 30 });
      yield* ui.waitFor("in_progress");
      yield* ui.waitFor(
        () =>
          ui
            .matches("work prompt submitted")
            .pipe(Effect.map((shown) => !shown)),
        { timeout: 10_000 },
      );
      yield* Effect.log(yield* ui.screenshot("beads-narrow"));
      yield* click("bead-row-drv-ready");
      yield* ui.waitFor("x Finish");
      yield* click("beads-finish");
      yield* ui.waitFor("What was completed?");
      yield* ui.type("Implemented the workbench milestone");
      yield* ui.enter();
      yield* ui.waitFor("What evidence proves the acceptance criteria?");
      yield* ui.type("Compiled Drive and native checks passed");
      yield* ui.enter();
      yield* ui.waitFor("Artifacts for drv-ready");
      yield* ui.type("beads-finished screenshot");
      yield* ui.enter();
      yield* ui.waitFor("closed with evidence");
      yield* ui.press("1");
      yield* ui.waitFor("drv-blocked");
      yield* Effect.log(yield* ui.screenshot("beads-finished"));
      const completed = JSON.parse(
        yield* bd(artifacts, [
          "--readonly",
          "--json",
          "list",
          "--all",
          "--id=drv-ready",
          "--limit",
          "1",
          "--no-pager",
        ]),
      ) as Array<{
        status: string;
        close_reason: string;
        closed_by_session: string;
      }>;
      assert.equal(completed[0]?.status, "closed");
      assert.match(completed[0]?.close_reason ?? "", /Compiled Drive/);
      assert.equal(completed[0]?.closed_by_session, sessionID);
      yield* click("beads-close");
      yield* closed();
    }).pipe(
      Effect.tapError(() =>
        Effect.gen(function* () {
          yield* Effect.log(yield* ui.screenshot("beads-interaction-failure"));
          yield* Effect.log(
            (yield* ui.capture()).lines
              .map((line) => line.spans.map((span) => span.text).join(""))
              .join("\n"),
          );
          yield* Effect.log(
            (yield* ui.state()).elements.filter((element) =>
              element.id.startsWith("beads-"),
            ),
          );
        }),
      ),
    ),
);
