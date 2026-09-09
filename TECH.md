# Architecture

One source-distributed package for OpenCode V2. Pin the beta SDK and coordinate
Effect, OpenTUI, and Solid upgrades; tested versions are in [TESTING.md](TESTING.md).
Use the installed SDK types and the V2 [plugin][plugins], [Effect][effect],
[CLI][cli], and [RPC][rpc] references.

## Boundaries

Design references (reviewed 2026-09-09): [Kit's hierarchy essay][design],
[ghui's queue and preview][ghui], [Visual Effect's interaction feedback][visual],
and [OpenCode's restrained hierarchy][site]. Apply these as interaction principles,
not copied branding. Preview reads follow selection, are abortable, and never
change Beads ownership or submit work.

```text
index.ts         Effect server: RPC and agent tools
server.ts        local-directory loader entrypoint
tui.tsx          Solid terminal: panel, route, slash command
rpc.ts           validated shared contract; no server imports
dev-plugin/      narrow live-checkout entrypoints
src/beads/       subprocess execution, decoding, reads and ownership operations
src/work/        claim/start workflow, host storage adapter, locks and leases
src/workbench/   view state and terminal presentation
```

The server runs `bd` with an argument array, finite timeout/output limits, and
interruption passed through `Effect.tryPromise` to `execFile`. Keep Effects lazy;
the host owns execution, interruption, and Scope. Never start a nested runtime.
Zod schemas validate public inputs and required response fields; tolerate unknown
Beads fields. Strip terminal control characters from display text, preserving IDs
for lookup. The TUI has no subprocess or database access.

Resolve agent tools against their invoking session. The TUI waits for its session
record and sends its explicit location; only non-session views use the default.
A move remounts the view and aborts old requests. Per-view state rejects late
responses and preserves selection by ID. Solid/Promise views and keymaps dispose
with their mount; server registrations and background fibers dispose with Scope.

Panel ownership and native widget focus are separate. List navigation uses the
panel-scoped keymap; ancestor focus restores the active widget through public
renderer events, without intercepting dialog or composer focus. Clickable rows
use a scrollbox: the pinned OpenTUI select has no row-click or wheel behavior.
Add context uses the public session instruction-entry API. Synthetic messages,
even with `resume: false`, enter the inbox and can consume a separate model turn
before a queued Start. Context keys hash location and case-sensitive issue ID;
oversized values become explicit lookup references within the 8 KiB host limit.

Keep reactive UI modules in `.tsx`, even without JSX: the tested compiled CLI
bypasses the required runtime transform for `.ts` store imports. Source-render
tests do not detect this failure. `model.ts` forwards to `model.tsx` to preserve
the old path tracked by long-lived CLI loader caches after the rename; removing
it can prevent TUI activation with `ENOENT` even after a service restart.
Load `dev-plugin/` for dogfooding: directory
watching is recursive, while imported sources are watched individually. A service
that previously loaded the repository root can retain that watcher until restart.

## Durable handoff

`createWork` separates workflow from host storage/session APIs. A per-session
semaphore shared across module generations serializes old tool executors and new
RPC handlers, spanning locations because storage follows the session. Beads owns
the cross-process ownership check. Multiple independent servers sharing the same
session/storage are unsupported.

1. Persist `claim_pending` before mutation. Confirm ownership before `claimed`.
   Clear intent on known refusals or pre-mutation location failure; preserve
   ambiguous outcomes for read-based reconciliation.
2. Persist the exact prompt and message ID before admission. Retry that ID through
   OpenCode inbox deduplication. `started` means accepted, not successful execution.
3. Validate directory/workspace identity before mutation and prompt submission.
   Beads, storage, and inbox are separate transactions: never roll back ownership
   implicitly. Public links omit the private prompt body.

### Multiple links

- Store independent links per session, location (directory/workspace), and bead.
  Update or remove only the target association; preserve the others. Read legacy
  one-link records as a collection without losing phase, prompt ID, or body.
- Add a `links` collection RPC for the UI; preserve the existing `linked` RPC's
  single-link response contract (the first stored association, or null).
  Filter associations by location, so moving a
  session never reinterprets old IDs in another Beads database.
- Convert storage failures, including SDK storage defects, into actionable
  handoff failures without swallowing interruption. Preserve unreadable records
  and uncertain writes rather than treating them as absent or claiming that a
  mutation was rolled back.
- Express workflow operations as named `Effect.fn` methods. Keep mutation locks,
  lease fibers, interruption, and cleanup inside the host-owned lifecycle.
- Renew each eligible link independently during observed execution. Recheck
  activity/location/ownership before heartbeat; ending execution or disposing the
  scope must stop pending renewals. Losing one claim must not stop valid siblings.

Event consumption and renewal run together. Subscription failure cancels pending
renewals, clears activity, and retries after five seconds. Reconnection requires
fresh activity evidence. Scope closure stops both operations and retries.

## Session work intelligence

Baseline [2fd6a6a](https://github.com/phall1/opencode-beads/tree/2fd6a6a):
`src/work/service.ts` owns durable claim/start; `src/work/storage.ts` owns per-bead
links; `src/workbench/context.ts` handles explicit passive references. Extend those
seams with Effect services for completion, read-only relationships, and automatic
briefs. Keep the existing claim/start storage schema and legacy RPCs compatible.

- Register the installed SDK's `session.hook("context")`; append bounded task data
  to each outgoing context without changing persisted user input or queuing work.
  This hook also runs during compaction. Read durable links after reload, validate
  session location before/after reads, and check live issue ownership/status.
- Cache briefs briefly by session inside the location-scoped plugin. Invalidate on
  plugin claim/start/finish, reject late cache writes, bound cache size/read fanout,
  and offer explicit fresh reads. Failures produce concise unavailable context
  rather than preventing unrelated model execution. Never spawn a model to build
  a brief; keep issue data subordinate to user/repository instructions.
- Use a separate durable finish receipt containing the claim generation, immutable
  evidence, pre-close Ready IDs and observed close state. Serialize with the same
  session lock as claim/start. Save before mutation, reconcile current Beads state
  on retry, then retire matching v2 and legacy links without resurrecting legacy
  work. Preserve receipts if cleanup/Ready refresh fails.
- Store human-readable evidence in the native close reason; verify the live result.
  Native command ownership/race limits must be documented from fixture evidence.
  Ready snapshots use `bd`'s complete bounded query, not a locally reconstructed
  scheduler. Return observed newly Ready work separately from closure success.
- Relationship reads use native read-only dependency queries with validated output,
  explicit bounds and recorded edge types. Immediate neighborhood metadata is
  advisory; only native Ready membership authorizes recommendations/claim attempts.
  The current 100-row UI page is never used as a complete project graph.
- Add shared RPC and agent surfaces for brief, graph, next and finish. The terminal
  shows relationships in scrollable detail, an inspectable work brief, and an
  evidence-entry flow using native host dialogs. Keep 24/40-column controls usable.

Validation maps PRODUCT invariants 1–2 to context cache/location/compaction tests;
3–5 to interrupted writes, immutable retry evidence, foreign ownership, legacy
retirement and real-Beads close/Ready checks; 6–8 to native graph decoding and TUI
keyboard/mouse tests. Run installed-package SDK-host smoke and compiled Drive with
isolated Beads fixtures, inspect screenshots, and independently review the final
diff. One writer owns integration; parallel read-only research/review covers
native CLI semantics and correctness.

## Beads and lease limits

The tested Beads rejects Ready filtering by ID. Claims check membership in
`ready --brief --limit 0 --max-rows 10000` within the process budget, then call
`update ID --claim --actor opencode:<sessionID>` with `--sandbox`. Ownership/status
is atomic; dependency readiness is a preceding snapshot. Browsing uses readonly
flags and never initializes a database. Backend-specific caveats are in TESTING.md.

Lease activity is ephemeral: execution events, primary model requests, and an
executing claim tool establish it; stored links do not. Renewal runs every 60
seconds. The pinned SDK lacks `ctx.session.active()`: reload during a long tool
call cannot recover activity until the next primary model request. Do not bridge
this gap with private imports or invented types.

[plugins]: https://opencode.ai/v2/docs/build/plugins
[effect]: https://opencode.ai/v2/docs/build/plugins/effect
[cli]: https://opencode.ai/v2/docs/build/plugins/cli
[rpc]: https://opencode.ai/v2/docs/build/plugins/rpc
[design]: https://kitlangton.com/posts/spare-thoughts-on-app-design/
[ghui]: https://github.com/kitlangton/ghui
[visual]: https://github.com/kitlangton/visual-effect
[site]: https://opencode.ai
