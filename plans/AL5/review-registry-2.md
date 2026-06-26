# AL5 registry/install — Phase-4 re-review (attempt 2)

**Verdict: NOT DONE**

Loop is closed on paper, broken in fact. The four-point wiring (target dir, generated `register.ts`, generated index, shared manifest append) is all present and the CLI really writes all four. But the one mechanism the CLI actually produces — a side-effecting import that calls `registerSurface()` at module-load — **crashes the registry module the instant a real surface is installed**, due to an import-ordering temporal-dead-zone bug. The green e2e never exercises that path; it calls `registerSurface()` directly, so it cannot catch the crash. Same class of false-green the WP was reopened for (mock-validation-trap / live-proof memories): sub-steps proven, the integrated CLI-produced path not.

---

## Live CLI probe (item 2 — actually exercised)

Ran `npm run surface:add -- /tmp/al5-fixture/surf` (local fixture, id `al5-cli-probe`). Result:
- Files copied to `packages/web/src/pages/review/surfaces/al5-cli-probe/` ✓ (correct built path — prior NOT-DONE #1 fixed)
- `register.ts` generated with `registerSurface(manifest, Al5CliProbe)` ✓
- `surface-registry.generated.ts` got `import "./al5-cli-probe/register.js";` ✓
- `FIRST_PARTY_SURFACE_MANIFESTS` in `packages/shared/src/review-surface.ts` got the manifest appended ✓
- `npx tsc --noEmit -p packages/web/tsconfig.json` → **clean** (codegen produces valid TS) ✓

All four wiring points land. Then ran the e2e **with the probe present**:

```
ReferenceError: Cannot access 'REGISTRY' before initialization
 ❯ registerSurface surface-registry.ts:107:2
 ❯ surfaces/al5-cli-probe/register.ts:40:1
 ❯ surfaces/surface-registry.generated.ts:13:1
```

Probe artifacts cleaned (`rm -rf .../al5-cli-probe` + `git checkout` of generated index + shared). Tree clean.

---

## CRITICAL — temporal-dead-zone crash on first install (loop NOT closed)

`packages/web/src/pages/review/surfaces/surface-registry.ts`:
- line **29**: `import "./surface-registry.generated.js";` — side-effecting; runs every installed `register.ts` → calls `registerSurface()` at module-eval time.
- line **75**: `const REGISTRY = new Map(...)`
- line **106**: `export function registerSurface(...)` → body line 107 reads `REGISTRY.has(...)`.

ESM evaluates the line-29 import **before** the line-75 `const REGISTRY` initializes. So the generated `register.ts` → `registerSurface()` → `REGISTRY.has()` hits `REGISTRY` in its temporal dead zone → `ReferenceError`. **The whole surface-registry module throws on load** → ReviewPage / any surface resolution crashes.

Why `npm run verify` stayed green: the **committed** `surface-registry.generated.ts` is empty (no import lines), so line 29 is a no-op. The crash is dormant until a real surface is installed — i.e. exactly the install→adopt loop this WP exists to close. **Install any surface → registry module un-loadable.**

**Fix:** move the side-effecting `import "./surface-registry.generated.js"` to the **bottom** of `surface-registry.ts` (after `REGISTRY` + `registerSurface` are declared), or hoist `REGISTRY`/`registerSurface` above it. Then the generated import runs against an initialized Map. Add a test that imports through the generated index (below).

## CRITICAL — the e2e cannot catch this (false green)

`AL5-install-adopt-e2e.test.tsx` (13 tests) calls `registerSurface(FIXTURE_MANIFEST, …)` **directly from the test body** (lines 99, 110, 119, 128, 138, 156, 170, 190). It never imports a generated `register.ts` through `surface-registry.generated.ts`. The line-98 comment says "simulates what the generated register.ts does" — but it simulates the *function call*, not the *module-load import path*, which is the only path the CLI produces and the only one that crashes. The single mechanism the CLI emits is the single mechanism untested.

- Sanity-break (item 3): neutered `registerSurface` to a bare `return;` → **7/13 e2e tests went RED** (Part A registration + Part B adopted-resolution). So the e2e genuinely drives the real registry + resolver (not a mock) — the sub-steps it *does* cover are real. Restored; tree clean.
- Server-adopt-201 side: real for the first-party stripe surface — `surface-adoptions.integration.test.ts:136` (POST 201), `:373` (unknown surfaceId → 400). But **no server test adopts a non-stripe / community / installed manifest**; the installed-surface server path is proven only structurally (Part C asserts `OFFICIAL_REGISTRY_INDEX.surfaces ⊇ FIRST_PARTY_SURFACE_MANIFESTS` — a near-tautology given the index *is* that array).

**Fix:** add a test that (a) imports through a generated `register.ts` (commit a fixture surface dir + a generated-index that imports it, or have the test import the generated index module) so the load-order is exercised; and (b) ideally a server integration test that adopts a community manifest appended to the shared array → POST 201. The load-order test reverting to "import at top" must go red.

---

## Loop status — web-resolve + server-adopt evidence

| Side | Closed? | file:line |
|---|---|---|
| Install → built path | YES | `scripts/surface-add.ts:61-69` → `packages/web/.../surfaces/<id>/` (confirmed by live probe) |
| Registration codegen | YES (emits) / NO (crashes) | `add-install.ts:314` generateRegistrationFile; `:380` updateRegistryGeneratedIndex; crash at `surface-registry.ts:29` vs `:75` |
| Web-resolve of installed surface | **NO** | `resolve-surface.ts:55` getSurfaceEntry works **only if** the registry module loaded — but line-29 import makes it throw once a real surface is registered |
| Server-adopt 201 (first-party) | YES | `surface-adoptions.ts:54-56,195-201` + `surface-adoptions.integration.test.ts:136` |
| Server-adopt 201 (installed/community) | UNPROVEN | CLI appends to `FIRST_PARTY_SURFACE_MANIFESTS` (`surface-add.ts:184`) → `OFFICIAL_REGISTRY_INDEX.surfaces` → `SERVER_REGISTRY`; structurally sound, but never exercised with a real community manifest |

Server side is genuinely closed for first-party and structurally sound for community. **Web side is broken** — the headline loop does not close.

---

## Adjudication — remaining seams (item 4)

**(a) `OFFICIAL_REGISTRY_INDEX_URL` → REMOVE.** `registry-index.ts:44`, points at non-existent `registry.hyperidle.com`, exported from the barrel (`index.ts:325`), referenced nowhere else, never fetched. The official index is in-repo/derived; community indexes load via an explicit user-supplied URL through `loadRegistryIndex(url)`. The constant is a value-free forward-pointer with no caller. Same finding as review #1; not addressed. **Recommend: delete the export + its barrel line.** (Keep `loadRegistryIndex` — it's the real community-URL path and is wired.)

**(b) Community surfaces appended to a const named `FIRST_PARTY_SURFACE_MANIFESTS` — naming smell, WARNING.** `surface-add.ts:184` appends `provenance: "community"` manifests into `FIRST_PARTY_SURFACE_MANIFESTS`. The array now means "all manifests the server registry knows", not "first-party". Honest-naming violation. Acceptable short-term (the array is the single server-side source of truth and provenance is carried per-entry), but rename to e.g. `REGISTERED_SURFACE_MANIFESTS` / `SERVER_SURFACE_MANIFESTS` and update the CLI append + the `OFFICIAL_REGISTRY_INDEX` derivation. Not a blocker on its own; fix alongside the CRITICALs.

---

## Other lenses

**Slop / dead stub — NEW.** `@hyperidle/shared/add` subpath export (`packages/shared/package.json:9`) + the `index.ts:5` comment "CLI and server code imports them via `@hyperidle/shared/add` subpath" are **not true** — no runtime source imports `@hyperidle/shared/add`. The CLI imports the source path `../packages/shared/src/add-install.js` directly (`surface-add.ts:50`, with its own lore explaining why). The subpath is a dead export introduced by this fix. Either wire the CLI to use it or drop the export + correct the comment. (It is knip-invisible because subpath exports aren't entrypoint-analyzed the same way.)

**Simplification — WARNING.** `appendManifestToShared` (`surface-add.ts:257-266`) inserts before `content.lastIndexOf("];")`. There are 7 `];` occurrences in `review-surface.ts`; the CLI worked only because `FIRST_PARTY_SURFACE_MANIFESTS` happens to be the file's last array. Positional/fragile string-surgery on a TS source file. Build-time + human-reviewed lowers severity, but a sentinel comment marker (e.g. insert before `/* SURFACE-MANIFESTS-END */`) would be robust. Also the inserted entry hardcodes `baseCanvas: "action_operation"` default and inline `as import("./review-surface.js").ReviewCanvasKind` casts — works, ugly.

**Security (minimal-hygiene, per ETHOS — correct posture).** Prior #1 path-traversal asymmetry FIXED: `surfaceId = basename(manifest.id.replace(/[/\\]/g,"-"))` + empty-after-sanitize reject (`add-install.ts:176-179, 222-225`); file paths still stripped (`:188, :236`). Good. Server routes unchanged: rate-limiters + boundary + authorizeRead/Write + teamId-filter isolation — fine.

**Comments (prior #4) — FIXED.** The "(or all files in the directory)" inaccuracy is corrected (`add-install.ts:124-126` now says "NOT all files in the directory; only explicitly listed files").

---

## Required to reach DONE

1. **CRITICAL** — Fix the load-order crash: move `import "./surface-registry.generated.js"` to the bottom of `surface-registry.ts` (after `REGISTRY` + `registerSurface`), or hoist the declarations above it. Verify by re-running the live CLI probe → e2e must stay green with a real surface installed.
2. **CRITICAL** — Add a test that drives the **generated-import path** (a committed fixture `surfaces/<id>/register.ts` imported via the generated index), proving the surface is registered + resolvable through module-load, not just via a direct `registerSurface()` call. Sanity: reverting the import to the top of `surface-registry.ts` must turn it red.
3. **REMOVE** `OFFICIAL_REGISTRY_INDEX_URL` (export + barrel line) — dead forward-pointer, never fetched.
4. **WARNING** — Remove the dead `@hyperidle/shared/add` subpath export + fix the `index.ts:5` comment (no runtime importer), OR wire the CLI through it.
5. **WARNING** — Rename `FIRST_PARTY_SURFACE_MANIFESTS` → `REGISTERED_/SERVER_SURFACE_MANIFESTS` (community entries are appended there); replace `lastIndexOf("];")` with a sentinel marker.
