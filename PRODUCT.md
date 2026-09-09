# Product

Browse Beads work in OpenCode V2 and explicitly claim it for a session. Beads
owns readiness, status, and ownership.

## Browse

Design the queue around choosing useful work: titles lead, metadata recedes,
and selecting a bead reveals a read-only preview when space allows. Enter opens
full detail; claim and context actions live beside that detail with in-place
feedback. At small widths keep every mouse control reachable; remove secondary
chrome before sacrificing content. Use host theme tokens, restrained separators,
and distinct hover, selection, and keyboard-focus states.

`/beads` toggles a session panel, or a full-page workbench outside a session.
Show keyboard ownership and the configured shortcut back to the conversation.
Clicks activate the panel; returning focus restores the current list, detail,
or search widget without taking focus from host dialogs. Hide the size action
when narrow terminals force fullscreen.

- Default to Ready; also offer In progress and Open. Use Beads' dependency-aware
  readiness, never infer it from status.
- Show IDs, priority, status, title, and owner with keyboard navigation and visible
  shortcuts. Search loaded results by ID, title, owner, and label; show the cap.
- Rows support click-to-inspect and mouse-wheel scrolling. View tabs, Search,
  Clear, Back, Refresh, Close, Add context, and Claim & start are clickable.
- Inspect description, design, acceptance criteria, notes, and dependencies.
  **Add context** stores a passive session reference without claiming work or
  queuing a model turn. Reattaching updates that bead's location-specific entry.
  Beads larger than the host's 8 KiB entry limit retain an explicit full-lookup
  reference; resolving it requires the session to be in the recorded location.
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

## Session work intelligence

Approved milestone: `ocb-ycs`, `ocb-4x8`, `ocb-29i`. Extend the existing terminal
design; no separate visual mock was supplied.

1. Claimed work automatically supplies a bounded work brief to subsequent model
   calls, including after compaction and plugin reload. It contains current owned
   work, acceptance criteria, notes and dependency references. Merely browsing or
   attaching a reference never makes it active work or starts an agent turn.
2. The brief supports multiple beads, emphasizes the most recently claimed work,
   and identifies omitted fields/beads and unavailable reads. Humans and agents can
   inspect and explicitly refresh it. Closed or reassigned beads cease to be active
   context; moving the session never resolves earlier IDs in its new database.
3. Finish is an explicit action on linked, owned work. Require a nonempty summary
   and validation evidence; optional artifact/commit references are retained with
   them. Completion evidence is supplied by the caller, not inferred from an idle
   session or a successful model/tool turn.
4. Finishing checks current location and ownership, records evidence, closes via
   Beads, then retires the active link. Failed or interrupted completion is
   recoverable without silently changing the submitted evidence. A repeat finish
   reconciles its previous result rather than closing a different work generation.
5. Finish returns work observed newly Ready since its saved before-snapshot, along
   with any refresh failure. Concurrent changes may contribute to this set: it is
   not a claim that closing this bead alone caused every newly Ready result.
6. Inspecting a bead reveals its immediate dependencies and dependents with titles,
   states and recorded relationship types. Navigate directly to a related bead;
   preserve ordinary Back, search, keyboard and mouse focus behavior. Missing or
   external references and result caps remain visible.
7. Suggested-next work uses current Beads Ready membership, priority and explained
   relationship counts. It never automatically claims, rewrites priorities, or
   treats graph connectivity as readiness or proof of safe parallel file edits.
8. All graph/context browsing remains read-only and bounded. The core milestone
   requires only `bd`; optional `bv` advanced analytics and broader project-memory
   injection are follow-ups. Acceptance commands and compatibility limits are in
   [TESTING.md](TESTING.md).
