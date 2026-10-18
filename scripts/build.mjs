import solid from "@opentui/solid/bun-plugin";

const result = await Bun.build({
  entrypoints: ["tui.tsx"],
  outdir: ".",
  target: "bun",
  format: "esm",
  packages: "external",
  plugins: [solid],
});
if (!result.success)
  throw new AggregateError(result.logs, "Beads TUI build failed");
