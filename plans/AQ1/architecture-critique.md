# AQ1 — Architecture Critique

**Plan under review:** `plans/AQ1/architecture.md`
**Concept (locked):** `plans/AQ1/concept.md`
**Spec:** `.pipeline/work-packages/TRACK-AQ.md` → AQ1
**Reviewer:** fresh evaluator (not the plan author). Claims independently re-verified by grep + file reads against the AQ1 worktree.
**Date:** 2026-06-28

**Verdict: NEEDS-REVISION.** Overall **6.5/10**. The plan is conceptually correct, well-reconciled against code on the hard questions (remote = no isolation framing; CredentialResolver kept; the §4 gate; the run path), and almost all line-level test claims are accurate. But the deletion map is **incomplete in two places that will break `npm run verify`** — exactly the AC ("`knip`/`lint`/`check` confirm no dead references") the plan promises to satisfy. Both are concrete, named, one-line-to-fix. Fix them and this is a clean APPROVED.

---

## Independent verification summary

| Plan claim | Verified? | Note |
|---|---|---|
| 4 isolation source files exist & are deletable | ✅ | `docker-sandbox-adapter.ts`, `isolated-harness-adapter.ts`, `isolated-session-worker.ts`, `isolated-session-protocol.ts` present. |
| §4 gate block at adapter-pool.ts lines ~504-540 | ✅ | Exact. Gate reads `HYPERIDLE_ENABLE_ISOLATED`, never registers. Dead path. |
| `fs`/`path` imports (lines 9-10) used **only** in §4 block | ✅ | Sole uses at lines 525-529. Conditional removal is correct — they WILL be unused after the cut. |
| Remote subsystem carries **zero** isolation framing | ✅ | `grep -iE 'isolat\|jail\|contain\|boundary'` over `remote-harness-adapter.ts`, `worker-ws.ts`, `workers.ts`, `desktop-worker-client.ts` → only hit is `requireBoundary` (access-middleware, unrelated). `getCapabilities()` returns honest proxy caps (`mcpSupport:false`, `returnEnforcement:"process-reengage"`). **Plan's KEEP-remote decision is correct.** |
| `AdapterMeta.kind:"local"\|"remote"` = scheduler axis | ✅ | Correct; leave it. |
| `CredentialResolver` load-bearing, keep entirely | ✅ | Sole production resolver; only the isolated adapter consumes it in ctor. |
| `HYPERIDLE_ENABLE_DOCKER` comment-only (line 514) + test stub (line 47) | ✅ | Never read. |
| `workspace-adapter.test.ts` Docker block lines 155+, Local block 21-154, import line 5 | ✅ | Exact. |
| `local-workspace-adapter.security.test.ts` Docker-string assertion (`toThrow(/Docker/i)`) line 49; `/not allowed/i` tests lines 43/73 stay | ✅ | Exact. |
| `local-sandbox-adapter.ts` header lore (3-4) + ctor error string (line 69, "Use DockerSandboxAdapter…") + comment ("escape the intended Docker boundary") | ✅ | Exact. |
| `disabled-sandbox-adapter.ts` lore line 9 references DockerSandboxAdapter | ✅ | Exact. |
| `cli-harness-adapter.ts:678` `@lore X5 W1 … mirrors IsolatedHarnessAdapter pattern` | ✅ | Exact. |
| `AL6-return-gate.test.ts` isolated import line 27 + subtest line 318 | ✅ | Exact. |
| `AL6-reprompt-loop.integration.test.ts` isolated subtest line 495 (dynamic import) | ✅ | Exact. |
| AN2 provisioning tests independent of deleted code | ✅ | No AN2/provisioning test imports `IsolatedHarnessAdapter`/`DockerSandboxAdapter`. Safe to protect. |
| Host run path (`cwd=sandboxPath`, env allowlist `["PATH","HOME","LANG"]`) | ✅ | Confirmed at adapter-pool.ts:359,407. Unchanged by AQ1. |
| **knip.json forces the 3 deleted files as entrypoints** | ❌ **MISSED** | See CRITICAL-1. |
| **`AL6-return-gate.integration.test.ts` imports deleted isolated adapter** | ❌ **MISSED** | See CRITICAL-2. |

---

## CRITICAL findings (must fix before build)

### CRITICAL-1 — `knip.json` lists all three deleted files as forced entrypoints; the plan never edits it → `npm run knip` (and `knip:production`, both inside `npm run verify`) will FAIL.

`knip.json` lines 49-51 (`packages/server` → `entry`):
```json
"src/harness/isolated-session-worker.ts!",
"src/harness/isolated-harness-adapter.ts!",
"src/harness/docker-sandbox-adapter.ts!",
"src/harness/harness-session-probe.ts!"
```
The `!` suffix forces these as production entrypoints (that is *why* knip never flagged them as dead until now). Once §A deletes the three files, knip is configured to treat three **non-existent** files as entrypoints — knip errors on a missing configured entry. This breaks `npm run knip` AND `npm run knip:production`, both of which run inside `npm run verify` (task 7) and gate the AC: *"`knip`/`npm run lint`/`npm run check` confirm no dead references remain."*

The plan's deletion map (§A, §C) and task 5 ("clear any newly-dead export the isolation cut surfaced … expect none") never mention `knip.json`. Task 5 expects *near-zero* knip churn — it is in fact a guaranteed knip *config* failure, not a dead-export one.

**Fix required:** §A/§C and task 2 (or 5) must delete the three lines from `knip.json` (`isolated-session-worker.ts!`, `isolated-harness-adapter.ts!`, `docker-sandbox-adapter.ts!`) in the same commit as the file deletions. KEEP `harness-session-probe.ts!` (line 52 — not in the delete set). Add `knip.json` to the file-by-file map and to `sharedFiles`.

### CRITICAL-2 — `AL6-return-gate.integration.test.ts` dynamically imports the deleted `isolated-harness-adapter.js`; the plan marks this file **protected** ("assertions must not change") and never schedules the edit → `npm run check` will FAIL (TS2307).

`packages/server/src/harness/__tests__/AL6-return-gate.integration.test.ts` lines 677-692:
```ts
test("IsolatedHarnessAdapter: returnEnforcement='sdk-inprocess' (inherits inner SDK hook)", async () => {
    const { IsolatedHarnessAdapter } = await import("../../harness/isolated-harness-adapter.js");
    ...
    const adapter = new IsolatedHarnessAdapter(...);
    expect(caps.returnEnforcement).toBe("sdk-inprocess");
});
```
The plan's §A edits `AL6-return-gate.test.ts` (the unit file) and `AL6-reprompt-loop.integration.test.ts`, but **omits `AL6-return-gate.integration.test.ts`** — and worse, lists it in **§B, protectedTests, and Risk-2** as KEPT ("its remote subtest (line 654) is explicitly KEPT") with assertions that "must not change." That instruction is self-contradictory: the file references a symbol the plan deletes.

Because `tsconfig.json` uses `moduleResolution: "bundler"`, TypeScript resolves dynamic-import specifiers — `import("../../harness/isolated-harness-adapter.js")` against a deleted file is a compile error (TS2307), so this breaks `npm run check`, not merely the test at runtime.

Note: this same file's `isolated-shaped-tier2` *mock* (line 545 — a name string + `canForceReturn` bit, no import) is safe and should stay. Only the lines 677-692 subtest + its dynamic import must go.

**Fix required:** Add `AL6-return-gate.integration.test.ts` to §A's "isolation refs inside surviving tests" — remove the `IsolatedHarnessAdapter` subtest (lines 677-692). KEEP the `RemoteHarnessAdapter` subtest (line 654) and the `isolated-shaped-tier2` mock stub (line 545). Correct the contradiction: in §B/protectedTests/Risk-2, the file's *remote* subtest is protected, but the file is **also intentionally edited** (isolated subtest removed) — move it out of the "assertions must not change" protected set, exactly as the plan already does for `AL6-reprompt-loop.integration.test.ts`. Update the Migrations list (`IsolatedHarnessAdapter` row) and the protectedTests footnote accordingly.

---

## WARNING findings (should fix; low blast radius)

### WARNING-1 — `eslint.config.ts:1115` references `isolated-session-worker` in a comment; plan's "complete grep sweep" omits it.
```
// runtime. Forwarding relays (isolated-session-worker, desktop-worker-client)
```
Comment-only, in an AL6 relay-annotation rule's explanatory text — does **not** break `lint`/`check`/`knip` (it is not a rule target, just prose). But the plan asserts a complete reference sweep and the AC says "no dead references remain." Leaving a comment naming a deleted file is a stale-reference the New-Hire lens flags. **Fix:** drop `isolated-session-worker,` from that comment in the §A scrub (task 4). Cheap; keeps the sweep honest.

### WARNING-2 — Docs reference `isolated` as a live adapter beyond the four files the plan flags for Phase 5.
The plan's §D flags `components.md`, deployment/system docs. It misses: `docs/agent-layer/return-gate-enforcement.md` (§ "`isolated` — `sdk-inprocess`"), `docs/product/launch-readiness-audit.md` ("7 adapters … isolated"), `docs/product/vision-gap-audit.md`. These are **docs**, correctly deferred to Phase-5 `/write-docs` (not an AQ1 build gate), so this does not block the verdict — but §D's "flagged files" list is incomplete and should be widened so the Phase-5 builder finds them. Note for accuracy, not a build blocker.

---

## NICE findings (optional)

- **NICE-1.** Plan §B offers an *optional* clarifying lore line on `remote-harness-adapter.ts` "if any future reader could misread `S2:` as a sandbox tier." Verified: no `S2:` isolation framing exists; the caps are honest. The optional line is harmless but unnecessary — skipping it is fine; adding it is fine. No action required.
- **NICE-2.** Task ordering (red guard test → delete → test-ref edits → lore → knip/realign → live-proof → verify) is sound and matches the dependency-order learning. Once CRITICAL-1/2 are folded in, fold the `knip.json` edit into task 2 (with the deletions) and the `AL6-return-gate.integration.test.ts` edit into task 3 (with the other test-ref edits) so the `check` red→green stays one clean transition.

---

## Per-dimension scores

| # | Dimension | Score /10 | Rationale |
|---|---|---|---|
| 1 | **Correctness vs concept/spec** | 8 | Faithful to the locked concept (run-unit = host working dir, no isolation) and the founder's two-axis refinement (delete isolation, keep+realign remote). The KEEP-remote reversal of the prior plan is correct and well-justified. |
| 2 | **Completeness of the change map** | 4 | Two real references missed (`knip.json`, `AL6-return-gate.integration.test.ts`) that break the very gates the AC names. This is the deletion WP's core deliverable; a deletion plan lives or dies on its reference map. |
| 3 | **Reconciliation rigor (claims = code)** | 7 | The §Reconciliation table is unusually strong — every hard claim (remote framing, CredentialResolver, the §4 gate, fs/path usage, run path) verified true. Marked down because two "verified by full grep sweep" assertions (Risk-1 enumerates "every importer") are demonstrably **not** complete — the sweep missed a dynamic import and the knip config. |
| 4 | **Test/verification adequacy** | 7 | The "deleted not stubbed" net (TS strict + knip + the host-only pool runtime test asserting `/isolated\|docker/` absence while allowing remote) is the right design and the runtime assertion is correctly scoped (does not assert remote absence). Knocked down only because the net's own gates (check/knip) will fail on the missed refs until CRITICAL-1/2 land — i.e. the plan would currently fail its own red→green. |
| 5 | **Risk identification** | 6 | Risks 1-5 are the right risks; Risk-1 ("a surviving test imports a deleted symbol") is exactly the failure that then occurred — the mitigation ("§A task 3 enumerates every importer") is falsified by CRITICAL-2. Honest framing, incomplete execution. |
| 6 | **Blast radius / no-collateral** | 8 | Correctly protects AN2, AN1 hard-rule 4, AF11 worker-token, the AL6 remote subtest, and the X5 host-spawn contract. Correctly keeps `DisabledSandboxAdapter` + `CredentialResolver`. The kept-remote seam-coherence assertion is the right safety check. |
| 7 | **Module/seam integrity** | 8 | Layer boundaries respected; the realign is honestly lore-only (the code already carries no isolation framing — verified). `AdapterMeta.kind` left as the scheduler axis. No new coupling, no churn. |
| 8 | **Security posture** | 9 | Net-negative attack surface (removes the docker argv boundary + the one forked-env key-injection path); no new endpoints/inputs/URLs; AN1 hard-rule 4 preserved; ETHOS §2 "no preemptive wall" honored. Accurate and concise. |
| 9 | **Clarity / actionability for builder** | 7 | File-by-file map, line refs, ordered commit boundaries, explicit live-proof. Strong. Dropped for the §B/protectedTests/Risk-2 self-contradiction around `AL6-return-gate.integration.test.ts` (KEEP vs must-edit) which would actively mislead the builder. |

**Overall: 6.5/10 — NEEDS-REVISION** (threshold is ≥7). Two CRITICAL one-line gaps that break `npm run verify`; both precisely located. Fix CRITICAL-1 + CRITICAL-2 (and ideally WARNING-1) and the plan clears the bar comfortably (~8/10).

---

## Required revisions (designer)

1. **CRITICAL-1:** Add `knip.json` to the change map (§A/§C, task 2, sharedFiles). Delete the three forced-entry lines (`isolated-session-worker.ts!`, `isolated-harness-adapter.ts!`, `docker-sandbox-adapter.ts!`) in the same commit as the source deletions. Keep `harness-session-probe.ts!`.
2. **CRITICAL-2:** Add `packages/server/src/harness/__tests__/AL6-return-gate.integration.test.ts` to §A's surviving-test edits — remove the `IsolatedHarnessAdapter` subtest (lines 677-692) + its dynamic import. Keep the remote subtest (654) and the `isolated-shaped-tier2` mock (545). Resolve the contradiction: move this file out of the "assertions must not change" protected set (mirror how `AL6-reprompt-loop.integration.test.ts` is handled); update Migrations + the protectedTests footnote.
3. **WARNING-1 (recommended):** Scrub `isolated-session-worker` from the `eslint.config.ts:1115` comment in the task-4 lore pass.
4. **WARNING-2 (note only, Phase-5):** Widen §D's docs list with `docs/agent-layer/return-gate-enforcement.md`, `docs/product/launch-readiness-audit.md`, `docs/product/vision-gap-audit.md`.

---

## Round 2 verdict (2026-06-28) — re-review of the revised plan

**Verdict: APPROVED.** Overall **8.5/10** (was 6.5). Both CRITICALs resolved; both WARNINGs folded. Re-verified every claim against the actual worktree files (knip.json, the AL6 integration test, eslint.config.ts) plus a full repo-wide grep sweep of the deleted symbols.

### CRITICAL-1 — `knip.json` forced entries — RESOLVED
The plan now deletes the three forced-entry lines (`isolated-session-worker.ts!`, `isolated-harness-adapter.ts!`, `docker-sandbox-adapter.ts!`) and explicitly keeps `harness-session-probe.ts!`. Wired in four consistent places: §A knip-config edit (with the exact JSON), task 2 ("same commit as the source deletions"), Migrations, and sharedFiles. Verified against `knip.json` lines 49-52 — the three delete-set files are exactly lines 49-51 and the kept probe is line 52. Correct.

### CRITICAL-2 — `AL6-return-gate.integration.test.ts` dynamic import — RESOLVED
The plan now schedules removing the lines 677-692 isolated subtest **and its `await import("../../harness/isolated-harness-adapter.js")`** (§A task 3, Migrations, Risk-1). Verified against the file: lines 677-692 are exactly that subtest with the dynamic import; line 654 is the `RemoteHarnessAdapter` subtest (KEPT); line 545 is the `isolated-shaped-tier2` bare mock-name string with no import (KEPT). The round-1 self-contradiction is gone: the file is now consistently described as **intentionally edited** (out of the "assertions must not change" set) with only its **remote** subtest protected — across §A, §B (table row), the Test-strategy footnote, protectedTests, Risk-2, and Migrations. No remaining KEEP-vs-edit conflict.

### WARNING-1 — eslint comment — FOLDED
§A (line 112), task 4, and Migrations now scrub `isolated-session-worker, ` from the `eslint.config.ts:1115` relay comment. Verified the comment exists verbatim at line 1115; correctly noted as comment-only (no lint/check/knip impact) — a stale-reference hygiene fix.

### WARNING-2 — docs sweep — FOLDED
§D now lists `docs/agent-layer/return-gate-enforcement.md`, `docs/product/launch-readiness-audit.md`, `docs/product/vision-gap-audit.md` alongside the original four; correctly deferred to Phase-5 `/write-docs` (not an AQ1 build gate).

### Deletion-map completeness — re-verified by full grep sweep
A repo-wide grep for `DockerSandboxAdapter|IsolatedHarnessAdapter|IsolationConfig|isolated-session-worker|isolated-session-protocol|isolated-harness-adapter|docker-sandbox-adapter|HYPERIDLE_ENABLE_ISOLATED|HYPERIDLE_ENABLE_DOCKER` (excluding `plans/`) returns hits in exactly the set of files the plan handles — every hit is either inside a deleted file/test, or inside an explicitly-edited file (knip.json, eslint.config.ts, adapter-pool.ts §4 block, the four lore/error-string source files, the five edited test files). **No reference is left uncovered.** The "deleted, not stubbed" net (`npm run check` TS-strict catching static + dynamic imports, `knip`/`knip:production` catching the config entries, `lint` catching unused imports) will go green after the scheduled edits.

### Updated dimension scores
| # | Dimension | R1 | R2 | Note |
|---|---|---|---|---|
| 2 | Completeness of the change map | 4 | **9** | Both missed refs added; full grep sweep confirms no uncovered reference. |
| 3 | Reconciliation rigor | 7 | **9** | The falsified "complete sweep" claims (knip, dynamic import) are now true. |
| 4 | Test/verification adequacy | 7 | **8** | The net's own gates (check/knip) now pass on the scheduled map. |
| 5 | Risk identification | 6 | **8** | Risk-1 now enumerates the dynamic import; mitigation no longer falsified. |
| 9 | Clarity / actionability | 7 | **9** | The §B/protectedTests/Risk-2 self-contradiction is resolved. |

Dimensions 1, 6, 7, 8 unchanged (8/8/8/9). Overall **8.5/10 — APPROVED.**

### Remaining findings
None blocking. NICE-1 (optional clarifying lore line on `remote-harness-adapter.ts`) remains genuinely optional — verified no `S2:` isolation framing exists in that file, so it is harmless either way. Build may proceed.
