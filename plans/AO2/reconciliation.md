# AO2 — Spec reconciliation (READ FIRST)

The TRACK-AO.md AO2 spec predates the shipped AO concept (PR #366) and the AN reset (PR #364). Where they conflict, **the shipped concept + merged code win** (memory: verify-against-code-not-docs). This note is the reconciled input for `/architecture`, `/write-tests`, `/review`, `/write-docs`.

## The one load-bearing reversal — credentials IN the sandbox

- TRACK-AO.md AO2 AC#4 + a validation scenario say **"no repo/forge credential present in the sandbox; auth applied by the system at checkout/push, never handed to the agent."**
- This is **STALE / reverted-broker garbage.** `docs/process-layer/filesystem-primitive.md:70` and `plans/AO/concept.md` l.131 (shipped PR #366) state the opposite:
  > **Agents work *with* their credentials.** For a code filesystem with a forge, the repo is checked out **and** the forge auth (from the bound Connection) is provisioned into the sandbox so the agent's own `git`/`gh` fetch/push/PR — like a real employee. We do **not** withhold credentials. The review gate (AL7) checkpoints *irreversible landing*, not access.
- Pattern: **durable-auth → disposable-sandbox** (PR #364). The durable secret lives encrypted in the Connection record; a **disposable** projection is provisioned into the per-session sandbox and dies with it. No durable secret persists on the filesystem record (the Connection holds it, by reference).
- Memory: `project_trust_agents_design_for_power`, `project_ao_product_substrate_concept`, `project_an2_provisioning_concept`. **Do NOT design against a rogue agent. No broker-only path. Security is never preemptive.**

## Reconciled acceptance criteria (build to THESE)

1. **Materialize.** When a session starts for a bot with an injected `code` filesystem, the sandbox contains that repo's working tree at its branch; the agent can read, edit, and run build/test commands. Materialization is driven by the bot's injected filesystems — resolve `sessions.agentId → filesystem_injections → filesystems` — **never a global path**.
2. **Capture.** The agent's working-tree changes are captured per the filesystem's `writeback` (`git` → commit; `file` → file write; `none` → read-only) — not lost when the sandbox is destroyed.
3. **Degrade.** A session for a bot with **no** injected filesystem still provisions and runs (no working tree), exactly like today. Internal tools still work.
4. **[RECONCILED] Disposable creds present.** For a code filesystem whose Connection supplies forge auth, the auth **is** provisioned into the sandbox (disposable projection) so the agent's own `git`/`gh` act. The durable record stores no plaintext secret; the provisioned auth is ephemeral (dies with the sandbox). The *test* here is "the durable filesystem/sandbox-snapshot record carries no plaintext secret AND the projection is sandbox-scoped/disposable" — **not** "no cred anywhere in the sandbox" (that AC is dead).

## Shipped seams to build on (verified on origin/main @ 2012467d)

- **Filesystem model (AO1):** `packages/db/src/schema.ts:870-940` — `filesystems` (`id, teamId, source, kind('code'|'doc_set'), connectionId(plain text, optional), resourceRef(JSON), writeback('git'|'file'|'none'), state, createdAt`) + `filesystem_injections` (`{agentUserId, filesystemId}` UNIQUE). Migration `0040_chubby_chimera.sql`.
- **Auth seam (AN1, merged):** an `AuthResolver` with `resolveToken(connectionId): Promise<string|null>` already exists and is used by AO1 reachability (`packages/server/src/__tests__/AO1-filesystem-reachability.test.ts:190`, `AO1-reachability-lane-b.integration.test.ts:131`). **AO2 reuses this seam** to fetch the forge token system-side, then provisions a disposable projection into the sandbox for checkout/push. `null` → unauthenticated (public/local repo).
- **AN2 is NOT merged** (concept-locked PR #368, blocked on AQ1). Do **not** depend on built AN2. AO2 owns the filesystem-mount + git-auth-for-checkout path via the AN1 `resolveToken` seam; keep the seam clean so AN2's general connection-provisioning can later subsume/compose it without contradiction.
- **Provisioning hook:** `packages/server/src/services/session-provisioning.ts` — `admitSession()` Phase 4 spawns the sandbox (`workspace.spawn`), Phase 6 `strategy.assembleContext({db, sandboxPath, sessionId, agentId, ...})`. Materialization wires in around the spawn/context phase. `sandboxSnapshot` column on `sessions` records the path.
- **GitRunner export-only:** `packages/fabric/src/services/git-export-runner.ts:18-41` — `init/add/commit/push/diffCached/lsFiles/...`, **no `clone`/`fetch`/`checkout`**. AO2 adds inbound-git capability (extend `GitRunner` or a sibling materializer). Note its env hardening (`GIT_TERMINAL_PROMPT=0`, `GIT_ASKPASS=/bin/false`, cred-redacted logs) — match it.
- **Artifacts:** `schema.ts:848-865` — kernel-only (`id, producingTaskId, kind, label, previewJson, createdAt`); **no provenance/commit columns, no cost** (cost moved to strategy layer). If AO2 needs to link captured output → filesystem+commit, decide inline columns vs extension table in `/architecture`.

## Live-proof requirement (non-negotiable for DONE)

Spec "Plan calls" + memory `feedback_live_proof_lanes_run_before_ship`: a **real session checks out a real repo, the agent edits a file + runs the project's test command, and the change is captured** — proven by executing the path, before `done`. Stubs/fixtures/review are not proof. Build a live-proof lane (integration test that exercises the shipped provisioning route against a real local git repo).

## Out of scope (hold the line)

Review/land (AO3, parked on AL7). Product scope (AO4). The Connection auth *mechanism* itself (AN). Harness selection (AM). No Drive/Dropbox two-way sync engine — only authored-corpus materialization.
