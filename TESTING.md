# Testing

Test observable behavior across real seams. Add regressions for concrete failure
modes, not coverage targets or assertions that repeat private implementation.

## Commands

Run from the repository root:

```sh
bun install --frozen-lockfile
bun run check
bun run format:check
bun run scripts/package-smoke.ts
bun run scripts/real-beads-smoke.ts
bun run test:tui
```

`check` runs typechecking, ESLint (complexity ≤10, nesting ≤3), and Bun tests.
Package smoke installs a tarball into a clean consumer, loads the server/TUI/RPC
entrypoints, and executes RPC in the real Effect SDK host. Both run in CI.
Real-Beads smoke requires `bd`; Drive also requires compatible `opencode2` on PATH.
The default CI lane does not install those external executables.

Automated fixtures use disposable repositories and isolated state, never an
existing user Beads database. Real-Beads smoke isolates HOME, disables metrics,
and cleans up; use `KEEP_BEADS_FIXTURE=1` to retain it for debugging.

## Evidence

- **Processes:** real executable fixtures verify argv, cwd, environment, decoding,
  error classification, timeout, output bounds, and child exit on interruption.
- **Locations:** the mounted TUI waits for session data, moves A→B, aborts old work,
  and rejects late responses. Process/real-Beads checks inject a conflicting
  `BEADS_DIR`.
- **Beads:** disposable real databases verify ready/blocked/in-progress work,
  read-only lookup, typed blocking/annotation relationships, authoritative
  recommendations, competing actors, claim retry, foreign ownership/heartbeat
  rejection, evidence close provenance, newly Ready observation, and closed-state
  refusal.
- **Handoffs:** tests cover concurrent clicks, old/new plugin executors, lost
  prompt responses, module recreation, uncertain writes, and location changes.
  Finish receipts cover immutable evidence, lost close responses, owner races,
  matching-generation retirement, legacy fallback removal, and storage reloads.
  Lease tests distinguish saved links from activity and stop renewal when execution
  ends during a read.
- **UI:** model tests control completion order, selection, graph failures, and
  relationship Back navigation. Native OpenTUI tests exercise keyboard input,
  search, context, Start, Finish evidence dialogs, work briefs, graph navigation,
  refresh, narrow layouts, and cleanup. The keymap driver is a test double; host
  arbitration with other plugins still needs in-app acceptance.
- **Host:** the real Effect SDK host uses a fixture `bd` for registration, all
  shared RPC validation/errors, routing, automatic-context assembly, graph/next,
  finish, and durable handoff. It does not drive model-invoked tool executors or
  prove cancellation across the full remote transport.

Multi-bead regressions cover independent prompt IDs/retries, canceled lock holders,
paginated storage and legacy reads, and location isolation. Storage-defect tests
cross the SDK adapter. Virtual-clock tests exercise lost subscriptions, fresh
activity after reconnect, independent heartbeats, and cancellation on unload.
Package smoke checks both the compatible `linked` and collection `links` RPCs.

## Compiled TUI acceptance

Run `bun run test:tui` after UI changes and inspect its screenshots.
`opencode-drive@2.3.0` runs the installed CLI with a simulated LLM and disposable
Beads database. `scripts/tui-drive.ts` checks `/beads` autocomplete before opening
the workbench, then exercises home/session toggling, mouse tabs and rows,
composer/panel focus, search recovery and clearing, fullscreen round-trips, detail,
passive context attachment followed by Start without an extra model turn,
two independent Claim & start actions in one session, prompt responses, automatic
work-brief inspection, typed relationship navigation with Back, evidence-backed
Finish, newly Ready refresh, In progress, host-dragged 24/40-column side panels,
and a 60-column fullscreen view. Drive typechecks the scenario before execution.

Native regressions cover direct clicks from composer ownership, noninteractive
loading/error lists, long-title control bounds at 24/40 columns, and canceled/stale
selection previews including error recovery. The compiled scenario also checks direct row/Search clicks from the
composer and suppresses the conversation-focus hint in fullscreen.

Set `BEADS_PLUGIN_DIRECTORY` for another checkout and `OPENCODE_DRIVE_MEDIA_DIR`
for screenshots. The compiled CLI's `.ts`/`.tsx` reactive-store loading regression
passed source-only tests; Drive is a separate required gate.

## Tested compatibility

SDK/plugin/CLI 2.0.32, Effect 4.0.1, OpenTUI 0.5.17, Solid 1.9.12,
Bun 1.4.3, Beads (Homebrew, embedded Dolt), macOS.
Recheck installed-package and native rendering behavior after dependency upgrades.

The lockfile keeps `@effect/platform-node-shared` at 4.0.1 with a root override:
4.0.5 requires Effect 4.0.5 and fails Drive against the pinned 4.0.1 runtime
(`effect/Path.make` is absent). Paired `seroval`/`seroval-plugins` 1.6.9 overrides
repair the development dependency graph without changing the host's Solid pin.
Overrides apply only to this root install, not to a consumer's host runtime.

The remaining audit findings are in the development SDK graph:
`@ai-sdk/provider-utils` and `@modelcontextprotocol/client` are pinned by the host;
`braces` and `sprintf-js` have no patched release in their existing compatible
ranges. Do not override exact SDK internals to suppress those advisories.
`bun audit --prod --json` reports no advisories; the full development audit
reports two high, one moderate, and one low advisory.

This Beads build's `show --readonly` writes `last-touched`; full lookup therefore
uses `list --all --id`. Its proxied-server mode rejects strict readonly and the
plugin surfaces that failure. Other Beads versions/backends are unverified.

This Beads build performs close ownership validation before the close transaction;
there is no atomic assignee precondition. The plugin narrows, but cannot remove,
that cross-process race. `--session` is provenance only. `on_close` hooks run even
with `--sandbox`; a failed hook does not fail a committed close, so completion is
verified from persisted status, actor, reason, and session.
