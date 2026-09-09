import { execFile } from "node:child_process";
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
  ({ ui, llm, artifacts }) =>
    Effect.gen(function* () {
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
        "Drive ready bead",
        "--id",
        "drv-ready",
        "--description",
        "Exercise the actual compiled TUI",
        "--acceptance",
        "List, inspect, claim, and render at narrow widths",
      ]);
      yield* bd(artifacts, [
        "create",
        "Drive dependent bead",
        "--id",
        "drv-blocked",
        "--description",
        "Wait for the ready bead",
        "--deps",
        "drv-ready",
      ]);
      yield* llm.queue(Llm.text("Ready to inspect the Beads fixture."));
      yield* ui.submit("Prepare to inspect work.");
      yield* ui.waitFor("Ready to inspect the Beads fixture.");
      yield* ui.submit("/beads");
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
      yield* ui.enter();
      yield* ui.waitFor("Acceptance criteria");
      yield* Effect.log(yield* ui.screenshot("beads-detail"));
      yield* llm.queue(Llm.text("Claimed work received."));
      yield* ui.press("s");
      yield* ui.waitFor("Linked: drv-ready");
      yield* ui.waitFor("started");
      yield* ui.waitFor("Nothing ready");
      yield* ui.waitFor("Claimed work received.");
      yield* Effect.log(yield* ui.screenshot("beads-started"));
      yield* ui.press("2");
      yield* ui.waitFor("in_progress");
      yield* ui.resize({ cols: 60, rows: 30 });
      yield* ui.waitFor("in_progress");
      yield* Effect.log(yield* ui.screenshot("beads-narrow"));
    }),
);
