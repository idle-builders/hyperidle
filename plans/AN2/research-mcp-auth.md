# AN2 — Research: held-token injection against real harnesses

**Scope.** Static-secret auth only — PATs and similar API keys we **hold** and **inject**. OAuth 2.1 / interactive-consent servers are explicitly **out of scope** for held connections; those arrive `inherited` (the harness already holds the auth; HyperIdle never runs a 3-legged OAuth dance — `docs/architecture/connection-model.md` line 23). This note grounds the held path against how the harnesses *actually* consume injected credentials, and mandates the integration-test matrix.

**Fixed inputs.** [[connection-model.md]] (held `token`/`mcp` vs `inherited`), `docs/architecture/run-unit-model.md` (AQ1 — host working dir, real `$HOME`, no isolation), `plans/AN2/concept.md` (re-locked post-AQ1).

---

## 1. What "held" is, narrowed to the static case

| Held kind | Concrete thing | Carrier into the agent |
|---|---|---|
| `token` (MCP bearer) | static secret (PAT / API key) for an external **MCP server** | server entry in harness MCP config + `Authorization: Bearer <token>` (header or per-server token env var) |
| `token` (CLI key) | static secret consumed by a **CLI tool** (`gh`, etc.) | the env var that tool reads (`GH_TOKEN`, `GITHUB_TOKEN`, …) |
| `mcp` | URL of a service's own MCP server (server holds its auth, or none) | server entry in harness MCP config (URL only) |

The MCP spec confirms the split we rely on: static **Bearer is sufficient** for internal/team servers; only public servers **must** do full OAuth 2.1 + PKCE ([MCP authorization spec](https://modelcontextprotocol.io/specification/draft/basic/authorization); [Auth0 June-2025 update](https://auth0.com/blog/mcp-specs-update-all-about-auth/)). Bearer is header-only (`Authorization: Bearer`), never query string. stdio servers take credentials from the **environment**, not OAuth.

---

## 2. The injection seam already ships — we are generalizing, not inventing

For HyperIdle's own inbound bridge, every CLI session today writes a per-session MCP config into the **working directory** and injects a per-session bearer token. AN2 points the same machinery at external servers + held tokens.

**Proven code (do not re-derive):**
- `packages/server/src/harness/cli-harness-adapter.ts:353-372` — per-session token env injected **outside** the allowlist (`config.mcpTokenEnv → resolvedEnvMap`), merged by `buildSandboxedEnv()` (`:243`). Injected vars are NOT from `process.env`; they live only in the spawned child and die with it.
- `cli-harness-adapter.ts:332-351` — `CODEX_HOME` injection: codex reads the **per-session** `<sandbox>/.codex-home/config.toml`, never the real `~/.codex`.
- `packages/server/src/harness/cli-mcp-config.ts` — dialect writer for `codex-toml` (`<sandbox>/.codex-home/config.toml`, token via `bearer_token_env_var`) and `opencode-json` (`<sandbox>/opencode.json`, token inline in `headers.Authorization`). Writes into `sandboxPath` only.
- `session-provisioning.ts` Phase 8b (~`:731-793`) — the spawn seam; writes claude's native `.mcp.json` into cwd in the same block.

**Post-AQ1 hard constraint.** The working dir is disposable but **`$HOME` is the user's real home**. Inject only into (a) the **child process env**, or (b) **working-dir-scoped config files**. **Never** write a held secret into `$HOME` (`~/.config/gh`, `~/.netrc`, `~/.codex/config.toml`, `~/.claude.json`) — that pollutes the user's machine and outlives the session, breaking the ephemeral contract. The shipping code already honors this; AN2 must keep honoring it as it fans out.

---

## 3. The delta AN2 actually builds

1. **1 → N servers.** The config writers emit a single `hyperidle` entry; AN2 emits one per held connection (`github`, `stripe`, …). Mechanical extension.
2. **Per-server tokens.** One `HYPERIDLE_MCP_TOKEN` today → one per connection. codex's `bearer_token_env_var` is already per-server; generalizes cleanly.
3. **CLI-key sub-case (new).** A PAT consumed by a CLI tool, not an MCP server → inject the service-specific env var. Same seam, different var name.
4. **Carrier decision per connection.** Architecture decides, per held connection: MCP-server entry (header/token-env) vs CLI env var. Keyed by service config, never per-service code (AC: a second service is configuration, not new code).

---

## 4. Honest reality risks (what the integration test must catch)

- **"Inject the secret" ≠ "the tool uses it."** Env injection only works if the tool reads a known var. `gh` reads `GH_TOKEN`/`GITHUB_TOKEN` ✅. **`git` does not** — it needs a credential helper or the token in the remote URL. So per service we must know the consumption convention; a bare env var is not universally sufficient.
- **claude project-MCP trust.** claude reads a cwd `.mcp.json` (it does today for the inbound bridge), but project-scoped MCP servers can trigger an approval/trust prompt — which a headless spawn cannot answer. Must confirm an external held server actually connects without a prompt.
- **codex `bearer_token_env_var`** must resolve the per-session injected var (not `process.env`) for an *external* server entry, not just the inbound one.
- **opencode inline-header** must carry an external token the same way it carries the bridge token.

---

## 5. Integration-test mandate — per harness, real CLI, real deployed session

**Non-negotiable (strengthens the live-proof AC).** Injection is the whole value of AN2; it cannot be proven by unit tests against our own config writer (that only proves we wrote a file). It must be proven by **spawning a real session through each real harness adapter and confirming the agent actually authenticates to and calls a real MCP server / CLI tool with the held token.** A green test against a stub of our own client proves nothing ([[feedback_no_stubs_from_memory]], [[feedback_mock_validation_trap]], [[feedback_live_proof_lanes_run_before_ship]]).

**The matrix — every carrier path gets a real end-to-end run:**

| Harness | Carrier under test | Real binary | Proof |
|---|---|---|---|
| **claude-code** | native `.mcp.json` in cwd, `headers.Authorization: Bearer` | real `claude` CLI | held external MCP server connects (no trust prompt) + a tool call returns real data |
| **codex** | `<sandbox>/.codex-home/config.toml` + `bearer_token_env_var` (injected env, `CODEX_HOME`) | real `codex` CLI | external server entry authenticates with the per-session token + tool call succeeds |
| **opencode** | `<sandbox>/opencode.json`, inline `headers.Authorization` | real `opencode` CLI | external server authenticates + tool call succeeds |
| **CLI-key sub-case** | service env var (`GH_TOKEN`) injected into child env | real `gh` (and a `git` check) | `gh` op succeeds; `git` documented as needing a helper, not a bare env var |
| **builtin** (SDK loop) | registry injection (no CLI config file) | in-process | held server reachable via the builtin path (or explicitly scoped out with reason) |

**Test shape.** `*.integration.test.ts` that (1) provisions a **real deployed session** (the actual session-provisioning spawn path, not a hand-built config), (2) spawns the real harness binary where available, (3) points it at a **real MCP server over a real transport** — an in-repo standard MCP server is acceptable; a stub of our own client is **not** — (4) asserts the agent retrieved real data through the held connection. Run locally (real CLIs + live transport are local-lane per [[feedback_e2e_local_only]]); the suite is `test:integration` / `test:e2e`, not a GitHub Actions job.

**Skip discipline.** If a harness binary is not installed in the run environment, the test **skips with a loud logged reason** and the WP is not `done` until each carrier has at least one real run on a machine where its binary exists ([[feedback_agent_behavior_needs_live_eval_and_forcing]] — prove the hardest member, not just claude/builtin). No carrier ships injection-unproven.

---

## Sources

- [MCP Authorization spec (draft)](https://modelcontextprotocol.io/specification/draft/basic/authorization)
- [Auth0 — MCP June 2025 spec / auth](https://auth0.com/blog/mcp-specs-update-all-about-auth/)
- [Connect Claude Code to tools via MCP](https://code.claude.com/docs/en/mcp)
- [Claude Code #38972 — static Bearer HTTP MCP flagged "needs authentication"](https://github.com/anthropics/claude-code/issues/38972)
- [claude-ai-mcp #112 — can't set `Authorization: Bearer` for custom remote MCP](https://github.com/anthropics/claude-ai-mcp/issues/112)
- Code: `cli-harness-adapter.ts:243,332-372`, `cli-mcp-config.ts`, `adapter-pool.ts` `CLI_TOOL_CONFIGS`, `session-provisioning.ts` Phase 8b.
