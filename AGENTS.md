# Working on opencode-beads

- Target OpenCode V2 only. Read https://opencode.ai/v2/docs/build/plugins and the
  CLI/RPC references before changing host integrations. Verify against installed
  SDK types; never invent declarations to conceal a mismatch.
- Server plugins use `@opencode/plugin/effect`. Keep Effects lazy and let the
  host own execution, interruption, and Scope. Never start a nested Effect runtime
  inside a server handler. The TUI follows the host's Solid/Promise interface.
- Read PRODUCT.md and TECH.md. Keep actual behavior and compatibility evidence
  in sync with these documents.
- One package. Keep Beads execution on the server, the shared RPC contract free
  of server imports, and the TUI free of subprocess/database access.
- Beads is authoritative for readiness and ownership. Never infer readiness from
  list status. Never initialize or mutate a user's workspace while browsing.
- Use `bun install --frozen-lockfile`, `bun run check`,
  `bun run format:check`, and `bun run scripts/package-smoke.ts`.
- Functions must stay at cyclomatic complexity ≤10 and nesting ≤3; prefer named
  operations and guard clauses. Tests should exercise behavior across real seams.
- Pin the beta OpenCode SDK and coordinate OpenTUI/Solid versions. Recheck the
  installed package and native rendering after host dependency upgrades.
- Do not publish packages or create upstream PRs as part of routine development.
- Use `bun run test:tui` (OpenCode Drive) for actual TUI acceptance after UI
  changes. Inspect its screenshots; source-render tests alone do not exercise
  the compiled host's runtime transforms. Keep all Drive fixtures isolated.

## Dogfood the workflow

- This repository uses Beads (prefix `ocb`) to track real work. Browse with the
  plugin's `beads_list` / `beads_show` tools and claim the active bead with
  `beads_claim`. Use explicit `bd` commands for creation/dependencies/completion
  until those operations are implemented in the plugin; use `--sandbox` to keep
  synchronization deliberate and the same `opencode:<sessionID>` actor for writes.
- Keep discoveries and follow-up work in Beads; close completed work with concrete
  verification evidence. Beads owns readiness, including dependency ordering.
- `opencode.jsonc` loads this checkout (`./dev-plugin`) for live testing. The small
  entrypoint directory keeps Beads database writes outside the host's recursive
  plugin watcher; imported source files are watched individually. Avoid loading a
  second installed copy with the same plugin ID. The global dogfood installation
  should point to this same checkout.
- Beads' Dolt database and runtime files are local/ignored; tracked `.beads`
  configuration does not contain issue data. A fresh clone needs an explicit
  `bd init` or configured Dolt remote pull before browsing; never initialize it
  as a side effect of the plugin.
