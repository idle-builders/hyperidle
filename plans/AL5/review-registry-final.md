# AL5 Registry/Install — Final Review (Pass 4)

**Verdict: DONE**

Prior verdict (pass 3): NOT DONE — single blocker: the cycle/TDZ regression guard was false-green (a runtime test that vitest/vite ESM transform cannot reproduce). Recommendation: static ESLint `no-restricted-imports` guard forbidding generated `register.ts`/`*.generated.ts` under `surfaces/` from importing `./surface-registry`. Builder implemented exactly that. This pass confirms it.

## 1. Lint guard is real + correctly scoped — CONFIRMED

`eslint.config.ts` AL5 block (lines 1097–1161):
- `files`: `surfaces/**/register.ts`, `surfaces/**/*.generated.ts`, `surfaces/__test-fixtures__/**/register.ts`.
- `no-restricted-imports` (error) — `group` patterns cover every relative depth resolving to `surface-registry` (`./`, `../`, `../../`, with/without `.js`) plus the bare `**/surface-registry` / `**/surface-registry.js`.
- Allows `surface-registry-api` (not in the banned group) — the TDZ-safe leaf.

**Independent break (re-run by reviewer):**
- Injected `import "../../surface-registry.js";` into the in-scope fixture `__test-fixtures__/al5-tzdguard-surface/register.ts`.
- `npm run lint:eslint` →
  `21:1 error '../../surface-registry.js' import is restricted ... AL5 TDZ-GUARD: generated register.ts and *.generated.ts must import registerSurface ONLY from surface-registry-api ... no-restricted-imports` → `1 problem (1 error)`.
- Reverted → `npm run lint:eslint` exit **0** (clean — no false-positive on the real api-path imports in the generated index, the first-party register file, or `surface-registry-api.ts`).

Guard is non-vacuous and correctly scoped. (Note: `npx eslint <singlefile>` fails with a type-info parserOptions error — an artifact of invoking eslint outside the project runner, not a rule defect; `npm run lint:eslint` is the project's real lane and fires the rule correctly.)

## 2. Codegen template emits the api-path import — CONFIRMED

`packages/shared/src/add-install.ts` `generateRegistrationFile` (line 355):
```
import { registerSurface } from "../surface-registry-api.js";
```
Real installed surfaces live at `surfaces/<id>/register.ts`, so `../surface-registry-api.js` resolves to `surfaces/surface-registry-api.ts` (correct — one level up). Every `surface:add` therefore produces a rule-compliant file. The fixture (one dir deeper, `__test-fixtures__/<id>/register.ts`) correctly uses `../../surface-registry-api.js`.

## 3. No real coverage lost in the two reworded test files — CONFIRMED

`AL5-tzdguard-import-chain.test.ts`: keeps the genuine registration assertions — `getSurfaceEntry`/`listSurfaces`/`listRegisteredManifests` reflect the fixture after the generated-index→register→api import chain, idempotency (exactly one entry), first-party stripe coexistence, and api-leaf `registerSurface` export. No `expect(true).toBe(true)` sentinel; the only "TDZ-GUARD" string is a doc comment correctly stating the static rule (not the test) is the guard.

`AL5-install-adopt-e2e.test.tsx`: Part A registration, Part B resolver (adopted / base-floor / missing-surface degrade / version-mismatch-still-adopted), Part C now asserts the real `OFFICIAL_REGISTRY_INDEX.surfaces` ⊇ `REGISTERED_SURFACE_MANIFESTS` derivation + length equality — no tautology.

## 4. Nothing else regressed — CONFIRMED

- Unit/component (6 files): **62 passed** — registration, resolve, registry-index, add-install resolver, no-dead-stubs.
- Integration `surface-adoptions`: **14 passed** — adopt 201, unknown 400, auth 401, delete, registry index route. Deterministic adoption, floor fallback, lens-never-decides all hold.
- `npm run lint:eslint` exit 0 on clean tree.
- Builder reports `npm run verify` green; spot lanes above corroborate.
- Dead `__test-fixtures__/fixture-surface-registry.ts` deleted; `**/__test-fixtures__/**` added to knip ignore.

## Residual

None blocking. NIT only: the AL5 lint block's rule message and the in-source doc comments still use the "TDZ-GUARD" framing in prose — accurate, just verbose. No action required.
