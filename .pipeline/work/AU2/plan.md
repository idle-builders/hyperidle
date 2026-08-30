# AU2 — Plugin defaults become editable configuration

Shipped. A single configuration store holds defaults and user overrides for every kind of thing that
shapes agent behaviour, with provenance attached, instead of each domain inventing its own
default/override rules.

**Kinds.** `agent`, `skill`, `routine`, `trigger`, `tool`, `mcp_server`, `harness_descriptor`.

## Why one store rather than seven

The alternative was provenance columns added directly to `users`, `routines`, `user_skills`,
`server_config` and every future trigger/tool table. Reads would have stayed local, but
default/override/origin behaviour would be re-implemented seven times and plugin disable/remove logic
would drift between them. AU2 is the foundation AU3–AU5 build on, so one resolver was chosen: it
centralises provenance and the user-wins rule while leaving existing domain contracts alone. Config
projects into domain tables only where the runtime already needs those rows.

## Boundaries that must hold

- **Config is data, never executable.** Tool handlers stay first-party registered code; config
  descriptors gate and catalogue them. Plugin *execution* is a separate, unbuilt work package.
- **Secrets never enter config.** MCP entries store descriptors only; credentials stay in
  `server_credentials` and `service_connections`.
- **Adapter registration is not config.** Harness descriptors mix DB-free adapter-pool state with
  user-disabled intent; config owns the descriptor and the disabled intent, the pool owns registration,
  and the built-in harness keeps its hard exemption.
- **Unmatched agents are `origin.type="user"`.** The backfill cannot reliably tell a user-created agent
  from a built-in one, so anything it cannot match is treated as user-owned rather than given false
  built-in provenance.
