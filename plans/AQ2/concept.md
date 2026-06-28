# AQ2 — Concept seed: add an opt-in sandbox

**Status:** SEED — not locked. Founder split (2026-06-27): AQ1 removes the sandbox illusion (run on the host); **AQ2 adds the ability to have a real sandbox, opt-in.** This seed records direction + the research it must be designed from (`plans/AQ2/research-sandboxing.md`). Run `/concept AQ2` to lock before architecture.

**Fixed inputs:** AQ1 locked concept (run-unit = host working directory, no boundary); AN1 Connection model (held/inherited, hard-rule 4); AN2 provisioning; ETHOS §2 (opt-in, never preemptive).

---

## Direction (from research + founder)

Add isolation as an **explicit, opt-in capability** — never a default wall. **Founder framing (2026-06-28): sandboxing is a property of the *agent*, not the run-unit.** Whether an agent is isolated is attached to the agent and applied wherever it runs — on the local desktop or on a remote desktop joined to this instance (remote is a *scheduler/distribution* concern that runs the task host-local; it is orthogonal to isolation, and is kept untouched by AQ1). Three things the locked concept must settle:

1. **The isolation mechanism is not ours to invent first — survey says lean on what exists.**
   - **Local (Mac):** prefer the **harness's own OS-native sandbox** (Seatbelt) — it already isolates files while keeping logins via allowlist; offer **Apple `container`** (per-container microVM) where Apple-Silicon + macOS 26, Lima/Colima fallback.
   - **Local (Linux):** harness bubblewrap/Landlock; rootless Podman / gVisor for more.
   - **Remote / multi-tenant:** **Firecracker** microVM — build-or-buy (E2B/Fly). Never plain containers for untrusted code.

2. **The credential doorway — the load-bearing new idea.** Tools keep working under isolation because the **secret stays outside the box and the agent's authenticated effect is mediated**: an egress credential-injection proxy and/or an outside-the-sandbox MCP/tool-server that holds the upstream credential. The agent only ever sees a placeholder. This **dissolves** the original "isolation vs inherited OAuth" tradeoff and honors AN1 hard-rule 4 (token never extracted, used in place). The fragile "let the command escape to the host" model is explicitly rejected as the boundary.

3. **What the user does for an isolated tool.** Under real isolation (microVM/remote), inherited ambient logins are gone; the user's path is the doorway above (proxy/tool-server) and/or converting the tool to a **held** Connection (AN1/AN2). Name this, don't leave it implicit.

## Likely nouns to lock (for `/concept AQ2`)

- **Isolation level** — the opt-in dimension added to the AQ1 run-unit (closed set, e.g. `none(AQ1) | harness-native | local-microvm | remote-microvm`).
- **Credential doorway** — the proxy / outside tool-server that mediates authenticated effect so the secret never enters the box. (Distinct from AN2 provisioning, which carries held secrets *into* the box; the doorway is the isolated-mode alternative that keeps them *out*.)

## Out of scope (carried from track rules)

- Not a preemptive/default wall; isolation is chosen for genuine cases (shared server, untrusted code).
- Not a re-open of AN1/AN2 concepts; AQ2 consumes them.

See `plans/AQ2/research-sandboxing.md` for the cited basis.
