# Product

Browse Beads work in OpenCode V2 and explicitly claim it for a session. Beads
owns readiness, status, and ownership.

## Browse

`/beads` opens a session panel, or a full-page workbench outside a session.
Use the host's theme, focus, and fullscreen behavior.

- Default to Ready; also offer In progress and Open. Use Beads' dependency-aware
  readiness, never infer it from status.
- Show IDs, priority, status, title, and owner with keyboard navigation and visible
  shortcuts. Search loaded results by ID, title, owner, and label; show the cap.
- Inspect description, design, acceptance criteria, notes, and dependencies.
  **Add context** sends the bead to the conversation without claiming or starting it.
- Refresh explicitly, preserve selection by ID, cancel superseded requests, and
  abort work on close. Distinguish loading, empty results, search misses, missing
  `bd`, uninitialized workspace, and backend/refresh failures. Give actionable
  errors and never present stale results as current.
- Agents use `beads_list` and `beads_show` through the same server-side reader.

Browsing never initializes, mutates, or synchronizes Beads. It needs no LLM call
or background polling.

## Claim and start

**Claim & start here** changes ownership/status and queues a work prompt in the
current session. `beads_claim` uses the invoking session and returns context to
the agent without submitting another prompt.

- The owner is `opencode:<sessionID>`. Conflicts or changed issue state must not
  overwrite another actor. Dependency readiness is checked before the atomic
  ownership operation; the tested Beads cannot make both checks atomic.
- Persist claim intent before mutation, then confirm ownership. Persist the exact
  prompt body and message ID before submission. Retry the same ID after an
  interrupted handoff; submission means accepted, not completed work.
- Storage or prompt failure never implicitly releases a claim. Show its durable
  phase and a retry path. Resolve the session location before mutation and again
  before submission; a stale panel cannot redirect work.
- Renew claims only during observed session execution, after checking location
  and ownership. A saved link or open workbench is not execution evidence.

## Multiple beads per session

A session may claim/start multiple beads. Each bead has its own durable claim
state and prompt ID; starting another bead preserves earlier handoffs. Repeating
Start resumes only that bead's handoff or reports its existing submission.

Associations belong to a session **and location**. Moving a session preserves
earlier associations without interpreting their IDs in the new database.
Same-session mutations are serialized, including across moves and plugin reloads.
The UI uses a links collection; the existing single-link RPC stays compatible.
Legacy one-link records remain readable without losing retry state.

## Next

Close work with validation evidence; explain blockers and dependents; capture
follow-up beads from the conversation. Acceptance commands and compatibility
limits are in [TESTING.md](TESTING.md).
