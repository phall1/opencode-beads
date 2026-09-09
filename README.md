# opencode-beads

A [Beads](https://github.com/gastownhall/beads) plugin for [OpenCode V2](https://opencode.ai/v2/docs/). Browse, inspect, claim, and finish issues from your terminal.

This is an unofficial plugin, not affiliated with or endorsed by anomalyco.

## Install

Requires OpenCode V2 and `bd` installed on the OpenCode server, with Beads initialized in your project.

Add to `opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["github:phall1/opencode-beads"],
}
```

## Usage

Run `/beads` to toggle the workbench. Click a row to inspect it; tabs and actions
work with the mouse too. The header shows keyboard focus and your configured
shortcut back to the conversation.
Selection previews the bead when space allows. Enter opens full detail with
claim and context actions beside it; compact panels keep the queue in focus.

| Key                  | Action                                         |
| -------------------- | ---------------------------------------------- |
| `1` / `2` / `3`      | Ready / In progress / Open                     |
| `↑` / `↓`, `j` / `k` | Select an issue                                |
| `Enter`              | Inspect                                        |
| `/`                  | Search loaded results                          |
| `r`                  | Refresh                                        |
| `a`                  | Add issue context to the conversation          |
| `s`                  | Claim the issue and start work in this session |
| `b`                  | Inspect the current automatic work brief       |
| `g`                  | Choose and inspect a related bead              |
| `x`                  | Finish linked work with validation evidence    |
| `f`                  | Toggle fullscreen                              |
| `Esc`                | Go back or close                               |

Browsing is read-only. A session can claim multiple issues; each keeps its own
retry-safe work prompt. Current owned work is added to subsequent model context
without creating another turn. Immediate relationships preserve Beads edge types;
they explain the neighborhood but never replace Beads Ready membership.

Finish requires a summary and validation evidence, retains them in Beads, retires
the matching session link, and reports work newly observed as Ready. Search covers
up to 100 loaded results.

Agents get `beads_list`, `beads_show`, `beads_claim`, `beads_context`,
`beads_graph`, `beads_next`, and `beads_finish` tools.

## Development

```sh
bun install --frozen-lockfile
bun run check
bun run test:tui
```

`test:tui` uses OpenCode Drive and requires `opencode2` and `bd` on PATH.

[Architecture](TECH.md) · [Testing](TESTING.md) · [Roadmap](PRODUCT.md)

## License

[MIT](LICENSE).
