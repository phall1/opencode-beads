import assert from "node:assert/strict";
import { chmod, mkdir, rm } from "node:fs/promises";
import { scratch } from "./temp";
import { join, resolve } from "node:path";

async function hostCheck(directory: string, pluginDirectory: string) {
  const { OpenCode, AbsolutePath, Location } =
    await import("@opencode/sdk/effect");
  const { Effect } = await import("effect");
  const { SessionMessage } = await import("@opencode/schema/session-message");
  const { Beads } = await import("../rpc");
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const host = yield* OpenCode.create({
          database: { path: join(directory, "opencode.db") },
          config: {
            directory,
            project: false,
            content: JSON.stringify({ plugins: [pluginDirectory] }),
          },
          models: { fetch: false },
          fs: { filewatcher: false, fff: false },
          log: {
            level: "error",
            emit: (entry) => console.error(entry.message),
          },
        });
        const rpc = host.rpc(Beads);
        for (const name of ["alpha", "beta"]) {
          const location = Location.Ref.make({
            directory: AbsolutePath.make(join(directory, name)),
          });
          const page = yield* rpc.list(
            { view: "ready", limit: 100 },
            { location },
          );
          assert.equal(page.directory, location.directory);
          assert.equal(page.issues[0]?.title, name);
          const detail = yield* rpc.show({ id: "demo-1" }, { location });
          assert.equal(detail.title, name);
          const session = yield* host.session.create({
            title: "Isolated claim/start check",
            location,
          });
          assert.equal(
            yield* rpc.linked({ sessionID: session.id }, { location }),
            null,
          );
          const input = { sessionID: session.id, id: "demo-1" };
          const started = yield* rpc.start(input, { location });
          assert.equal(started.link.phase, "started");
          assert.equal(started.issue.assignee, `opencode:${session.id}`);
          assert.equal(
            "prompt" in started.link,
            false,
            "private prompt leaked through RPC",
          );
          assert.deepEqual(yield* rpc.start(input, { location }), started);
          assert.deepEqual(
            yield* rpc.linked({ sessionID: session.id }, { location }),
            started.link,
          );
          yield* host.session.interrupt({
            sessionID: session.id,
            continue: false,
          });
          const retryInput = {
            sessionID: session.id,
            id: SessionMessage.ID.create(),
            text: "Isolated admission retry check",
            resume: false,
          };
          const admitted = yield* host.session.prompt(retryInput);
          assert.deepEqual(yield* host.session.prompt(retryInput), admitted);
          const pending = yield* host.session.inbox.list({
            sessionID: session.id,
          });
          assert.equal(
            pending.filter((item) => item.id === retryInput.id).length,
            1,
          );
        }
        const broken = Location.Ref.make({
          directory: AbsolutePath.make(join(directory, "broken")),
        });
        const failure = yield* rpc
          .list({ view: "ready", limit: 100 }, { location: broken })
          .pipe(Effect.flip);
        assert.ok("type" in failure && "data" in failure);
        assert.equal(failure.type, "unavailable");
        assert.deepEqual(failure.data, { code: "command_failed" });
        console.log(
          "Effect SDK host: installed plugin activation, two-location reads, claim/start, durable link, retry and typed errors passed.",
        );
      }),
    ),
  );
}

async function isolatedCheck(pluginDirectory: string) {
  const directory = await scratch("beads-host-");
  try {
    for (const name of ["alpha", "beta", "broken", "bin", "home"])
      await mkdir(join(directory, name));
    const executable = join(directory, "bin/bd");
    await Bun.write(
      executable,
      `#!${process.execPath}
if(process.cwd().endsWith('/broken')) { console.error('backend unavailable'); process.exit(1); }
const file = Bun.file('.claim.json');
let issue = await file.exists() ? await file.json() : {id:'demo-1',title:process.cwd().split('/').pop(),priority:1,status:'open'};
if(process.argv.includes('--claim')) {
  issue = {...issue, status:'in_progress', assignee:process.argv[process.argv.indexOf('--actor')+1]};
  await Bun.write('.claim.json', JSON.stringify(issue));
}
console.log(JSON.stringify({schema_version:1,data:[issue]}));`,
    );
    await chmod(executable, 0o755);
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        ([key]) => !/^(BEADS_|BD_|OPENCODE_|XDG_)/.test(key),
      ),
    );
    Object.assign(env, {
      HOME: join(directory, "home"),
      XDG_CONFIG_HOME: join(directory, "home/config"),
      XDG_DATA_HOME: join(directory, "home/data"),
      XDG_CACHE_HOME: join(directory, "home/cache"),
      PATH: `${join(directory, "bin")}:${process.env.PATH}`,
    });
    const child = Bun.spawn(
      [
        process.execPath,
        import.meta.path,
        "--child",
        directory,
        pluginDirectory,
      ],
      {
        env,
        cwd: directory,
        stdout: "inherit",
        stderr: "inherit",
        timeout: 60_000,
      },
    );
    assert.equal(await child.exited, 0, "Effect SDK host smoke failed");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

if (process.argv[2] === "--child")
  await hostCheck(process.argv[3]!, process.argv[4]!);
else await isolatedCheck(process.argv[3] ?? resolve(import.meta.dir, ".."));
