# AL5 — Architecture critique: Review surfaces

**Reviewer:** reviewer agent (cold eval, producer/evaluator separation).
**Date:** 2026-06-25.
**Artifact:** `plans/AL5/architecture.md` against `plans/AL5/concept.md` (LOCKED) + TRACK-AL.md AL5 ACs.
**Verdict: PASS — 8/10. No unresolved CRITICAL. Concept-fidelity is excellent; two WARNINGs are accuracy/scope corrections the builder must apply before/early in the build.**

The plan honors every LOCKED concept decision. The high-stakes locks (code-not-config; no-runtime-auto-apply enforced structurally by a unique index; floor-fallback via error boundary; lens-never-decision via a lint guard) are all met cleanly and grounded in real code seams I verified. The two WARNINGs are not concept violations — they are places where the plan's *prose over-claims what the codebase actually does* (auth membership-check) or *understates the integration friction* (the `action_operation` proof vehicle has a non-standard props signature). Both are fixable in the build without reopening concept.

---

## Concept-fidelity verification (the non-negotiable checklist)

| # | LOCKED concept rule | Honored? | Evidence in plan |
|---|---|---|---|
| 1 | Surface = **code** (React) specializing a base canvas — not config, not `ui://`/sandbox | **YES** | §2.1 surface is a `ReviewCanvasComponent`; §2.2 manifest is a descriptor, not a DSL. No `ui://`. |
| 2 | **NO runtime auto-apply**; deterministic from a committed, version-pinned adoption | **YES — structurally** | §4.1 `uniqueIndex(teamId, tool, kind)` makes "≤1 adoption per situation" a DB invariant; §4.2 `resolveSurface` is a Map lookup keyed by the explicit row — no candidate set, no scoring. `situations` only pre-filters the browse dialog. This is the strongest part of the plan. |
| 3 | Registry distribution; one mechanism first-party + community; reuse AN `TrustTier` | **YES** | §3 one `SurfaceManifest` shape for both; §2.2 imports `TrustTier` from `connection.js` (verified: it is the AN-locked `{vetted, community}` union); `provenance` is a separate closed set, correctly distinct from trust. |
| 4 | Wrap \| eject; base declares per-slot `wrap\|eject\|forbidden` | **YES** | §1.4 `SLOT_POLICY` per-canvas; `slotPermission()` returns the declared mode. CLOSED unions. |
| 5 | Base canvas = floor + always-present fallback; broken surface never breaks host | **YES** | §4.4 `SurfaceBoundary` (class error boundary) catches any throw → renders base; §7 state table covers missing/throw/version-mismatch. Judged by error-boundary + floor + trust-tier (correct per spec "not a runtime sandbox"). |
| 6 | Surface is the lens, never the decision | **YES — and enforced** | §6.4 lint rule forbids `surfaces/**` modules importing `apiFetch`/issuing network calls; surface renders the base's existing action affordance. Structural enforcement, not just prose. |
| 7 | AL5 ⟂ AN4 — do NOT build the Connector registry | **YES** | §5 boundary note: surface-adoptions route only; AN4 connector may carry a `preferredSurfaceId` *reference*, built by AN4 not AL5. |

**All 7 locked decisions honored. No CRITICAL concept violation.**

The §0 reconciliation of the stale "sandboxed" wording in AC4 is correct and handled exactly right: flagged for the founder, architected to the locked concept (error-boundary + floor + adopt-time trust), not silently resolved. Per the orchestrator's own framing, the designer's "risk #1" is over-cautious — the spec already says "not a runtime sandbox" (AC5 + Contracts), so the error-boundary mechanism IS the intended safety model, not a compromise. Downgrade that self-flagged risk from "highest-stakes" to "resolved."

---

## 9-dimension architecture rubric

| # | Dimension | Score | Note |
|---|---|---|---|
| 1 | Concept fidelity | 10 | All 7 locks honored; the unique-index-as-no-auto-apply is exactly the structural guarantee the concept demanded. |
| 2 | AC coverage | 8 | Every AC + validation scenario has a plan path + validation method (§9). Two AC-path realism gaps (WARN-1, WARN-2) dock 2. |
| 3 | Data model fit | 8 | `surfaceAdoptions` echoes `serviceConnections` honestly; unique index is the right tool. Team-vs-user scope is defensible but see WARN-2. |
| 4 | API design | 7 | Routes mirror `connections.ts` shape; rate-limit + boundary noted. But "membership-checked" over-claims (WARN-2); team-scope auth resolves to host-scope-true in this codebase. |
| 5 | Type safety | 9 | Closed unions everywhere (`LayeringMode`, `SurfaceProvenance`, `SlotPermission`); additive optional props keep existing call sites compiling; one `as` avoided by design. The `ReviewCanvasKind`→shared move is the only cross-package risk (WARN-3, low). |
| 6 | Testability | 9 | Pure `resolveSurface` is trivially unit-testable; `SurfaceBoundary` throw-test; integration test for at-most-one/swap/reset/cross-team; lint rule for AC5. Strong, correctly-typed test matrix in §9. |
| 7 | Simplicity / scope | 8 | Genuinely "shippable, don't over-build": first-party Map registry, community = build-time copy (no runtime eval), version-pin informational. Wisely scopes slot-wiring to 1 canvas + policy-for-9. Slight over-build flagged (NIT-A2). |
| 8 | Reuse of existing patterns | 8 | Echoes `kinds/registry.ts` (Map, verified), `serviceConnections`, `routes/connections.ts`. But the §2.1 "same signature as a base canvas" claim is **false for the chosen proof vehicle** (WARN-1). |
| 9 | Risk surfacing | 9 | §10 surfaces 6 real risks with quantified trade-offs; honest about deferrals. Self-flagged risk #1 is over-cautious (resolved above), the rest are genuine. |

---

## Findings

### CRITICAL
*(none — no concept violation, no host-safety hole, no AC left unaddressed.)*

### WARNING

- **WARN-1 — The proof vehicle's base canvas has a NON-STANDARD props signature; §2.1's "a surface is an ordinary `ReviewCanvasComponent` — same signature as a base canvas" is FALSE for `action_operation`.**
  Verified against `ReviewActionOperation.tsx`: its props are `ReviewActionOperationProps = { artifact, status?, outcome?, proposedCall? }` — **wider** than `ReviewCanvasProps`. And in `ReviewComposition.tsx:675`, `ExaminePane` does **not** route `action_operation` through `getReviewCanvas`/`<Canvas>` at all — it hard-branches and calls `<ReviewActionOperation artifact status outcome proposedCall />` directly with the AL7 trust-first props. The plan's §4.3 ("the `action_operation` special-case branch stays, but `resolveSurface` may return a wrapping surface that itself renders `ReviewActionOperation` with status/outcome/proposedCall forwarded via its slots") under-specifies this: a wrapping surface that renders `ReviewActionOperation` must **forward `status`/`outcome`/`proposedCall`**, which are NOT part of `ReviewCanvasProps` or `CanvasSlots`. So `StripeRefundReview` as written in §2.1 (`<ReviewActionOperation artifact slots={…}/>`) would **drop the AL7 outcome band** — a real regression on the exact proof vehicle.
  **Fix:** the surface component contract for `action_operation` must thread the AL7 props. Either (a) widen the surface props to the union the base expects and have `ExaminePane`'s existing branch pass `status/outcome/proposedCall` into the resolved surface, or (b) carry `status/outcome/proposedCall` on the `artifact`/payload so the base reads them without extra props. Decide this in the plan before build — it's the difference between "the proof vehicle works" and "the proof vehicle silently loses the execution outcome." Validation §9 must add an assertion that the wrapped `action_operation` surface still renders the granted/executed/failed band.

- **WARN-2 — "membership-checked, not userId-self" (§5) over-claims an authorization guarantee the codebase does not provide.**
  Verified: `authorizeRead/Write` + `canRead/canWrite` (`access-boundary.ts`) resolve `hostKind: "team"` to `HOST_SCOPE.team = "host"`, and `host` scope returns **`true` for any authenticated principal** (Hard Rule 5 — no over-restriction). There is **no team-membership check** in the platform today; `authorizeWrite({hostKind:"team", hostId:teamId})` does not verify the principal belongs to the team. This is consistent with the single-product / trust-agents model (and the MEMORY "design for power, not paranoia"), so it is **not a security defect** — but the plan's prose misrepresents it. A reader will believe cross-team writes are blocked when they are not (except the DELETE-cross-team→404 path, which works only if the handler filters by `teamId` in the query).
  **Fix:** correct the §5 prose to "team-scoped by query filter (`where teamId = …`); `authorizeWrite` clears the boundary flag at host scope (no membership predicate today, per platform Hard Rule 5)." The real isolation comes from the DB query's `teamId` filter, exactly as `connections.ts` gets isolation from its `userId` filter — say that, don't claim a membership check that isn't there. Also resolve the WARN-2b vocabulary trap below.

- **WARN-2b — `teamId → teams.id` vs the U1 `teams`/`teamMembers` overload.**
  Schema lore (`schema.ts` U1): the agent-membership group was renamed `teams`→`teamMembers`; `teams` is now the product/workspace. The plan references `teams.id` — likely correct (a deployment/workspace owns its adoptions) — but the plan should state *which* "team" it means, because "the team adopts" in the design reads as the membership group. Pin it explicitly to avoid the builder wiring `teamMembers.id`.

### NIT

- **NIT-A1 — B3 (extend the review loader) is more speculative than stated.** Verified `reviews.ts`: the `/reviews/:id` loader currently serves a `FIXTURE_REVIEW` with `artifacts: []` and synthesizes a single artifact from a proposed-call row (`tool: opRow.toolId`). There is no general per-artifact situation enumeration to resolve adoptions against. Threading adoptions through the loader (B3) assumes a maturity the loader doesn't have. **Mitigation already in the plan:** `resolveSurface` is pure and client-side and the GET `/api/surface-adoptions` route exists independently — so the composition can fetch adoptions directly rather than depending on loader enrichment. Recommend the builder treat B3 as optional/deferred and rely on the standalone GET, keeping AC-paths real on the immature loader.
- **NIT-A2 — slight registry over-build for AL5.** `SurfaceRegistryEntry`, `listSurfaces`, the community registry-index shape, and `AdoptionView` server-join are all justified, but `listSurfaces` + the community-pointer index type ship with **one** first-party entry and **no** live community fetch. That's acceptable (it mirrors the shadcn shape the concept cites) but confirm the community-index type isn't dead weight knip will flag — gate it behind actual use in the browse dialog (B5) or mark `knip:ignore` with a reason.
- **NIT-A3 — `slotPermission` default-to-`"eject"` for unlisted seams (§1.4) is a quiet policy.** Returning `"eject"` for any unlisted `(kind, name)` means "every unwired seam is silently ejectable." Defensible, but make it an explicit comment in the const, not just the function default, so the 8 stubbed canvases' eject-only status is legible at the policy table, not buried in the lookup fallback.
- **NIT-A4 — preview transport in production.** (Cross-ref design NIT-D1.) The `:8098` viewer is a dev server; the manifest's `sampleFixture`/`.stories.tsx` preview needs a production-available render path or the browse-dialog preview breaks in a packaged build. Name the transport in B5.
- **NIT-A5 — version-pin "informational at AL5".** Accepted scope (single in-repo version). `degraded: "version-mismatch"` still renders the entry — fine. Just confirm the integration test asserts the mismatch is *surfaced* (the "rendered by" line), not swallowed, so the informational signal is provably visible.

---

## Designer's self-flagged risks — adjudicated

1. **"Sandboxed" AC vs concept** — **RESOLVED, not a risk.** Spec already says "not a runtime sandbox"; error-boundary + floor IS the intended model. Designer's framing as "highest-stakes" is a misread; downgrade.
2. **Adoption scope = team** — **Defensible, but see WARN-2/2b.** Team/workspace scope is right for "the team adopts." The defect is the *prose* (membership-check claim), not the *choice*. Pin the table to `teams` (workspace) explicitly.
3. **Slot wiring limited to `action_operation`** — **Defensible AL5 scope, NOT an AC gap.** AC4 requires the base declares per-slot which mode is allowed; policy-for-all-9 + wrap-seams-on-1 satisfies that (the other 8 are eject-only, a first-class mode). The quantified trade-off in §1.4 is honest. No AC requires all 9 to expose wrap seams.
4. **Community = build-time copy, no live remote eval** — **Correct, concept-aligned model.** Live remote eval would reintroduce the untrusted-runtime problem concept hard-rules #1/#2 reject. The shadcn own-the-source model is exactly the concept's intent. Keep it.
5. **`ReviewCanvasKind` → shared** — **Low risk (WARN-3 downgraded to confirmed-safe direction).** Verified: only `canvas-registry.ts` and `review-artifact.ts` consume `ReviewCanvasKind` in prod; web re-exporting from shared is the legal import direction (web → shared). No circular import. Move the union string const to shared, re-export from web. Cheap.
6. **Version-pinning informational** — **Acceptable AL5 scope** (NIT-A5: just prove the degrade signal surfaces).

---

## Verdict

**PASS — 8/10.** Concept fidelity is excellent (10/10 on that dimension); all 7 locked decisions honored, the no-auto-apply guarantee is structural (unique index) not aspirational, and host-safety is correctly mechanized (error boundary + floor). No CRITICAL.

**Before the build proceeds, the builder must resolve WARN-1 (the `action_operation` proof vehicle drops the AL7 outcome band as written) and correct WARN-2/2b (auth prose over-claims a membership check the platform doesn't do; pin the `teams` table).** Neither requires a concept reopen. NITs are builder hygiene.
