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
