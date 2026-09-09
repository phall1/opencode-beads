# Tests that earn their keep

The target is confidence in the user workflow, not a coverage percentage. Prefer
an observable failure at a real seam over an assertion about a private helper.
Do not add snapshots of whole host objects or mock-call counts that only repeat
the implementation.

## Risk → evidence

| Failure we care about                                             | Evidence                                                                                                                                                                                                                     |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Broken package despite passing source tests                       | `package-smoke.ts` installs a tarball into a clean consumer, loads server/TUI/RPC via V2 `Host`, then configures the installed plugin in the real Effect SDK host and executes RPC                                           |
| Wrong repository's work shown as this repository                  | `location.test.tsx` mounts the actual TUI plugin slot, starts without cached session data, moves the same session A→B, checks abort and late-response rejection; process + real-Beads tests inject a conflicting `BEADS_DIR` |
| Beads scheduling semantics accidentally reimplemented             | `real-beads-smoke.ts` creates ready, blocked, and in-progress work and queries the production reader                                                                                                                         |
| Browsing changes the last-touched bead                            | Real-Beads smoke compares the marker before and after full-content inspection                                                                                                                                                |
| Backend failure looks like an empty queue                         | Process tests exercise exit errors and malformed JSON; native rendering tests assert actionable error and recovery states                                                                                                    |
| A subprocess hangs, grows without bound, or outlives interruption | Real subprocess timeout/output-limit tests; an Effect-interruption test waits for a child-start handshake and verifies the PID exits                                                                                         |
| Old request replaces newer results or selection jumps on refresh  | Model tests defer completions, reorder results, and preserve stable selection IDs                                                                                                                                            |
| Terminal workflow is visually or interactively broken             | Native OpenTUI tests send arrow/Enter/search/attach/refresh input, inspect rendered text at 48 columns, and verify blur and cleanup behavior                                                                                 |
| Typed RPC error disappears across serialization                   | Real Effect SDK host checks the declared error's type and code                                                                                                                                                               |

## Test doubles are explicit

- Process tests substitute a real executable for `bd`; it sees actual argv, cwd,
  environment, cancellation, and OS process limits. A separate real-`bd` smoke
  establishes that the CLI contract matches the tested version.
- Native rendering uses the real OpenTUI renderer and input parser. A small
  driver implements the public keymap registration contract, including enabled
  predicates and component cleanup. It is **not** a full OpenCode TUI end-to-end
  test; host-specific panel sizing and keymap arbitration still need in-app
  dogfooding with other plugins.
- The model reader double controls completion order; it does not pretend to
  prove process behavior or Beads semantics.
- The Effect SDK host uses a fixture `bd` executable so it can verify activation,
  RPC validation, errors, and location routing without a mutable real database.
  It does not yet drive model-invoked tool executors or prove cancellation across
  the complete remote transport. Reader interruption tests establish the local
  Effect-to-process contract specifically.

## Running and isolation

`bun run check` is the fast gate. `bun run scripts/package-smoke.ts` is the
packaging/integration gate and runs in CI. `bun run scripts/real-beads-smoke.ts`
creates disposable repositories and a disposable HOME, disables CLI metrics,
and removes them afterwards. Set `KEEP_BEADS_FIXTURE=1` only when intentionally
retaining those generated workspaces for investigation.

No automated check reads or initializes an existing user Beads database. Add
regressions for concrete bugs; broaden testing when a change introduces a new
failure mode, not merely to raise the test count.
