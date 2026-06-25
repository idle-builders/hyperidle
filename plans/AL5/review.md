# AL5 — Code review (Phase 4): Review surfaces

**Reviewer:** reviewer agent (warm from Phase 2 critique — design PASS 8/10, architecture PASS 8/10).
**Date:** 2026-06-26.
**Scope:** AL5 implementation diff `origin/main...HEAD` (ignoring concept/plan `.md` commits already critiqued).
**Baseline:** `npm run verify` reported green by the builder.

## Verdict: DONE

All 5 ACs + every validation scenario are shipped AND covered by a test that exercises the **real** shipped path. Both load-bearing invariants survived sanity-break (each test goes RED when its implementation is reverted). The WARN-1 fix landed structurally — the AL7 OutcomeBand is not a slot, so a wrapping surface physically cannot drop it. No CRITICAL. Findings below are NITs (none blocking).

---

## Sanity-break results (mock-validation trap — hard gate)

### Break A — `resolveSurface` deterministic floor fallback → CONFIRMED RED
Reverted the no-adoption branch (`resolve-surface.ts:50-52`) from `{ component: base, source: "base" }` to mislabel it `source: "adopted"`.
- **Result:** `resolve-surface.test.tsx` → **2 failed / 12 passed**. The AC3 floor-fallback assertions (`source === "base"`, `component === BaseCanvasStub`) went red.
- **Conclusion:** the test is green against the real `resolveSurface`, not a mock; the floor-fallback invariant is genuinely enforced. The function is a pure Map lookup — no candidate set, no scoring. `_situation` is unused (prefixed `_`), proving `situations` is never consulted at render (concept hard-rule #2).

### Break B — adoptions unique index "at-most-one per (team,tool,kind)" → CONFIRMED RED
The integration test DB is built from the **migration SQL** (`drizzle/`), not `schema.ts` (verified: `test-pool.ts`/`test-utils.ts` call `migrate({ migrationsFolder: "../drizzle" })`). First attempt editing `schema.ts` stayed green (false-negative lever); the correct lever is the migration. Reverted `0038_fat_vapor.sql:19` `CREATE UNIQUE INDEX` → `CREATE INDEX`.
- **Result:** `surface-adoptions.integration.test.ts` → **5 failed / 9 passed**. The DB-level "two rows with same (team,tool,kind) MUST throw" test (line 474-475) went red, AND the `ON CONFLICT` upsert path broke (`there is no unique or exclusion constraint matching the ON CONFLICT specification`) — taking down POST/GET/DELETE happy paths too.
- **Conclusion:** the unique index is structural and load-bearing. The DB cannot hold two adoptions per situation, and the route's UPSERT depends on the constraint. Not app-logic enforcement — the DB enforces it (concept hard-rule #2).

Both reverts restored; working tree confirmed clean (source matches HEAD).

### Bonus break — AC5 ESLint rule non-vacuity → CONFIRMED RED
Neutered `isForbiddenImport` to `return false` in `no-surface-network-import.ts` → the rule's 3 invalid (positive-detection) cases failed (**3 failed / 8 passed**). The rule genuinely fires on a network import in `surfaces/**`; it is not vacuous. Restored.

---

## AL5-specific must-verify

| # | Item | Result |
|---|---|---|
| 1 | AC completeness, evidenced | **PASS** — see AC table. Two load-bearing invariants sanity-broken (above). |
| 2 | No runtime auto-apply is structural | **PASS** — `resolveSurface` is a pure Map lookup (no scoring; `_situation` unused). Single-adoption enforced by the DB unique index, not app logic. |
| 3 | WARN-1 fix landed | **PASS (structural)** — `ReviewActionOperation.tsx`: the AL7 OutcomeBand block sits **between** the `detail` and `footer` seams and is **NOT** a slot. Seams are header/lead/detail/footer only. A wrapping surface cannot override or drop the band. `StripeRefundReview` forwards `status/outcome/proposedCall`; the render site (`ReviewComposition.tsx:777-790`) forwards the same props into BOTH the resolved `Canvas` and the `SurfaceBoundary` fallback. The `action_operation` hard-branch is preserved (not collapsed into `getReviewCanvas`). Tests render granted/executed/failed bands inside the wrap AND through the degrade path. |
| 4 | Lens never decides | **PASS** — nothing in surface/adoption code mutates verdict/staged-action/gate. `StripeRefundReview` adds no fetch/mutation. AC5 lint forbids it structurally. |
| 5 | Adoption isolation | **PASS** — `teamId` query filter on every read/write/delete (`surface-adoptions.ts:159,253,288`); cross-team DELETE → 404 (integration test line 321-361). Mirrors `connections.ts` userId-filter pattern. Per trust-agents ethos, intentionally not membership-gated — isolation is the query filter, correct as-is. |
| 6 | Surface can't do network | **PASS** — `no-surface-network-import` rule fires on `apiFetch`/`/services/`/`@hyperidle/server` imports in `surfaces/**`; sanity-broken non-vacuous; registered `error` in eslint-plugin-design index. |

---

## AC completeness table

| AC | Requirement | Shipped | Test (real path) | Status |
|---|---|---|---|---|
| AC1 | Contributor writes a surface (React) specializing a base canvas; preview; publish to registry w/ manifest; or fork | `StripeRefundReview.tsx` (wrap) + `manifest.ts` + `surface-registry.ts` (FIRST_PARTY Map) + `.stories.tsx` preview | `resolve-surface.test.tsx` (registry resolves entry), `StripeRefundReview.test.tsx` (renders) | ✅ |
| AC2 | Team browses/previews/adopts (`tool/kind → surface`); owned, committed, version-pinned; renders by explicit mapping, never auto-select | `surface-adoptions.ts` POST (pins version), `SettingsReviewSurfaces.tsx` browse/adopt, `resolveSurface` explicit lookup | `surface-adoptions.integration.test.ts` (POST pins version, 201 AdoptionView), `resolve-surface.test.tsx` (adopted wins) | ✅ |
| AC3 | No adoption / failed surface → base canvas (floor always works); broken surface never breaks host | `resolveSurface` floor return + `SurfaceBoundary` error boundary | `resolve-surface.test.tsx` (AC3 floor — **sanity-broken**), `SurfaceBoundary.test.tsx` (throw → fallback, host intact) | ✅ |
| AC4 | Wrap (slots, upgrade-safe) \| eject (fork source); base declares per-slot mode | `surface-slots.ts` (SlotName/Permission/Policy), `slot-policy.ts` (SLOT_POLICY all 9 + `slotPermission()` + explicit `UNLISTED_SLOT_DEFAULT`), `ReviewActionOperation` wires 4 seams | `slot-policy.test.tsx`, snapshot net (action_operation re-bless) | ✅ |
| AC5 | One registry mechanism (first-party + community by provenance + AN trust tier); community reviewable before adoption; trust = adopt-time review + ownership, not runtime sandbox | `SurfaceManifest` (provenance + `TrustTier` reused from AN), `CommunityRegistryIndex` shape, `no-surface-network-import` lint (lens-never-decision), `SurfaceBoundary` (host-safety, not iframe) | `review-surface.test.ts` (manifest/closed-union shape), `no-surface-network-import.test.ts` (**sanity-broken non-vacuous**), integration registry endpoint | ✅ |

**Validation scenarios:** adopted Stripe surface renders over base (✅ `resolve-surface` + `StripeRefundReview` tests); no adoption → base (✅); adopted surface fails → degrades to base, host unaffected (✅ `SurfaceBoundary` test); contributor edits → live preview (✅ `.stories.tsx` at `:8098`, dev-only per B5 caveat). All covered.

---

## Six lenses

### Architecture — PASS
- Layer integrity respected: `review-surface.ts` (shared types, no React) ↔ web registry/component ↔ server route. Same split as `KindDefinition`. `ReviewCanvasKind` moved to shared, web re-exports — legal web→shared direction, no circular import.
- Data model matches plan field-by-field: `surfaceAdoptions` echoes `serviceConnections`; `teamId → teams.id` (workspace, not `teamMembers` — WARN-2b honored, lore comment present); unique index + team index as specified.
- API contracts match §5: GET adoptions / GET registry / POST (upsert, pin, 201) / DELETE (cross-team 404, 204). Rate-limited (30/min read, 20/min mutate), `requireBoundary` + `authorizeRead/Write`. WARN-2 prose corrected in the route lore comment.
- Diff delivers exactly the planned tasks A1-A8 + B1-B6. Nothing extra.

### Design — PASS
- New components have `.stories.tsx` siblings (`StripeRefundReview.stories.tsx`, `SettingsReviewSurfaces.stories.tsx`).
- Tokens only — `RefundLead`/`RefundRoutingNote`/`RenderedByLine` use `var(--*)`; spacing on 6px grid (`mx-[18px]`, `gap-[6px]`, `px-[12px]`, `py-[9px]`); radius `var(--r-subtle)`/`var(--r-pill)` on-scale. New `--status-warning-dim` token is warm amber `rgba(217,119,6,...)` (not cool), defined for light + dark.
- Accessibility: icon buttons carry `aria-label` (`SettingsReviewSurfaces.tsx:144` `⋯` → `Actions for ${tool} · ${kind}`; close `✕` → `Close artifact`; verdict overflow `⋯` → `More verdict options`). The "swap" affordance in `RenderedByLine` is a text button (accessible name present).
- Snapshot net covers the intended `action_operation` + composition diffs (verify green).

### Security — PASS (STRIDE)
- Tampering/EoP: every mutation has rate-limit + `teamId` query scoping. Cross-team DELETE → 404 (no existence leak), tested.
- Info disclosure: `AdoptionView` is pure config, never a secret; registry endpoint returns metadata-only manifests (no component refs).
- DoS: rate limiters present.
- POST validates `surfaceId` exists in the server registry (400 otherwise) + zod body validation + JSON-parse guard.
- No path/URL inputs (no traversal/SSRF surface in AL5 — community is build-time copy, no runtime fetch+eval, per concept).
- Auth on every route (`requireBoundary` enforced); 401-without-auth tested for all four endpoints.

### Adversarial — PASS (with NITs)
- *Saboteur:* no backdoors; the AL7 hard-branch is preserved, no silent OutcomeBand drop (verified against code). Error boundary genuinely catches (tested).
- *New Hire:* the `action_operation` render branch (`ReviewComposition.tsx:745-794`) is dense — an IIFE with 4 `as` casts and a long lore comment. Legible but takes a minute; see NIT-1.
- *Auditor:* PR claims match the diff. The server inlines a duplicate manifest (`SERVER_FIRST_PARTY`) rather than importing from web (legal — server can't import web); the duplication is a maintenance risk (NIT-2).
- Type safety: `as` casts concentrated at the resolver→render seam (resolve-surface.ts:73, ReviewComposition.tsx:760/762/763, surface-registry.ts:52). All sound given the FIRST_PARTY invariant + audited with comments. No `any`, no `@ts-ignore`, no non-null `!` abuse.

### Simplification — PASS (NIT)
- `resolveSurface` flattens the registry's discriminated union to `ReviewCanvasComponent`, forcing the render site to re-cast back to `ComponentType<ActionOperationCanvasProps>` (NIT-1). The union could thread through, but the cost is real (resolver is kind-agnostic) and the cast is audited — acceptable for AL5.
- No dead code, no premature generics, no value-free wrappers. `slot()` helper is single-purpose but used at 4 seams — justified.

### AI Slop — PASS
- No verbose filler, no "TODO: implement" on implemented code, no `=== true`. Comments are load-bearing (lore explaining the WARN-1 forwarding and the audited casts). The `_communityRegistries` unused-but-reserved state is intentional (the §3.2 seam) and prefixed `_`.

---

## Findings

### CRITICAL
*(none)*

### WARNING
*(none)*

### NIT

- **NIT-1 — render-site cast density at the resolver seam.** `ReviewComposition.tsx:760-763` re-casts the resolved component back to `ComponentType<ActionOperationCanvasProps>` because `resolveSurface` returns the narrow `ReviewCanvasComponent`. The registry already carries a `SurfaceRegistryEntry` discriminated union that *has* this type; flattening it in the resolver throws the type away and forces 4 audited `as` casts. Sound (FIRST_PARTY invariant guarantees it), but a kind-parameterized `resolveSurface<TProps>` would eliminate the re-cast. Out-of-scope for AL5; note for a fast-follow when the other 8 canvases get wrap seams.

- **NIT-2 — duplicated manifest between web and server.** `surface-adoptions.ts:47-64` inlines `SERVER_FIRST_PARTY` (a verbatim copy of `stripe-refund-review/manifest.ts`). The server legally can't import web, but the manifest *data* (id/version/provenance/trustTier/baseCanvas) could live in `packages/shared` and be imported by both — eliminating the drift risk where a version bump in web isn't mirrored server-side (the server pins `pinnedVersion` from its own copy). Low risk at one entry; revisit before the registry grows.

- **NIT-3 — `defaultLoader` fetches `/api/surface-adoptions` without `teamId`.** `ReviewPage.tsx` `defaultLoader` calls `apiFetch("/api/surface-adoptions")` with no `?teamId=`. The server returns **400** for a missing `teamId` (`surface-adoptions.ts:152`). The `.catch(() => null)` only catches a rejected promise, not a 400 response — but the subsequent `if (adoptionsRes?.ok)` guard handles the non-ok 400 correctly (adoptions stays `[]` → everything resolves to base canvas). So it degrades safely, but the fetch is **always a wasted 400 round-trip** in production and never actually loads adoptions (the plan's §5 intended `?teamId=…`). The wiring works (safe fallback) but does not deliver the adopted-surface render path end-to-end through the real loader — the feature is proven via the component prop (`adoptions` passed into `ReviewComposition`) and integration tests, not the live page loader. Recommend threading `user.teamId` into the query so adoptions actually load on the page. Not blocking AC2 (the resolver + route are proven independently), but the page-level integration is incomplete.

- **NIT-4 — migration 0038 carries unrelated `tailored_grants` ALTERs.** `0038_fat_vapor.sql:15-16` emits `ALTER TABLE tailored_grants ALTER COLUMN arg_pinned/consumed SET DATA TYPE boolean`. These columns were already created as `boolean` in 0037 — so the ALTERs are idempotent no-ops (a `db:generate` snapshot-drift artifact, not AL5's table). Harmless (verify green, migrations apply cleanly), but a migration should not carry unrelated statements. Hygiene NIT; regenerate cleanly if convenient.

### Adjudicated builder-noted items

- **Swap `⋯` aria-label** — **NOT a finding.** There is no unlabeled `⋯` swap button. The swap affordance in `RenderedByLine` (`ReviewComposition.tsx:680`) is a **text** button ("swap") with an accessible name. The `⋯` buttons that exist (verdict overflow `:165`, settings actions `SettingsReviewSurfaces.tsx:144`) both already carry `aria-label`. No fix needed.

- **`SettingsOrgChart.tsx:191` `undefined.filter()`** — **CONFIRMED pre-existing, out of scope.** `SettingsOrgChart.tsx` is **not touched** by the AL5 diff (empty diff). The `users.filter((u) => u.kind === "human")` at line 191 exists verbatim on `origin/main`. Any `undefined.filter()` there is an AE2-era issue unrelated to AL5. Noted; no fix required.

### Phase-2 NITs — landed

- **knip-guard on `CommunityRegistryIndex`** — ✅ imported + used in `SettingsReviewSurfaces.tsx:37,254` (`_communityRegistries` state, the §3.2 seam) AND re-exported from `shared/src/index.ts:326`. Real importer present; knip green.
- **explicit `UNLISTED_SLOT_DEFAULT`** — ✅ named const in `slot-policy.ts:47` with the "eject-by-default, not forgot-to-list" comment, consumed by `slotPermission()`.
- **loader simplification (drop speculative `reviews.ts` change)** — ✅ no `reviews.ts` change; adoptions fetched standalone (though see NIT-3 re: missing `teamId`).

---

## Verdict: DONE

5/5 ACs shipped and proven against the real path. Both load-bearing invariants (deterministic floor fallback; DB-enforced single adoption) survive sanity-break — green on real code, RED when reverted. WARN-1 fix is structural (OutcomeBand not a slot). No CRITICAL, no WARNING. Four NITs (cast density, server manifest dup, loader-teamId, migration drift) — none blocking. NIT-3 (loader missing `teamId`) is the most consequential: the page-level loader degrades safely to base but does not load adoptions live; the adopted-render path is proven via prop + tests, not the production loader. Recommend the builder thread `teamId` as a follow-up; it does not block AL5 DONE because the resolver, route, and component integration are independently proven.
