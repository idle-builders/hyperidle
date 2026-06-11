# AF4 Lore

## The `tsc -b` dropping trap — and why the verify sequence is just `npm run verify`

**Symptom that recurs:** Running `npx tsc -b packages/shared packages/db packages/fabric`
to "populate dist" before `npm run lint`/`verify` scatters generated
`.d.ts`/`.js`/`.map` files into `packages/*/src/` (~96 in shared/src, ~18 in db/src).
Biome ignores `**/dist` but lints `src/`, so it lints those generated droppings and
reports ~714 `noBannedTypes` errors (580 of them from generated `.d.ts`). These are NOT
real source errors — they vanish when the droppings are deleted.

**Root cause / why the leaf build was thought necessary (and is NOT):**
The AF1 typecheck gate (`scripts/typecheck-gate.ts`, frozen/AF1-owned) runs
`tsc --noEmit -p packages/<pkg>/tsconfig.json` per package and **explicitly filters out
TS6305/TS6307/TS6059 as cross-package reference noise** (see its `@lore AF1 TS6305/...`
block). Cross-package imports resolve through the root tsconfig `paths` aliases, which
point at **`src`, not `dist`**. Therefore the gate does **not** need fresh leaf
`dist/*.d.ts` to see real server errors — there is no "stale-dist TS7031 phantom" to
defeat. Verified empirically on a bare clean checkout (no leaf build, zero droppings):

- `npm run check` → PASS, all 11 packages, **server = 0 errors**
  (eval=8, web=211, both pre-existing QUARANTINED in `typecheck-debt.json`).
- `npm run lint:biome` → **0 errors**, 323 warnings (exit 0).
- full `npm run verify` → **exit 0** end-to-end.

`tsc -b` across these three packages additionally FAILS (114 TS6059/TS6307 rootDir
errors) because their tsconfigs are not wired as composite project references for a
combined `-b` invocation — another reason it is the wrong tool here.

**Correct procedure:** Do NOT pre-build leaf packages. Just run `npm run verify` on a
clean tree. If droppings already exist from a stray `tsc -b`, delete them (keep `dist/`):

    git status --short | grep -E '^\?\? packages/.*src/.*\.(d\.ts|js|map)$' \
      | awk '{print $2}' | xargs -r rm -f

Then `git status --short` should show only intended changes — no `.d.ts`/`.js`/`.map`
under any `src/`.

**Upstream fix (AF1-owned, not done here):** the gate's per-package
`tsc --noEmit -p` already tolerates missing dist via the reference-noise filter, so no
pre-build is warranted. If a future change ever makes the gate depend on real emitted
`.d.ts`, emit to `dist` only and keep biome's `**/dist` ignore — never let emit land in
`src/`.

## Attestation churn

`npm run verify` rewrites `.verify-attestations/<sha>.json` (deletes the old tracked
file, writes a new untracked one). `.verify-attestations/` is NOT gitignored (only the
singular `.verify-attestation.json` is). `/ship` regenerates + commits the attestation
after retro, so the builder must NOT commit it: `git restore` the deleted tracked file
and `rm` the freshly-written one to keep the worktree clean.
