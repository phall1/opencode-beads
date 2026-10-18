import assert from "node:assert/strict";
import { readFile, readdir, rm } from "node:fs/promises";
import { scratch } from "./temp";
import { join, resolve } from "node:path";
import { Host } from "@opencode/plugin/host";

const directory = await scratch("beads-package-");

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
  await run(
    [process.execPath, "pm", "pack", "--destination", directory],
    resolve(import.meta.dir, ".."),
  );
  const tarballs = (await readdir(directory)).filter((name) =>
    name.endsWith(".tgz"),
  );
  assert.equal(tarballs.length, 1, "Expected one packed artifact");
  await Bun.write(
    join(directory, "package.json"),
    JSON.stringify({
      private: true,
      dependencies: {
        "@phall1/opencode-beads": join(directory, tarballs[0]!),
        "solid-js": "1.9.12",
        "@opencode/theme": "2.0.32",
      },
    }),
  );
  await run([process.execPath, "install"], directory);
  const entrypoints = Host.resolve({
    directory,
    name: "@phall1/opencode-beads",
  });
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
  assert.deepEqual(Object.keys(rpc.Beads.methods).sort(), [
    "context",
    "finish",
    "graph",
    "linked",
    "links",
    "list",
    "next",
    "show",
    "start",
  ]);
  console.log(
    await run(
      [
        process.execPath,
        resolve(import.meta.dir, "host-smoke.ts"),
        "--plugin",
        join(directory, "node_modules/@phall1/opencode-beads"),
      ],
      directory,
    ),
  );
  console.log(
    "Installed tarball: V2 Host.resolve/load passed for server, TUI, and RPC.",
  );
  await Bun.write(
    join(directory, "theme.ts"),
    await readFile(resolve(import.meta.dir, "../test/theme.ts"), "utf8"),
  );
  const rendered = await run(
    [
      process.execPath,
      "--preload",
      "@opentui/solid/preload",
      "--eval",
      `
    import assert from "node:assert/strict";
    import { Host } from "@opencode/plugin/host";
    import { ensurePluginRuntime } from "@opencode/plugin/runtime";
    import { testRender } from "@opentui/solid";
    import { theme } from "./theme.ts";
    ensurePluginRuntime();
    const entries = Host.resolve({ directory: process.cwd(), name: "@phall1/opencode-beads" });
    const { default: plugin } = await Host.load(entries.tui);
    let render;
    let title = "BEFORE REFRESH";
    const layers = [];
    const context = {
      theme,
      location: { directory: "/fixture" },
      keymap: { layer: (factory) => layers.push(factory), shortcuts: () => [] },
      client: { rpc: () => ({ list: async (query) => ({
        directory: "/fixture", view: query.view, limit: 100, mayHaveMore: false,
        issues: [{ id: "smoke-1", title, status: "open", priority: 2,
          assignee: "", description: "", labels: [], dependencies: [] }],
      }) }) },
      ui: {
        router: { register: (route) => { render = route.render; return () => {}; } },
        slot: () => () => {},
        format: { path: (path) => path },
      },
    };
    const cleanup = plugin.setup(context);
    const screen = await testRender(() => render(), { width: 80, height: 24 });
    try {
      await screen.waitForFrame((frame) => frame.includes(title));
      title = "AFTER REFRESH";
      const refresh = layers.flatMap((factory) => factory().commands ?? []).find((command) => command.bind === "r");
      assert.ok(refresh, "installed workbench did not register refresh");
      await refresh.run();
      await screen.waitForFrame((frame) => frame.includes(title));
    } finally {
      screen.renderer.destroy();
      cleanup?.();
     }
     console.log("Installed TUI: asynchronous refresh updates the rendered frame.");
  `,
    ],
    directory,
  );
  assert.match(rendered, /Installed TUI: asynchronous refresh/);
  console.log(rendered);
} finally {
  await rm(directory, { recursive: true, force: true });
}
