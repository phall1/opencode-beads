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
  read-only lookup, competing actors, claim retry, foreign ownership/heartbeat
  rejection, and closed-state refusal.
- **Handoffs:** tests cover concurrent clicks, old/new plugin executors, lost
  prompt responses, module recreation, uncertain writes, and location changes.
  Lease tests distinguish saved links from activity and stop renewal when
  execution ends during a read.
- **UI:** model tests control completion order and selection. Native OpenTUI tests
  exercise keyboard input, search, context, Start, refresh, narrow layouts, and
  cleanup. The keymap driver is a test double; host arbitration with other plugins
  still needs in-app acceptance.
- **Host:** the real Effect SDK host uses a fixture `bd` for registration, RPC
  validation/errors, routing, and durable handoff. It does not drive model-invoked
  tool executors or prove cancellation across the full remote transport.

Multi-bead regressions cover independent prompt IDs/retries, canceled lock holders,
paginated storage and legacy reads, and location isolation. Storage-defect tests
cross the SDK adapter. Virtual-clock tests exercise lost subscriptions, fresh
activity after reconnect, independent heartbeats, and cancellation on unload.
Package smoke checks both the compatible `linked` and collection `links` RPCs.

## Compiled TUI acceptance

Run `bun run test:tui` after UI changes and inspect its screenshots.
`opencode-drive@2.1.0` runs the installed CLI with a simulated LLM and disposable
Beads database. `scripts/tui-drive.ts` checks `/beads` autocomplete before opening
the workbench, then exercises loaded results, detail,
two independent Claim & start actions in one session, prompt responses, Ready
refresh, In progress, and a 60-column
fullscreen view. Drive typechecks the scenario before execution.

Set `BEADS_PLUGIN_DIRECTORY` for another checkout and `OPENCODE_DRIVE_MEDIA_DIR`
for screenshots. The compiled CLI's `.ts`/`.tsx` reactive-store loading regression
passed source-only tests; Drive is a separate required gate.

## Tested compatibility

SDK/plugin beta-19365, CLI beta-19378, Effect 4.0.0-rc.112, OpenTUI 0.5.11,
Solid 1.9.12, Bun 1.3.14, Beads HEAD-7505e17 (Homebrew, embedded Dolt), macOS.
Recheck installed-package and native rendering behavior after dependency upgrades.

This Beads build's `show --readonly` writes `last-touched`; full lookup therefore
uses `list --all --id`. Its proxied-server mode rejects strict readonly and the
plugin surfaces that failure. Other Beads versions/backends are unverified.
