import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Host } from "@opencode/plugin/host";

const parent =
  process.platform === "darwin" ? "/private/tmp/opencode" : tmpdir();
const directory = await mkdtemp(join(parent, "beads-package-"));

async function run(args: string[], cwd: string) {
  const child = Bun.spawn(args, { cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  assert.equal(exit, 0, `${args.join(" ")} failed: ${stderr}`);
  return stdout;
}

try {
  const output = await run(
    [process.execPath, "pm", "pack", "--destination", directory],
    resolve(import.meta.dir, ".."),
  );
  const tarball = output
    .trim()
    .split("\n")
    .findLast((line) => line.endsWith(".tgz"));
  assert.ok(tarball, output);
  await Bun.write(
    join(directory, "package.json"),
    JSON.stringify({
      private: true,
      dependencies: {
        "opencode-beads": join(directory, "opencode-beads-0.1.0.tgz"),
        "solid-js": "1.9.12",
      },
    }),
  );
  await run([process.execPath, "install"], directory);
  const entrypoints = Host.resolve({ directory, name: "opencode-beads" });
  for (const name of ["server", "tui", "rpc"] as const)
    assert.ok(entrypoints[name], `${name} export missing`);
  const server = (await Host.load(entrypoints.server!)) as {
    default: { id: string; effect: unknown };
  };
  const tui = (await Host.load(entrypoints.tui!)) as {
    default: { id: string; setup: unknown };
  };
  const rpc = (await Host.load(entrypoints.rpc!)) as {
    Beads: { methods: object };
  };
  assert.equal(server.default.id, "beads.server");
  assert.equal(tui.default.id, "beads.tui");
  assert.equal(typeof server.default.effect, "function");
  assert.equal(typeof tui.default.setup, "function");
  assert.deepEqual(Object.keys(rpc.Beads.methods), ["list", "show"]);
  console.log(
    await run(
      [
        process.execPath,
        resolve(import.meta.dir, "host-smoke.ts"),
        "--plugin",
        join(directory, "node_modules/opencode-beads"),
      ],
      directory,
    ),
  );
  console.log(
    "Installed tarball: V2 Host.resolve/load passed for server, TUI, and RPC.",
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
