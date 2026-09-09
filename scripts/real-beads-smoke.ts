import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createReader } from "../src/beads/reader";
import { Effect } from "effect";

// A disposable HOME and repository keep fixture creation away from user Beads state.
const parent =
  process.platform === "darwin" ? "/private/tmp/opencode" : tmpdir();
const directory = await mkdtemp(join(parent, "beads-real-"));
const home = join(directory, "home");
const repo = join(directory, "repo");
await mkdir(home);
await mkdir(repo);
const env = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key]) => !/^(BEADS_|BD_|GIT_|XDG_)/.test(key),
  ),
);
Object.assign(env, {
  HOME: home,
  BD_DISABLE_METRICS: "1",
  BD_OTEL_ENABLED: "false",
  BD_NON_INTERACTIVE: "1",
});

async function run(args: string[], cwd = repo) {
  const child = Bun.spawn(args, {
    cwd,
    env,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 60_000,
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  assert.equal(code, 0, `${args.join(" ")} failed: ${stderr}`);
  return stdout.trim();
}

try {
  await run(["git", "init", "--quiet"]);
  await run(["git", "config", "user.name", "Beads smoke test"]);
  await run(["git", "config", "user.email", "smoke@example.invalid"]);
  await run([
    "bd",
    "init",
    "--prefix",
    "demo",
    "--non-interactive",
    "--skip-hooks",
    "--skip-agents",
    "--quiet",
  ]);
  const ready = await run([
    "bd",
    "create",
    "Make the next useful move",
    "--description",
    "Native workbench in OpenCode V2",
    "--acceptance",
    "List, inspect, and add context",
    "--priority",
    "1",
    "--silent",
  ]);
  const blocked = await run([
    "bd",
    "create",
    "Finish with evidence",
    "--deps",
    ready,
    "--description",
    "Wait for the workbench",
    "--silent",
  ]);
  const progress = await run([
    "bd",
    "create",
    "Keep human and agent in sync",
    "--status",
    "in_progress",
    "--description",
    "Current work",
    "--silent",
  ]);
  const other = join(directory, "other");
  await mkdir(other);
  await run(
    [
      "bd",
      "init",
      "--prefix",
      "other",
      "--non-interactive",
      "--skip-hooks",
      "--skip-agents",
      "--quiet",
    ],
    other,
  );
  await run([
    "bd",
    "-C",
    other,
    "create",
    "Must never leak into the workbench",
    "--silent",
  ]);
  // A wrapper makes the reader execute in the same isolated environment as setup.
  const wrapper = join(directory, "bd-isolated");
  await Bun.write(
    wrapper,
    `#!${process.execPath}\nconst env = ${JSON.stringify(env)}; if(process.env.BEADS_DIR) env.BEADS_DIR = process.env.BEADS_DIR; const p = Bun.spawn(['bd', ...process.argv.slice(2)], {cwd:${JSON.stringify(repo)}, env, stdout:'inherit', stderr:'inherit'}); process.exit(await p.exited);`,
  );
  const { chmod } = await import("node:fs/promises");
  await chmod(wrapper, 0o755);
  const reader = createReader({ directory: repo, executable: wrapper });
  const marker = join(repo, ".beads/last-touched");
  const before = await readFile(marker, "utf8").catch(() => undefined);
  const originalSelector = process.env.BEADS_DIR;
  process.env.BEADS_DIR = join(other, ".beads");
  const readyPage = await Effect.runPromise(
    reader.list({ view: "ready", limit: 100 }),
  ).finally(() => {
    if (originalSelector === undefined) delete process.env.BEADS_DIR;
    else process.env.BEADS_DIR = originalSelector;
  });
  assert.deepEqual(
    readyPage.issues.map((issue) => issue.id),
    [ready],
  );
  assert.equal(
    (await Effect.runPromise(reader.list({ view: "in_progress", limit: 100 })))
      .issues[0]?.id,
    progress,
  );
  const open = await Effect.runPromise(
    reader.list({ view: "open", limit: 100 }),
  );
  assert.ok(open.issues.some((issue) => issue.id === blocked));
  assert.equal(
    (await Effect.runPromise(reader.show(ready))).acceptance_criteria,
    "List, inspect, and add context",
  );
  assert.equal(
    (await Effect.runPromise(reader.show(blocked))).dependencies[0]
      ?.depends_on_id,
    ready,
  );
  assert.equal(
    await readFile(marker, "utf8").catch(() => undefined),
    before,
    "inspection changed last-touched",
  );
  console.log(
    JSON.stringify(
      {
        version: await run(["bd", "--version"]),
        repo,
        ready,
        blocked,
        progress,
        checks:
          "ready excludes blockers/in-progress; views; full content; dependencies; last-touched preserved",
      },
      null,
      2,
    ),
  );
} finally {
  if (process.env.KEEP_BEADS_FIXTURE === "1")
    console.log(`Fixture retained: ${directory}`);
  else await rm(directory, { recursive: true, force: true });
}
