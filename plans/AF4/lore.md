# AF4 Lore

## The typecheck gate IS leaf-dist-dependent (and `tsc -b` scatters src droppings)

Two coupled gotchas bite anyone draining a non-leaf package (server/web/fabric) from
`typecheck-debt.json`. Both are empirically verified (orchestrator ran the definitive
tests during the AF4 pipeline).

### 1. The gate needs leaf `dist/*.d.ts` present, or it reports a phantom error count

`scripts/typecheck-gate.ts` (AF1-owned, frozen) runs `tsc --noEmit -p packages/<pkg>/tsconfig.json`
per package. `server`/`fabric`/`web` are project-`references` consumers of `shared`+`db`.
With `--noEmit`, tsc does NOT build those references — it reads their **emitted
declarations** (`packages/<leaf>/dist/*.d.ts`) to resolve cross-package symbols.

- **Leaf `dist/` PRESENT & fresh** → server resolves real types → **server = 0** (the true count).
- **Leaf `dist/` ABSENT** (fresh clone, `git clean -fdx`, or after `rm -rf packages/*/dist`)
  → cross-package symbols (notably the vitest fixture `dbTest`) resolve to `any` →
  a cascade of **~3400 phantom `TS7031`/`TS2xxx` errors**. The gate's reference-noise
  filter only suppresses `TS6305/6307/6059` (the "not built" notices) — it does **NOT**
  suppress the downstream cascade, so the phantom count is real to the gate and the
  package FAILS.

**Proof:** `rm -rf packages/{shared,db,fabric}/dist packages/*/*.tsbuildinfo && npm run check`
→ `server 3428 FAIL`, `design-system 15 FAIL`, `desktop 1 FAIL`. Rebuild the leaf dist
→ `server 0 PASS`, all 11 packages PASS.

> An earlier draft of this file claimed the gate needs no pre-build ("server=0 on a bare
> checkout"). That was WRONG: the "bare" checkout still had gitignored `dist/` left over
> from an earlier build. A genuinely dist-free tree phantom-fails. `dist/` is gitignored,
> so it never shows in `git status` — easy to believe you have a dist-free tree when you
> do not. Always confirm with `ls packages/shared/dist` before trusting a gate count.

### 2. Building the leaf dist scatters `.d.ts/.js` into `src/`, which biome lints

`npx tsc -b packages/shared packages/db packages/fabric` is the obvious way to populate
dist, but these packages are NOT wired as clean composite references for a combined `-b`
(db imports `shared/src` outside db's `rootDir`), so `-b` emits with `TS6059/TS6307`
rootDir notices AND scatters generated `.d.ts/.js/.map` into `packages/{shared,db}/src/`
(~96 + ~18 files). Biome ignores `**/dist` but lints `src/`, so it flags those generated
files as **~714 `noBannedTypes` errors** (mostly from generated `.d.ts`). They are NOT
real source errors — delete the droppings and biome is clean (323 warnings, 0 errors).
`tsc -b` still emits usable `dist/*.d.ts` despite the rootDir notices, so it does satisfy
gotcha #1 — you just must clean the src droppings afterward.

### Correct procedure for draining server (or any leaf consumer) and shipping

1. **Populate leaf dist** so the gate sees real counts: `npx tsc -b packages/shared packages/db packages/fabric`
   (ignore the TS6059/TS6307 rootDir notices — it still emits the dist).
2. **Delete the src droppings, keep `dist/`:**

       git status --short | grep -E '^\?\? packages/.*src/.*\.(d\.ts|js|map)$' \
         | awk '{print $2}' | xargs -r rm -f

   Confirm `git status --short` shows only intended changes — no `.d.ts/.js/.map` under
   any `src/`.
3. **Run `npm run verify`** with dist present + src clean → check sees server=0, biome
   sees clean src → exit 0, attestation written.

### Why this ships anyway (and why CI never sees the phantom)

CI does NOT re-run the gate. `.github/workflows/ci.yml` runs `scripts/check-attestation.ts`,
which validates the HMAC signature of the locally-produced `npm run verify` attestation.
The attestation is generated locally where leaf `dist/` exists (server=0), so CI accepts
it. The leaf-dist fragility only bites a developer running `npm run check`/`verify` on a
genuinely dist-free tree. This is the AF1 systemic gap (the gate should build references
first, or be made deterministic w.r.t. dist) — recorded for AF1, out of AF4 scope. See
also `plans/Z8/master-flag-register.md` (Z8-166 attestation-bypass, Z8-169 gate
build-state nondeterminism).

## Attestation churn

`npm run verify` rewrites `.verify-attestations/<sha>.json` (deletes the old tracked
file, writes a new untracked one). `.verify-attestations/` is NOT gitignored (only the
singular `.verify-attestation.json` is). `/ship` regenerates + commits the attestation
after retro, so the builder must NOT commit it: `git restore` the deleted tracked file
and `rm` the freshly-written one to keep the worktree clean.
