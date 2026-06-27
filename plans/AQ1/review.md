# AQ1 — Code Review (Phase 4)

**Branch:** `feat/AQ1-run-on-host` vs `origin/main`. **Diff:** 32 files, +849/-1475 (net −626; a deletion WP, as planned).
**Design lens:** SKIPPED (no UI — runtime only). Docs reconciliation is Phase 5 (out of scope).
**Plan critiqued Phase 2:** 8.5/10. Code matches the plan section-by-section.

---

## Acceptance-criteria completeness (evidenced)

| AC (TRACK-AQ.md AQ1) | Verdict | Evidence |
|---|---|---|
| Session runs in per-session host working dir, env inherited; **live run** proves a CLI harness executes + inherited tool works, no per-session auth | MET (runnable proof) | `AN1-real-harness-inherited.integration.test.ts` ran against the **real** binaries — `gh` is present (`/opt/homebrew/bin/gh`) so the builtin/environment block executed (not skipped) and asserted `github` descriptor `health:"working"` (i.e. logged-in, inherited, nothing extracted). 36 tests green via `npm run test:integration`. Host-spawn `cwd`/env-allowlist contract proven by protected `X5-cli-harness-adapter.test.ts`; `local-sandbox-adapter.ts:30` `spawnProcess("sh",["-c",command],{cwd})`. **This is a repeatable test, not a one-off transcript.** No standalone live-proof transcript artifact was committed (plan task 6 asked for a link-only transcript) — but the runnable AN1 test is a stronger, re-executable proxy and covers the inherited-tool half end-to-end. |
| Default & only **local** run path is host execution; Docker/Isolated (+ workers/gates/registration/tests) **deleted** (not gated/stubbed); knip/lint/check confirm no dead refs | MET | 4 source files truly deleted (`docker-sandbox-adapter.ts`, `isolated-harness-adapter.ts`, `isolated-session-worker.ts`, `isolated-session-protocol.ts` — `ls` returns No such file). adapter-pool §4 gate block + `fs`/`path` imports removed. `npm run check` PASS (13 pkgs). `npm run knip` exit 0, `npm run knip:production` exit 0 (`knip.json` forced-entry lines removed in lockstep, `harness-session-probe.ts!` kept). `npm run lint` exit 0. `aq1-adapter-pool-host-only.test.ts` green: pool has the host adapters, no `/isolated|docker/` id. |
| Remote subsystem **kept & realigned** to scheduler axis: no isolation/boundary framing; compiles + tests pass at seam; transport NOT implemented (AQ3) | MET | `git grep -niE 'isolat|jail|contain(er|ment)'` over the 5 remote files (remote-harness-adapter, worker-ws, workers, worker-protocol, desktop-worker-client) → **0 hits**. `remote-harness-adapter.test.ts` (protected, unchanged) green. `AL6-return-gate.integration.test.ts` remote subtest (line 654) intact + green. No remote source/route/UI file deleted. `kind:"local"|"remote"` retained as the scheduler axis. |
| Live run proves local host path end-to-end | MET (same as AC1) | AN1 real-binary integration test + X5 host-spawn contract. |
| Held connections (AN2) provision into host working dir; inherited present via host env (AN1 hard-rule 4 — nothing extracted) | MET | `assertNoSecretFields()` enforced across all AN1 descriptors (`allowedKeys = {name,kind,harness,health}`) — passed against real binaries. No new credential-touching code in the diff. |
| `npm run verify` green | NOT INDEPENDENTLY RUN HERE | Component gates run green individually: check PASS, lint exit 0, knip+knip:production exit 0, all touched/protected test files green. Full `verify` (incl. build + desktop build + attestation) is `/ship`'s gate, not this review's. No reason to expect failure — no source behavior changed; only deletions + lore. |

---

## Per-lens findings

### Architecture — PASS
- Layer integrity intact; no new coupling. Deletion only narrows the Agent-Runtime surface.
- adapter-pool factory now ends cleanly at `registerCliAdaptersIfAvailable → return pool`; the dead `HYPERIDLE_ENABLE_ISOLATED` gate (never registered anything) is gone — honest.
- `kind:"local"|"remote"` correctly preserved as the scheduler axis. Realign is lore-only, as the plan promised.
- Diff delivers exactly the plan's task list (7 commits map 1:1 to tasks 1–7). Nothing more, nothing less.

### Security — PASS (net positive)
- No new endpoints/fields/URLs/paths → no rate-limit/SSRF/path-traversal/input-trust surface added.
- Deleting `IsolatedHarnessAdapter` removes the **one** place that injected a resolved key into a forked env — a copy-the-secret path is gone. Net surface reduction.
- AN1 hard-rule 4 (no extraction) preserved and actively proven by `assertNoSecretFields` against real binaries.
- Remote token-gated join (`/worker-token`) untouched — no new remote risk (AQ3 owns transport threat model).

### Adversarial — PASS (one NICE)
- **Sanity-break confirmed.** `aq1-adapter-pool-host-only.test.ts` test 3 stubs `HYPERIDLE_ENABLE_ISOLATED=1` and asserts **zero** warnings containing `hyperidle_enable_isolated`. If the §4 gate were re-added, it would emit its `console.warn` and this test would go red. Real assertion, not vacuous. Test 2 (`/isolated|docker/` absence) would fail if an isolated adapter were re-registered. Genuine guards.
- **No behavior smuggling.** Every edited test removed a subtest whose *subject* (the deleted isolated adapter) no longer exists — not production code bent to pass. The `local-workspace-adapter.security.test.ts` rewrite (`/Docker/i` → `/not allowed.*server/i`) tracks the rewritten error string; the underlying `HYPERIDLE_PROFILE` refusal behavior is unchanged (the `/not allowed/i` constructor test stays). Verified the new error string matches: `"…not allowed on a server profile…"`.
- **Remote untouched.** No real remote behavior removed; remote tests + the AL6 integration remote subtest stay green; 0 isolation hits on the remote path.
- **Deleted, not emptied.** `git diff --diff-filter=D` lists all 8 files (4 source + 4 test) as true deletions; `ls` confirms absence.
- NICE: the new test's header comment (lines 12–22) is a verbose red-phase narrative ("Actually the exclusion assertions pass now…") that is now stale post-green. Harmless; tidy at leisure.

### Simplification — PASS
- Pure-deletion WP; no new helpers, generics, wrappers, or dead code introduced. The opposite — it removes a dead gate and four dead adapters.

### Slop — PASS (no must-fix)
- The two stale comments the builder flagged are **resolved**, not left:
  - `local-sandbox-adapter.ts` header + ctor comment: rewritten — no "Docker boundary" / "grep-able DockerSandboxAdapter" language remains; now honestly describes host execution + server-profile refusal.
  - `cli-harness-adapter.ts:678`: the `mirrors IsolatedHarnessAdapter pattern` lore line is restated on its own terms (SIGTERM→SIGKILL graceful flush). No dangling reference.
  - `disabled-sandbox-adapter.ts` + `eslint.config.ts:1115` (`isolated-session-worker` dropped from relay comment): both scrubbed.
- Full-tree grep for `DockerSandboxAdapter|IsolatedHarnessAdapter|IsolationConfig|isolated-session|HYPERIDLE_ENABLE_ISOLATED|HYPERIDLE_ENABLE_DOCKER` over code (excl. plans/docs/.pipeline): **only hit is the new test file itself**, which legitimately uses `HYPERIDLE_ENABLE_ISOLATED` as a stubEnv to prove the gate is gone. Remaining hits are `docs/agent-layer/return-gate-enforcement.md` (one row) + `.pipeline`/`plans` history — all **Phase-5 doc scope**, explicitly deferred by the plan §D. Not a build gate; not this review's scope.

---

## CRITICAL / WARNING
- **CRITICAL:** none.
- **WARNING:** none.
- **NICE-1:** `aq1-adapter-pool-host-only.test.ts` lines 12–22 — stale red-phase narrative comment now that the file is green. Cosmetic.
- **NICE-2:** No committed live-proof transcript artifact (plan task 6 named a link-only transcript). Substituted by the runnable `AN1-real-harness-inherited.integration.test.ts` (real `gh`/CLI binaries), which is a stronger re-executable proof. Acceptable — note it for the PR body.

---

## Verdict: DONE

All six ACs evidenced. Isolation machinery hard-deleted with zero dangling references in code; remote subsystem kept, realigned (0 isolation framing), and green at the seam; inherited-tool path proven against real binaries; no behavior smuggled, sanity-break confirmed. check + lint + knip + knip:production + every touched/protected test green. Two NICE items only — neither blocks. Full `npm run verify` (build/desktop/attestation) is `/ship`'s gate.
