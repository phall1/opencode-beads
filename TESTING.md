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

Claim/start regressions cover concurrent clicks, overlapping old/new plugin
executors, accepted-but-lost prompt responses, module recreation, uncertain
writes, and pre-write location failures. Lease tests distinguish durable links
from activity and stop a pending renewal when execution ends during its read.
Real-Beads smoke races distinct actors, retries the winner, rejects a foreign
claim/heartbeat, and verifies closed-state refusal. Native rendering exercises
explicit Start and its resulting link/Ready refresh.

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
  RPC validation, errors, location routing, claim/start and stored linkage without
  a mutable real database. It does not yet drive model-invoked tool executors or prove cancellation across
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

Manual live dogfooding in this repository exercised the model-invoked
`beads_claim` tool on `ocb-hd7`, verifying its session actor and durable link.
This is distinct from the isolated automated tests above.

The live beta-19378 CLI was also opened in a real PTY against this session and
repository. It reproduced an indefinitely loading list while the linked-bead
footer succeeded. Moving the reactive state module from `.ts` to `.tsx` restored
the list through the host's actual runtime transform; the same PTY then displayed
the real Ready records. This is the acceptance regression for `ocb-0sp` and a
now covered by the repeatable Drive scenario below.

## Actual TUI regression with OpenCode Drive

Run `bun run test:tui` after UI changes. `opencode-drive@2.1.0` launches the
installed `opencode2` in isolation with a simulated LLM and a real disposable
Beads database. `scripts/tui-drive.ts` exercises `/beads`, waits for a loaded
record, inspects acceptance criteria, claims and starts work, waits for the
prompt response and refreshed Ready state, switches to In progress, and captures
a 60-column fullscreen view. Screenshots are emitted at each checkpoint. The
Drive `run` command type-checks the Effect program before executing it.

Requires compatible `opencode2` and `bd` on PATH. Run from the repository root;
`BEADS_PLUGIN_DIRECTORY` optionally selects another plugin checkout for A/B
testing. Set `OPENCODE_DRIVE_MEDIA_DIR` to choose the screenshot directory.
The same script failed on `f3fb6fb` at the initial loaded-record wait and passed
on the `.tsx` fix using CLI beta-19378. Source-only tests had passed both versions;
this is why the real compiled TUI is a separate required gate. CI's default lane
does not install the external OpenCode or Beads executables.
