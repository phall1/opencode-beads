# Beads, inside the work

## Product thesis

Make the next useful action obvious without leaving OpenCode. The human and the
agent should see the same work, identifiers, and readiness rules. Beads remains
the source of truth; OpenCode is where understanding becomes execution.

This is a new standalone project. The initial direction is inferred from the
request to build a native V2 listing slice; no visual mock was supplied.

## First vertical slice

`/beads` opens a native session panel alongside the conversation. Outside a
session it opens a full-page workbench. Small terminals use the host's fullscreen
panel behavior. All colors use the active OpenCode theme.

- Start with **Ready**, using Beads' own dependency-aware readiness semantics.
- Switch between Ready, In progress, and Open without remembering CLI flags.
- Search the loaded results by ID, title, owner, and label. Clearly show the
  result cap; local search must never imply it searched the entire database.
- Show stable IDs, priority, status, title, and ownership; do not rely on color.
- Keyboard-first navigation with visible shortcuts and clickable view tabs.
- Inspect a bead's full description, design, acceptance criteria, notes, and
  dependency references on demand.
- Explicitly send the selected bead to the current conversation as context.
  This does not claim the bead or ask the agent to start implementation.
- Give agents structured `beads_list` and `beads_show` tools using the same
  server-side module as the human interface.
- Refresh explicitly, preserving selection by ID. Cancel superseded requests
  and dispose in-flight work when the panel closes.
- Loading, no ready work, no search matches, missing `bd`, uninitialized workspace,
  backend failure, and refresh failure are distinct. Errors offer a concrete next
  action. Do not present stale results as current after a failed refresh.

Listing and inspecting never initialize, claim, edit, close, or synchronize beads.
No LLM call is needed to browse. No background polling when the workbench is shut.

## Acceptance evidence

1. The packed package exports valid V2 server, TUI, and RPC entrypoints.
2. Type checking uses the actual V2 SDK; no locally invented host declarations.
3. Process tests exercise JSON decoding, bounded output, timeout, cancellation,
   argument isolation, and failure classification.
4. Workbench tests cover filtering, latest-request-wins, and stable selection.
5. Native OpenTUI render tests cover populated, empty, loading, and error states,
   including narrow layouts and keyboard interaction.
6. Exercise the adapter against an isolated real Beads workspace when the local
   installation supports it; record the exact tested versions and limitations.

## Highest-value next slices

Ordered by usefulness in the daily **orient → choose → execute → finish** loop:

1. **Claim and start** — atomic Beads claim, explicit session linkage, and a
   focused work prompt. Show ownership conflicts immediately. This closes the
   gap between seeing work and doing it.
2. **Finish with evidence** — review the change, capture validation, close the
   bead, and show newly unblocked work. Make finishing as easy as starting.
3. **Dependency explanation** — “why is this blocked?” with navigable blockers,
   dependents, and epic progress. Explain Beads' graph instead of inventing a
   second readiness model.
4. **Capture without interruption** — turn a discovery or selected message into
   a bead with a relationship to the current work; return focus to the session.
5. **Resume and handoff** — remember bead/session association and surface the
   latest evidence and next action across compaction, worktrees, and restarts.
6. **Attention, not noise** — refresh after relevant operations, surface newly
   ready work and ownership changes, with scoped subscriptions and a polling
   fallback only while visible.

Evaluate stickiness through repeat workbench use, time to choose work, completed
claim-to-close loops, and successful handoffs. Initially gather this through
dogfooding and user feedback; the first slice includes no analytics collection.
