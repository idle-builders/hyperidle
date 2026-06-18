# Architecture Critique: AL2

**Reviewer:** cold architecture-critique pass (Phase 2).  
**Inputs read:** `plans/AL2/architecture.md`, `.pipeline/work-packages/TRACK-AL.md` (AL2), `plans/AL1/design/approved.md`, `plans/AL1/design/components-brief.md`, `docs/process-layer/artifact-primitive.md` (cited by plan), `.claude/skills/architecture-critique/SKILL.md`.

---

## Score table

| # | Rubric dimension | Plan score | Findings |
|---|-------------------|------------|----------|
| 1 | **Spec alignment** (correctness) | 8/10 | Every AL2 AC maps to a named verification test. Only ding: the plan builds 9 canvases while AC-1 lists 7 artifact kinds, and it adds a `ReviewPage` route that bleeds into the AL3 composition surface. |
| 2 | **Layer integrity** (dependency hygiene) | 9/10 | Registry stays in `packages/web/pages/review/` rather than polluting `packages/design-system`. Downward dependency into shared types only. Good. |
| 3 | **API contracts** | 8/10 | No new HTTP contract is required, and the route is documented with path + component. `ReviewArtifact`, `ReviewCanvasProps`, and `getReviewCanvas` signatures are explicit. |
| 4 | **Data model alignment** (completeness of contracts) | 9/10 | `ReviewArtifact<TPayload>` cleanly separates review-family kinds from the primitive `Artifact` open vocabulary. No DB migrations. `ReviewSubject` is forward-compatible with AL3. |
| 5 | **Naming** | 9/10 | Names are honest and specific (`ReviewCanvasKind`, `ReviewUnknownCanvas`, `CanvasSourceHeader`). No generic `Manager`/`Service`/`Handler` leaks. |
| 6 | **Module depth** (interface simplicity) | 8/10 | Uniform `ReviewCanvasProps<TPayload>` hides per-family differences behind one dispatch surface. Payload table is clear. Minor: 9 payload types + 9 components is a wide surface, but justified by the 9 families. |
| 7 | **Failure-mode coverage** | 7/10 | Security table is present and treats agent-authored fields as untrusted. Fallback is safe. Gap: the non-http(s) `sourceHref` guard is described only as a link-layer concern; no shared validation helper is planned, so consistency depends on every canvas remembering to enforce it. |
| 8 | **Simplicity / over-engineering risk** (maintainability) | 6/10 | The `ReviewPage` + `/work/bet/:betId/review/:reviewId` route is composition work that AL3 already owns. Adding a fixture-driven review page in AL2 risks merge friction and duplicates the composition surface. |
| 9 | **Verifiability** (testability + observability) | 9/10 | Each AC has concrete test names, assertions, and expected outputs. `canvas-registry.test.ts`, per-canvas `*.test.tsx`, and `ReviewPage.test.tsx` cover runtime behavior. `protectedTests` is empty but legitimate because no prior tests exist. |

**Average:** 7.89/10

**ARCHITECTURE-SCORE:** 8/10  rounds=1  score-line: SA:8 LI:9 AC:8 DM:9 N:9 MD:8 FMC:7 S:6 V:9

---

## Verdict

**APPROVED_WITH_REVISIONS**

The plan is coherent, testable, and correctly separates the review canvas layer from primitive renderers. The two issues are fixable in the plan text before implementation:

1. The `ReviewPage` route/page should either be removed or demoted to a non-composing route stub so AL3 owns Subject composition cleanly.
2. The 9-canvas / 7-family mismatch + the `sourceHref` trust boundary should be spelled out explicitly.

Address those two items, then the plan can move to `/write-tests`.

---

### CRITICAL

*None.*

### WARNING

- [plan §Ordered task list / tasks 7-8] `ReviewPage.tsx` + `/work/bet/:betId/review/:reviewId` route. This is the AL3 composition surface — it mounts every artifact into a single review view, which is exactly what AL3 is chartered to build. Keeping it in AL2 risks overlap, merge conflicts, and a temptation to add frame/header/verdict chrome prematurely.  
  → **Fix:** Either delete the page task and rely on design-system stories + registry tests to prove canvases mount, or keep only a minimal route registration (`/work/bet/:betId/review/:reviewId` → a placeholder `AL3ReviewPageStub`) with a comment that the body is owned by AL3. Add the stub file to `sharedFiles`.

- [plan §AC-1 vs §Type signatures / ReviewCanvasKind table] AC-1 says "each artifact kind (code · record/field-change · action/operation · rendered document/email · metrics/data · visual · batch)" — 7 kinds — but the plan builds 9 canvases including `outcome_summary` (the frame lead) and `browser_preview`. This isn't wrong (they are in `approved.md` Table 2), but it is a scope jump that should be explicit.  
  → **Fix:** In the "Plan reconciliation" or AC-1 section, add a one-line mapping: "AL2 builds the 9 proof-family canvases shown in `plans/AL1/design/approved.md` Table 2; AC-1's 7-item list is the data-bearing artifact families, while `outcome_summary` and `browser_preview` are frame/utility canvases also approved in AL1."

- [plan §Security & abuse cases / Malicious `sourceHref`] The non-http(s) rejection rule is described as "render as disabled text" but lives only in prose. Without a shared helper, individual canvases may implement it inconsistently or forget it.  
  → **Fix:** Add a small validation helper in `review-artifact.ts` or `review-canvas.ts` such as `isSafeSourceHref(href: string): boolean` and require `CanvasSourceHeader` to use it; add a registry-level test that unsafe hrefs are not rendered as clickable anchors.

### SUGGESTION

- [plan §Risks / ambiguities #4] The fixture-driven `ReviewPage` is flagged as a risk; consider moving that risk to a deliberate scope boundary note in `sharedFiles` so AL3 knows exactly what AL2 left behind.  
- [plan §Security & abuse cases] Add a note about oversized payloads: `ReviewUnknownCanvas` will `JSON.stringify` arbitrary payload. A malicious agent could craft a multi-megabyte object. A length cap or truncation strategy (e.g., first 2 KB + "…") would be cheap defensive.  
- [plan §protectedTests] Once the new tests are written in `/write-tests`, backfill `protectedTests` with their names before this WP ships. The current empty block is acceptable now but not at the end of Phase 3.

---

### What's working well

- **Clean downward dependency.** The plan explicitly refuses to extend `packages/design-system/src/kinds/renderer-registry.ts` because review canvases depend on web-layer primitives (`ToolLogo`, `CanvasSourceHeader`, future conversation/verdict chrome). That decision preserves the three-layer rule and is well argued in the design-it-twice section.
- **Uniform dispatch contract.** `ReviewCanvasProps<TPayload>` and `getReviewCanvas` mean AL3 composition can mount any future canvas without per-canvas adapters. The generic payload table is exactly the right level of abstraction.

---

## Change requests (for the architect)

1. **Scope boundary with AL3:** Remove `ReviewPage.tsx` body or replace it with a route-only stub; AL3 will own Subject composition. If a stub is kept, document it in `sharedFiles` and add a `@lore` comment in the file.
2. **Reconcile AC-1's 7 families with the 9 canvases:** Add explicit text in the plan (AC-1 or Plan reconciliation) explaining that `outcome_summary` and `browser_preview` are approved AL1 utility canvases, not data-bearing artifact kinds, and therefore still in AL2 scope.
3. **Shared source-link trust boundary:** Introduce `isSafeSourceHref` in the shared review-canvas contract and mandate its use in `CanvasSourceHeader`; add a registry-level test for unsafe href handling.
4. Backfill `protectedTests` after Phase 3 test writing.

Address 1–3 in the plan, then this critique can be closed as **APPROVED**.
