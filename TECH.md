# Architecture

## Target

OpenCode **V2**, initially `0.0.0-beta-19365`, with OpenTUI `0.5.11` and Solid
`1.9.12`. Beta SDK versions are pinned and updated together after compatibility
checks. This package exports TypeScript/TSX source for the host's plugin loader.

Primary references consulted:

- https://opencode.ai/v2/docs/build/plugins
- https://opencode.ai/v2/docs/build/plugins/effect
- https://opencode.ai/v2/docs/build/sdk/effect
- https://opencode.ai/v2/docs/build/plugins/cli
- https://opencode.ai/v2/docs/build/plugins/rpc
- https://opencode.ai/v2/docs/cli/plugins

## One package, three entrypoints

```text
index.ts             Effect-native V2 registrations: RPC and agent tools
server.ts            local-directory loader compatibility entrypoint
tui.tsx              V2 terminal registrations: panel, route, slash command
rpc.ts               shared, validated wire contract; no server imports
src/beads/           Beads process execution, decoding, normalized records
src/workbench/       asynchronous view state and native terminal presentation
test/               behavior, process, host-registration, and rendering tests
scripts/            repeatable packaging and real-Beads smoke checks
```

The deep module is the Beads reader: `list(query)` and `show(id)` return lazy
`Effect` values with typed `BeadsError` failures. The V2 host owns execution and
interruption; scoped registrations unload with the plugin. `Effect.tryPromise`
bridges the subprocess module and passes its interruption signal through to
`execFile`. No nested `runPromise` runtime is started inside the server plugin.

It hides argv construction, execution limits, wire-format differences, and
failure classification. Its production adapter launches `bd` with an argument
array, never a shell command. Tests use a subprocess fixture at the same seam.

The server owns subprocesses in `ctx.location.directory`. The TUI calls typed
RPC with an explicit location derived from the displayed session, falling back
to the plugin/default location only outside sessions. A session panel waits for
its session record rather than guessing; moving the same session remounts the
workbench and aborts old requests. Agent tools resolve their
invoking session's location. Never execute `bd` on the terminal client: it may
be on a different machine from the repository.

Standard Schemas (Zod) live with domain records and are reused by RPC and tools;
they are supported by both the Effect host and Promise-based TUI RPC client.
Unknown Beads
fields are tolerated; malformed required fields fail visibly. No database-file
reads, duplicate database, Beads daemon, generic repository framework, or plugin
framework sits between the two entrypoints and these modules.

## State and lifecycle

One workbench state instance per mounted view owns the current query, selection,
results, detail, and AbortControllers. New requests supersede earlier ones;
late completions cannot overwrite newer results. Selection is preserved by ID
across refreshes. Query changes reset selection only when its ID disappears.

The UI state uses Solid's store and Promise-based client, matching the host's
terminal interface. The server uses `@opencode/plugin/effect`, pinned to Effect
`4.0.0-rc.112`. The embedded `@opencode/sdk/effect` is a development dependency
for real-host integration checks, not a second server embedded in the plugin.

The host owns panel sizing, focus isolation, and fullscreen toggling. Reactive
keymap layers live inside mounted Solid views. Slot/route registrations are
disposed on unload; view cleanup aborts requests. No persistent issue cache in
the initial slice. Refreshes replace displayed data and show errors explicitly.

## Reliability and release discipline

- Read-only CLI flags, finite timeouts, finite stdout/stderr buffers.
- Public inputs validated independently of model-provided schemas.
- Terminal display text strips control characters; IDs remain exact for lookup.
- User-owned installation: no automatic `bd init` or global config rewrites.
- Strict TypeScript, ESLint cyclomatic complexity ≤10 and nesting ≤3.
  This is greenfield code, so the baseline is no functions. The shared complexity
  skill was unavailable in this environment; ESLint provides measurable checks.
  The initial Promise implementation measured a maximum of 8; after the Effect
  migration and location fixes, the maximum remains 8. The server entrypoint's
  maximum decreased 3→1; the TUI entrypoint 5→3; the reader remains 5. These are
  ESLint cyclomatic measurements including callbacks, not line-count proxies.
- Bun lockfile, Linux/macOS CI, native rendering tests, and installed-tarball
  verification. Published compatibility claims follow observed evidence.

Future writes should extend the same reader module into a work module only
when claim/start is implemented. Add atomic claim semantics there, not in JSX.
Session/bead associations will be durable plugin storage keyed by location and
session. Event-driven refresh comes after a reliable initial read path.
