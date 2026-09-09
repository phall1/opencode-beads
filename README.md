# opencode-beads

**Your next useful move, inside OpenCode.**

A native [OpenCode V2](https://opencode.ai/v2/docs/build/plugins/cli) workbench for
[Beads](https://github.com/gastownhall/beads). Browse dependency-aware ready work,
inspect the details, and bring a bead into the conversation without leaving your
terminal. The server plugin uses **OpenCode's Effect API**.

## The first slice

- `/beads` opens a session panel; from home it opens a full-page workbench.
- **Ready / In progress / Open** views, with priority, ID, status, owner, and labels.
- Search loaded results by ID, title, owner, and label.
- Inspect descriptions, acceptance criteria, design, notes, and dependencies.
- Explicitly add a bead to the current conversation as reference context. The
  action does not resume an idle agent or claim the bead.
- `beads_list` and `beads_show` give agents the same server-side read path.
- Uses the active theme and the host's panel focus/fullscreen behavior.

This is a working **0.1 foundation**, not a published npm release. Claim/start,
issue editing, close-with-evidence, comments, and dependency navigation are the
next product slices; see [PRODUCT.md](PRODUCT.md).

## Try it locally

Prerequisites: OpenCode V2 **`0.0.0-beta-19365`**, Bun **1.3.14+**, and `bd` installed
on the **OpenCode server**, with an initialized Beads workspace.

```sh
bun install --frozen-lockfile
bun run check
```

Add this checkout's **absolute path** to `plugins` in the target repository's
`opencode.jsonc`, preserving its other settings:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["/absolute/path/to/opencode-beads"],
}
```

Open that repository in OpenCode V2 and type `/beads`. The server plugin and its
`./tui` entrypoint load together; a separate `cli.json` entry is unnecessary.
For remote OpenCode connections, the configured path and `bd` installation belong
to the server machine. See the [V2 loading guide](https://opencode.ai/v2/docs/cli/plugins).

### Controls

| Key                  | Action                                                           |
| -------------------- | ---------------------------------------------------------------- |
| `1` / `2` / `3`      | Ready / In progress / Open                                       |
| `↑` / `↓`, `j` / `k` | Select a bead                                                    |
| `Enter`              | Inspect selection; finish editing the search field               |
| `/`                  | Search loaded results; clear the field to remove the filter      |
| `r`                  | Refresh                                                          |
| `a`                  | Add inspected bead to this conversation (session panel only)     |
| `f`                  | Toggle panel fullscreen (host keeps narrow terminals fullscreen) |
| `Esc`                | Leave search, return to list, or close                           |

View tabs also respond to clicks. Shortcuts are scoped to the focused workbench.

## Honest data, bounded work

The UI loads up to **100 beads per view**; agent list queries accept 1–200. Search
is local to that result set. A cap indicator means more records may exist; it is
not a total count. **Open** means stored status `open`; it includes blocked-by-
dependency issues with that status, and is not an all-status archive.

The reader delegates workspace/worktree/redirect discovery to Beads, with the
session's directory as `cwd`. Inherited workspace selectors such as `BEADS_DIR`
are removed to prevent cross-repository leakage. Authentication and backend
connection settings remain available to Beads. The header names the requested
workspace; Beads may resolve a shared database through its configured redirects.

Reads use `--readonly --sandbox`, a 10-second timeout, and a 4 MiB stream-buffer
limit. The plugin does not initialize a database or run sync/claim/edit commands.
Missing tooling, missing directories, backend failures, and empty results have
distinct states. Superseded requests are aborted; stale data cannot overwrite a
new view or a moved session.

### Compatibility

Verified locally on macOS with:

| Dependency                    | Tested version                           |
| ----------------------------- | ---------------------------------------- |
| OpenCode plugin + Effect SDK  | `0.0.0-beta-19365`                       |
| Effect                        | `4.0.0-rc.112`                           |
| OpenTUI core / Solid renderer | `0.5.11`                                 |
| Solid                         | `1.9.12`                                 |
| Beads                         | `HEAD-7505e17` (Homebrew, embedded Dolt) |

The current Beads build's `show --readonly` still updates `last-touched`. The
plugin deliberately implements `beads_show` through `list --all --id` to avoid
that write. See the [upstream source](https://github.com/gastownhall/beads/blob/7505e17/cmd/bd/show.go).
Strict readonly is rejected by that build's proxied-server mode; the plugin
surfaces the failure rather than silently dropping the readonly flag. Other
Beads versions/backends are not yet verified. V1 is not a supported target.

## Architecture and development

One package, a small public surface, and two meaningful internal modules:

```text
index.ts             Effect-native V2 server plugin: RPC + agent tools
server.ts            local-directory loader compatibility entrypoint
tui.tsx              V2 panel, route, slash command, session location lifecycle
rpc.ts               shared validated RPC contract
src/beads/           lazy, interruptible reads; argv, limits, decoding, failures
src/workbench/       view state and native Solid/OpenTUI presentation
test/                process, race, location, and native-input regressions
scripts/             installed-package, Effect SDK host, and real-Beads checks
```

[TECH.md](TECH.md) explains the seams and lifecycle. [TESTING.md](TESTING.md)
explains what the tests actually establish.

```sh
bun run check                         # types, complexity/lint, behavior tests
bun run format:check
bun run scripts/package-smoke.ts       # install tarball, load it, execute RPC in V2 host
bun run scripts/real-beads-smoke.ts    # real bd; creates and removes isolated fixtures
```

CI runs checks and installed-package verification on Linux and macOS. Real-Beads
verification is explicit because it requires the compatible CLI/backend. No
publishing workflow or analytics collection is included.

MIT licensed.
