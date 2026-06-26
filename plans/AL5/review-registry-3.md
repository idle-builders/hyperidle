# AL5 registry/install — Phase-4 re-review (attempt 3, final loop pass)

**Verdict: NOT DONE**

The *bug* is genuinely fixed. The *regression guard* is not — and a real red-on-regression guard was the explicit fix condition from attempt-2. Same false-green class the WP was reopened for twice (mock-validation-trap / live-proof). One specific, cheap blocker remains.

---

## What is actually correct (confirmed concretely)

### 1. TDZ structural fix is real — leaf is genuinely cycle-free
Import graph traced:

```
surface-registry.ts ──┬─→ surface-registry.generated.ts ─→ <id>/register.ts ─┐
                       └─→ surface-registry-api.ts  ◄────────────────────────┘
                           (leaf: imports only @hyperidle/shared types +
                            ReviewActionOperation type + review-artifact type.
                            NO import of surface-registry.ts — verified by grep:
                            every "surface-registry.ts" hit in the leaf is a comment.)
```

`register.ts` → `surface-registry-api.ts` (leaf). No edge back up. Cycle broken. `REGISTRY` + `registerSurface` + `SurfaceRegistryEntry` live in the leaf; `surface-registry.ts` re-exports for compat. The codegen template (`add-install.ts:355`) and both fixtures hard-code the `surface-registry-api.js` path. **Correct.**

### 2. The fix actually works through the REAL generated index (live-proved here)
Wired a probe surface through the **real** `surface-registry.generated.ts` (not the fixture's own index):
- BAD path (`register.ts` imports `../surface-registry.js`) → module fails to load:
  `TypeError: registerSurface is not a function` at `tdz-live-probe/register.ts:5` (vite's manifestation of the same circular-init dead-zone the WP crashed on).
- GOOD path (`../surface-registry-api.js`) → loads clean, surface resolvable. Test passes.

So the api-module split genuinely fixes the crash. Probe + generated-index edit cleaned, tree clean.

### 3. Server loop closed — really tested through the route
`surface-adoptions.integration.test.ts` drives the real Hono route via the `app` fixture:
- `:136` POST registered surface → **201** AdoptionView.
- `:388` POST unknown surfaceId → **400** (`SURFACE_NOT_FOUND`).
- UPSERT/at-most-one (`:185`), cross-team DELETE → 404 (`:320`), auth 401 gates all present.
POST validates against `SERVER_REGISTRY` built from `OFFICIAL_REGISTRY_INDEX.surfaces` ← `REGISTERED_SURFACE_MANIFESTS`. Loop is real on the server side.

### 4. Web-resolve side real
`getSurfaceEntry` / `resolveSurface` → `source:"adopted"` for a registered id, `missing-surface` degrade for unknown, `version-mismatch` still-adopted, base floor on no adoption. Driven against the real modules (attempt-2 sanity-break already proved 7/13 go red when `registerSurface` is neutered).

### 5. Four cleanups all landed cleanly
- `OFFICIAL_REGISTRY_INDEX_URL`: gone from code (only @lore + a `… in registryIndex).toBe(false)` guard test remain). ✓
- `@hyperidle/shared/add` subpath: gone from `packages/shared/package.json` exports (only `.` + `./net`). ✓
- `FIRST_PARTY_SURFACE_MANIFESTS` → `REGISTERED_SURFACE_MANIFESTS`: renamed everywhere; old name only in @lore. ✓
- Sentinel-marker codegen: `appendManifestToShared` (`surface-add.ts:263`) uses `/* surface:add inserts above */` (`indexOf`, throws if absent); sentinel present at `review-surface.ts:128`. `lastIndexOf("];")` gone (remaining `lastIndexOf` hits are unrelated path utils). ✓

`npm run check` clean (13 packages). 79 AL5 surface/shared tests pass.

### 6. Invariants — no regression
Deterministic adoption (Map lookup, no scoring), floor fallback (`resolve-surface.ts:50`), lens-never-decides (adoption row is the decision) all intact. Idempotent `registerSurface`. Build-time-only install (no runtime eval).

---

## BLOCKER (single) — the new guard is a false-green; sanity-break stays GREEN

Attempt-2's required fix was explicit: *"a load-order test… reverting to 'import at top' must go red."* That condition is **not met**.

`AL5-tzdguard-import-chain.test.ts` does NOT exercise the crashing import order. **Sanity-break performed:** reverted the fixture `register.ts` to the bad path (`import { registerSurface } from "../../surface-registry.js"`) and ran the guard → **8/8 tests STILL PASS.** The test cannot go red on the exact regression it claims to guard. (The test header even concedes this: "vitest doesn't reproduce the TDZ".)

**Root cause** — the fixture chain uses a *different, safe* import order than production:
- The fixture wires through its own `__test-fixtures__/generated-index-fixture.ts`, and `AL5-tzdguard-import-chain.test.ts:45` imports `surface-registry.js` at the **top** (fully caching it) **before** `:51` imports the fixture index.
- By the time the fixture `register.ts` runs, `surface-registry.ts` is already fully evaluated → no cycle → bad path is harmless.
- Production order is the opposite: `surface-registry.ts`'s **own body** triggers `→ generated.ts → register.ts` *while surface-registry.ts is still evaluating*. That is the cycle. I reproduced it through the **real** `surface-registry.generated.ts` (see "correct #2"): bad path → `TypeError: registerSurface is not a function`; that same wiring with the good path → green.

So a guard wired through the **real** generated index DOES catch the regression — the builder's fixture just doesn't use it. The single mechanism that crashes is still the single mechanism untested. Bug fixed; guard not real.

### The fix (cheap, ~15 min)
Replace the fixture's bespoke `generated-index-fixture.ts` / top-of-file pre-cache with a test that loads through the **real** chain in production order — i.e. import a committed fixture surface dir via the real `surface-registry.generated.ts` body path (or a test module whose first import is the generated index, not surface-registry). Then flipping the fixture `register.ts` to `../surface-registry.js` MUST turn the suite red (I verified it does: `TypeError: registerSurface is not a function`). Re-run the sanity-break and report it goes red.

(Alternative / complement, since a build-order property is a *static* invariant per the validation rules: an ESLint `no-restricted-imports` forbidding `surfaces/*/register.ts` and `surface-registry.generated.ts` from importing `./surface-registry.js` — fails `npm run lint` on reintroduction. There is currently **no** such static guard either.)

---

## Residual findings (non-blocking)

- **Slop / dead seam:** `__test-fixtures__/fixture-surface-registry.ts` (exports `REGISTRY` + `FIXTURE_REGISTRY_LOADED`) is imported by **nothing** (knip `--include files` flags it; grep confirms zero importers). Delete it — it's a leftover from an earlier fixture shape. Doesn't fail the knip gate but is exactly the kind of dead fixture the guard should remove.
- **Slop:** `AL5-install-adopt-e2e.test.tsx` still calls `registerSurface()` directly (lines 99–190) — the attempt-2 false-green path. Harmless now that the new test exists, but redundant; the file's Part C ("OFFICIAL_REGISTRY_INDEX ⊇ REGISTERED_SURFACE_MANIFESTS") is a near-tautology given the index *is* that array. Not load-bearing once a real load-order guard lands.

---

## Verdict

**NOT DONE.** Single blocker: the TDZ regression guard does not guard — sanity-break (bad import path) leaves it green, because the fixture exercises a pre-cached import order, not the production cycle. The crash itself is genuinely fixed (live-proved through the real generated index) and the server/resolve loop + 4 cleanups are all real. Make one test load through the real generated index in production order so that reverting `register.ts` to `../surface-registry.js` turns it red; re-run the sanity-break to confirm red. Then ship.
