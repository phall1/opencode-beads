import { afterAll, beforeAll, expect, test } from "bun:test";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createReader } from "../src/beads/reader";
import { runBeads } from "../src/beads/process";
import { issue } from "./fixtures";
import { Effect } from "effect";

let directory: string;
let executable: string;
beforeAll(async () => {
  const parent =
    process.platform === "darwin" ? "/private/tmp/opencode" : tmpdir();
  directory = await mkdtemp(join(parent, "beads-test-"));
  executable = join(directory, "bd fixture");
  await writeFile(
    executable,
    `#!${process.execPath}\nconst args = process.argv.slice(2);
const mode = args[0];
if (mode === 'hang') { setInterval(() => {}, 1000); }
else if (mode === 'large') { console.log('x'.repeat(100000)); }
else if (mode === 'missing-db') { console.error('Error: no beads database found'); process.exit(1); }
else if (mode === 'fail') { console.error('database unavailable'); process.exit(1); }
else if (mode === 'invalid') { console.log('{'); }
else if (mode === 'argv') { console.log(JSON.stringify({args:args.slice(1),cwd:process.cwd(),beads:process.env.BEADS_DIR})); }
else {
  if (!args.includes('--readonly') || !args.includes('--sandbox') || args.includes('show')) process.exit(9);
  if (process.env.BD_DISABLE_METRICS !== '1' || process.env.BD_JSON_ENVELOPE !== '1') process.exit(8);
  const file = Bun.file(process.cwd() + '/response.json');
  if (await file.exists()) console.log(await file.text());
  else console.log(JSON.stringify({schema_version:1, data:[${JSON.stringify(issue())}]}));
}
`,
  );
  await chmod(executable, 0o755);
});

test("external wire variants work, while malformed responses are never an empty backlog", async () => {
  const reader = createReader({ directory, executable });
  const response = join(directory, "response.json");
  try {
    await writeFile(
      response,
      JSON.stringify([
        {
          id: "custom-1",
          title: "Custom workflow",
          priority: 2,
          status: "reviewing",
          extra_future_field: true,
        },
      ]),
    );
    const legacy = await Effect.runPromise(
      reader.list({ view: "open", limit: 100 }),
    );
    expect(legacy.issues[0]?.status).toBe("reviewing");
    expect(legacy.issues[0]?.labels).toEqual([]);
    await writeFile(
      response,
      JSON.stringify({
        schema_version: 1,
        data: [issue()],
        pagination: { truncated: true },
      }),
    );
    expect(
      (await Effect.runPromise(reader.list({ view: "ready", limit: 100 })))
        .mayHaveMore,
    ).toBe(true);
    for (const body of [
      "not JSON",
      '{"schema_version":2,"data":[]}',
      '[{"title":"Missing ID"}]',
    ]) {
      await writeFile(response, body);
      await expect(
        Effect.runPromise(reader.list({ view: "ready", limit: 100 })),
      ).rejects.toMatchObject({ code: "invalid_output" });
    }
  } finally {
    await rm(response, { force: true });
  }
});
afterAll(() => rm(directory, { recursive: true, force: true }));

test("reader uses a read-only argv contract for list and full lookup", async () => {
  const reader = createReader({ directory, executable });
  const page = await Effect.runPromise(
    reader.list({ view: "ready", limit: 1 }),
  );
  expect(page.issues[0]?.id).toBe("demo-1");
  expect(page.mayHaveMore).toBe(true);
  expect(await Effect.runPromise(reader.show("demo-1"))).toEqual(issue());
  await expect(
    Effect.runPromise(reader.show("absent-1")),
  ).rejects.toMatchObject({ code: "not_found" });
});

test("untrusted IDs and limits are rejected before execution", async () => {
  const reader = createReader({ directory, executable });
  for (const id of ["--help", "a,b", "a;touch pwned", "../beads", ""]) {
    await expect(Effect.runPromise(reader.show(id))).rejects.toThrow();
  }
  await expect(
    Effect.runPromise(reader.list({ view: "open", limit: 0 })),
  ).rejects.toThrow();
});

test("process preserves argument boundaries and workspace", async () => {
  const args = ["a b", "$(touch pwned)", "; exit 0", "--id=demo-1"];
  const previous = process.env.BEADS_DIR;
  process.env.BEADS_DIR = "/wrong-workspace/.beads";
  try {
    expect(
      JSON.parse(await runBeads({ directory, executable }, ["argv", ...args])),
    ).toEqual({ args, cwd: directory });
  } finally {
    if (previous === undefined) delete process.env.BEADS_DIR;
    else process.env.BEADS_DIR = previous;
  }
});

test("missing executable, backend failure and missing workspace are distinct", async () => {
  await expect(
    runBeads({ directory, executable: join(directory, "missing") }, []),
  ).rejects.toMatchObject({ code: "missing_cli" });
  await expect(
    runBeads(
      { directory: join(directory, "gone"), executable: process.execPath },
      [],
    ),
  ).rejects.toMatchObject({ code: "missing_workspace" });
  await expect(
    runBeads({ directory, executable }, ["missing-db"]),
  ).rejects.toMatchObject({ code: "not_initialized" });
  await expect(
    runBeads({ directory, executable }, ["fail"]),
  ).rejects.toMatchObject({ code: "command_failed" });
});

test("timeout and output limits terminate processes", async () => {
  await expect(
    runBeads({ directory, executable, timeout: 50 }, ["hang"]),
  ).rejects.toMatchObject({ code: "timeout" });
  await expect(
    runBeads({ directory, executable, maxBuffer: 100 }, ["large"]),
  ).rejects.toMatchObject({ code: "output_limit" });
});

test("cancellation rejects promptly, including pre-aborted requests", async () => {
  const controller = new AbortController();
  const request = runBeads(
    { directory, executable },
    ["hang"],
    controller.signal,
  );
  controller.abort();
  await expect(request).rejects.toMatchObject({ name: "AbortError" });
  await expect(
    runBeads({ directory, executable }, [], controller.signal),
  ).rejects.toMatchObject({ name: "AbortError" });
});

test("interrupting a reader Effect kills a subprocess that has actually started", async () => {
  const pidFile = join(directory, "started.pid");
  const hanging = join(directory, "hanging-bd");
  await writeFile(
    hanging,
    `#!${process.execPath}\nawait Bun.write(${JSON.stringify(pidFile)}, String(process.pid)); setInterval(() => {}, 1000);`,
  );
  await chmod(hanging, 0o755);
  const controller = new AbortController();
  const request = Effect.runPromise(
    createReader({ directory, executable: hanging }).list({
      view: "ready",
      limit: 100,
    }),
    { signal: controller.signal },
  );
  // Handle rejection immediately; the start handshake must precede interruption.
  const settled = request.then(
    () => "completed",
    () => "interrupted",
  );
  try {
    await waitUntil(() => Bun.file(pidFile).exists());
    const pid = Number(await Bun.file(pidFile).text());
    controller.abort();
    expect(await settled).toBe("interrupted");
    await waitUntil(async () => {
      try {
        process.kill(pid, 0);
        return false;
      } catch {
        return true;
      }
    });
  } finally {
    controller.abort();
  }
});

async function waitUntil(check: () => Promise<boolean>) {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await Bun.sleep(10);
  }
  throw new Error(
    "Subprocess handshake or termination did not complete within 2 seconds",
  );
}
