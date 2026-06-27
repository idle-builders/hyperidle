# Architecture Critique: AO2 — Round 3 (final)

ARCHITECTURE-SCORE: 8/10  rounds=3  status=APPROVED  score-line: SA:8 LI:8 AC:9 DM:8 N:8 MD:8 FMC:8 S:7 V:8

Re-critique of rev3 (commit b994ae32) against the reconciled ACs (`plans/AO2/reconciliation.md`). Rev3 closes the round-2 CRITICAL (codex-path credential leak in capture) and reclassifies it correctly as a STRIDE Information-Disclosure control. All round-3 verification questions check out against origin/main @ `2012467d`.

---

## Verification of rev3 resolutions (each checked against code, not taken on faith)

**1. Leak is real — confirmed.**
- `context-assembly-prompt.ts:278-279` `writeSandboxAgentsMd` dual-writes `AGENTS.md` AND `CLAUDE.md` verbatim every session (`@lore AK1`). Verified.
- `provision-return-hook.ts:222` creates `<sandbox>/.codex-home/` and copies `auth.json` + `config.toml` from `~/.codex` (`@lore AL6 codex-codex-home`) — a real host credential. Verified.
- `git ls-files` confirms HyperIdle tracks at root: `AGENTS.md`, `CLAUDE.md`, `.mcp.json`, populated `.claude/` tree. Self-hosting overwrite collision is real. Verified.

**2. The 12-entry inventory is now actually complete — confirmed.**
Enumerated every non-test single-segment write to `(config.)sandboxPath` across `packages/server/src` + `packages/fabric/src`. Full set is exactly:
`.fabric/`, `context/`, `knowledge/`, `work/`, `AGENTS.md`, `CLAUDE.md`, `.mcp.json` (`session-provisioning.ts:753`), `.claude/`, `.codex/`, `.codex-home/`, `opencode.json`, `.opencode/`.
Precisely `SANDBOX_SCAFFOLDING_PATHS`'s 12 entries. **No further sandbox-root writer is missed.** The two that drifted off in rev2 (`CLAUDE.md`, `.codex-home/`) are both present. The `.mcp.json` "Phase 8b" citation matches `session-provisioning.ts:752-753`.

**3. "Writers assert against the shared constant" is real and enforceable — confirmed (one builder note).**
Every cited writer uses a string literal dir name (`path.join(sandboxPath, ".codex-home")`, etc.). A same-file unit assertion that each writer's literal ∈ `SANDBOX_SCAFFOLDING_PATHS` is genuinely runnable — the literals exist to assert against; a new writer with a new root literal fails it. Enforceable, not vapor. **Builder note (not a blocker):** the assertion must cover all four writer files individually (`context-assembly.ts`, `context-assembly-prompt.ts`, `cli-mcp-config.ts`, `provision-return-hook.ts`); an aggregate-only test reopens the drift hole. Task-0's "per writer" wording is correct — hold the builder to it.

**4. Lane A's codex-path step exercises the leak path — confirmed.**
§Live-proof 5b seeds `<sandbox>/.codex-home/auth.json` with a sentinel (or drives real codex provisioning) before capture, then asserts the restored bundle + file-snapshot contain NONE of `.codex-home/`/`auth.json`/the sentinel. Because the exclusion is what keeps `.codex-home/` untracked (`info/exclude`) and unstaged, **removing `.codex-home/` from `SANDBOX_SCAFFOLDING_PATHS` makes this go red** — the leak path is genuinely exercised. The plan correctly states the non-codex variant alone passes even with `.codex-home/` off the list, which is exactly why the codex variant is load-bearing (memory: hardest member). Separate named sanity-break (un-wire Phase 5.5 mount → red) is pinned.

**5. Dependency ordering (task 0 first) is sound — confirmed.**
`SANDBOX_SCAFFOLDING_PATHS` in `@hyperidle/shared`, imported by both writer packages + the mounter. Task 0 lands before the mounter (task 4) can import it and before writers can be asserted. Stated order `0 → 1 → 2,3 → 4 → 5,6 → 7 → 8` respects this. `shared` placement correct — both packages already depend on it, no new package edge.

**Seam correctness (carried, re-verified):** `FilesystemAuthResolver` exposes exactly `resolve/resolveToken/canResolve/sourceOf` — the four `OwnerScopedAuthResolver` implements. `ServiceConnectionResolver.resolve(userId, connectionId)` is the sole plaintext path with `AND(id, userId)` isolation; `service_connections.userId` is `notNull`. Owner-scoped lookup (`row.userId → resolve(userId, id)`) adds no new decrypt path, keeps seam intact for AN2. Coherent.

---

## Score by dimension

| Dim | Score | Note |
|---|---|---|
| Layer integrity (LI) | 8 | Mounter→server, runner→fabric, seam→shared; no layer past neighbor. Kernel `artifacts` kept clean via separate `filesystem_captures`. |
| Contract fidelity (AC) | 9 | AO1 seam types byte-identical; `auth` param now live not vestigial; no new method on concrete resolver. |
| Data model (DM) | 8 | `filesystem_captures` scoped, indexed, forward-only migration. |
| Hook soundness (N) | 8 | Phase 5.5 in existing try/revert; captureBack before all 3 destroys, skip crash. Disjointness-via-ordering claim correctly retracted. |
| Security earned (S) | 7 | Capture-pollution reclassified Information-Disclosure with stated invariant; drift-proof exclude; proven by codex assertion. No preemptive cross-tenant guard — correct for single-founder team-scope. |
| Modularity/depth (MD) | 8 | Single shared constant + per-writer assertion closes rev2 drift at root. |
| Simplicity (SA) | 8 | Bundle ref-spec pinned `refs/heads/<branch>`, range form avoided; extend-runner over fork justified; multi-code-fs deferred. |
| Failure-mode coherence (FMC) | 8 | Degradation structural + tested; capture failure logged not thrown into teardown. |
| Verifiability (V) | 8 | Restore-and-read-back is an assertion; named sanity-break + codex credential-absence variant; Lane B skip-guarded real PAT. |

**Aggregate: 8/10.**

---

## Residual findings (all builder-handleable nits — none must-fix-before-build)

- **Per-writer assertion coverage (nit):** task 0 must assert all four writer files individually; aggregate-only reopens drift. Plan already says "per writer."
- **`captureBasePath` default (nit, in Risks):** needs concrete sibling-of-`sandboxBasePath` convention; assert capturePath under it (no `..`). Already in §Security path-traversal control.
- **`.git/info/exclude` anchoring (nit):** confirm dir entries anchor as `/.codex-home/` so a nested same-named dir isn't wrongly excluded. Low-risk, single-sandbox.

None block TDD. CRITICAL genuinely closed: the credential never reaches the durable bundle, and that property is proven by a test that goes red if the control is removed.

**APPROVED — builder proceeds to red phase.**
