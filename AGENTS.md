# Working on opencode-beads

- Read PRODUCT.md and TECH.md; keep behavior and compatibility evidence current.
- Target OpenCode V2. Read https://opencode.ai/v2/docs/build/plugins and its
  CLI/RPC references before host changes. Verify installed SDK types; never invent
  declarations. Pin the beta SDK and coordinate OpenTUI/Solid upgrades.
- Use `@opencode/plugin/effect` on the server. Keep Effects lazy; the host owns
  execution, interruption, and Scope. No nested runtimes in handlers. The TUI
  follows the host's Solid/Promise interface.
- One package: Beads runs on the server, shared RPC has no server imports, and
  the TUI has no subprocess/database access.
- Beads owns readiness and ownership. Never infer readiness from status or
  initialize, mutate, or synchronize a workspace while browsing.
- Run `bun install --frozen-lockfile`, `bun run check`, `bun run format:check`,
  and `bun run scripts/package-smoke.ts`. After UI changes, run `bun run test:tui`
  and inspect Drive screenshots using isolated fixtures. Recheck installed-package
  and native rendering behavior after host dependency upgrades.
- Keep cyclomatic complexity ≤10 and nesting ≤3. Prefer named operations, guard
  clauses, and tests of behavior across real seams.
- Do not publish packages or create upstream PRs during routine development.

## Beads and live testing

- Track work in Beads (`ocb`). Browse with `beads_list`/`beads_show`, claim with
  `beads_claim`. Use explicit `bd --sandbox` commands for creation, dependencies,
  and completion, with `opencode:<sessionID>` as the write actor. Record follow-ups
  and close completed work with verification evidence; Beads owns scheduling.
- `opencode.jsonc` loads `./dev-plugin`. Point global dogfooding at this checkout;
  avoid a second copy with the same plugin ID. The narrow entrypoint keeps database
  writes outside recursive plugin watching; imported sources are watched separately.
- Dolt/runtime files are local and ignored; tracked `.beads` config has no issue
  data. Fresh clones need explicit `bd init` or a configured Dolt remote pull,
  never automatic initialization by the plugin.
