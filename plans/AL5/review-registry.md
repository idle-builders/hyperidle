# AL5 registry/install completion — Phase 4 review

**Verdict: NOT DONE**

Scope reviewed: the reopened "registry/community" completion (commits `dd924f35..c97b9ccd`, diff base `4b983a6d`). New: `packages/shared/src/registry-index.ts`, `packages/shared/src/add-install.ts`, `scripts/surface-add.ts` + `npm run surface:add`, server route now reads `OFFICIAL_REGISTRY_INDEX.surfaces`, `SettingsReviewSurfaces.tsx` community-index-by-URL + install affordance, dead `_communityRegistries` removed. Tests: `AL5-registry-index*`, `AL5-add-install-resolver`, `AL5-no-dead-stubs`, `AL5-community-index`, `AL5-browse-reads-index`.

All targeted tests green (28 shared + 8 web + 3 server-integration). `npm run check` PASS, `npm run lint` PASS (warnings-only), `knip` 0-unused. Sanity-break confirmed real (below). **But the install → adoptable loop is NOT closed end-to-end** — the central reason this WP was reopened recurs in a new form.

---

## AC audit

| AC (sharpened, commit 2ebb8f42) | Status | Evidence |
|---|---|---|
| Discovery: browse reads list from a registry **index** (JSON catalog), not a hardcoded in-repo map | **PARTIAL** | Server now builds `SERVER_REGISTRY` from `OFFICIAL_REGISTRY_INDEX.surfaces` (`surface-adoptions.ts:54`). But `OFFICIAL_REGISTRY_INDEX.surfaces === FIRST_PARTY_SURFACE_MANIFESTS` verbatim (`registry-index.ts:57`). It is the same hardcoded set behind one constant of indirection. |
| Ships one **curated official index**; team can point browse at a **community index by URL** | **MET** | `loadRegistryIndex(url)` (`registry-index.ts:71`) wired in `handleAddRegistry` (`SettingsReviewSurfaces.tsx:459`); community surfaces listed; URL input present. |
| Install: `add <source>` fetches registry item + files from URL / GitHub / local and **copies into the repo's `surfaces/` dir, after which adoptable** | **NOT MET** | Files copied into **repo-root `surfaces/`** (`scripts/surface-add.ts:34`). The app builds + resolves surfaces only from `packages/web/src/pages/review/surfaces/` via **static imports** in `surface-registry.ts:23-24`. Nothing reads root `surfaces/`. Installed surface is never built, never registered, never adoptable. |
| Proven end-to-end: install → appears in registry → adopt → renders | **NOT MET** | No test or code path closes this. `installSurface` tests assert only a file copy into an arbitrary tmp `targetDir`; no test takes an installed surface through registry → adopt → render. |
| Community surface in an index but not installed shows "install via `add …`", not one-click adopt | **MET** | `communityOnlySurfaces` computed by set-difference vs server registry; renders "Install via `add <id>`" affordance (`SettingsReviewSurfaces.tsx:649-657`), no Adopt button. Asserted by `AL5-community-index.test.tsx`. |
| No dead stubs — every typed seam wired/tested or removed | **MET** | `_communityRegistries` dead `useState` removed; `CommunityRegistryIndex` now genuinely consumed (`SettingsReviewSurfaces.tsx:454,466,481`). knip 0-unused. |

Two of the three reopen-defining ACs (real install path; install→adopt→render proven) are **not met**.

---

## Install → adoptable loop — the crux (items 1-3)

The loop is **open**. Concrete trace:

**1. Install target dir is wrong.** `scripts/surface-add.ts:33-34`:
```ts
const repoRoot = join(__filename, "..", "..");
const DEFAULT_SURFACES_DIR = join(repoRoot, "surfaces");   // → <repo>/surfaces/
```
The app's surfaces live in `packages/web/src/pages/review/surfaces/` (confirmed: that dir holds `surface-registry.ts`, `resolve-surface.ts`, `stripe-refund-review/`; **no repo-root `surfaces/` dir exists**). The `eslint-plugin-design/no-surface-network-import` rule keys surface files on the `/surfaces/` path fragment under that web path — root `surfaces/` is outside the app entirely. A surface installed by `add` lands where nothing builds or imports it. **Install does nothing real.** Fix: target `packages/web/src/pages/review/surfaces/<id>/` (and accept that a `.tsx` copied there still needs registration — see item 2).

**2. `add` does not register the surface.** The web registry (`surface-registry.ts:23-24,51-63`) is a static `Map` built from **literal imports** of `stripeRefundReviewManifest` / `StripeRefundReview`. `getSurfaceEntry`/`listSurfaces` only ever return `FIRST_PARTY`. `installSurface` copies files and returns `{surfaceId, installedPath}` — it touches neither the web `REGISTRY` Map, nor `FIRST_PARTY_SURFACE_MANIFESTS`, nor `OFFICIAL_REGISTRY_INDEX`. So even if files landed in the right dir, `resolveSurface` → `getSurfaceEntry(adoption.surfaceId)` returns `undefined` → degrades to base canvas (`resolve-surface.ts:56-59`). The server's adopt POST also rejects any surfaceId not in `SERVER_REGISTRY` (`surface-adoptions.ts:192-198`) — which is the hardcoded set — so an installed community surface **cannot even be adopted** (400 SURFACE_NOT_FOUND). "Becomes adoptable" is asserted only by a tmp-dir file-copy test; the real registry/index never changes. **AC not met.**

**3. The index is the hardcoded set with extra indirection.** `OFFICIAL_REGISTRY_INDEX.surfaces = FIRST_PARTY_SURFACE_MANIFESTS` (`registry-index.ts:57`). Adding a surface to the system does **not** change what the index/browse lists — there is no mechanism to add to the index short of editing the source constant. The `AL5-registry-index-route` test's "strongest index-driven proof" (test 3) only asserts `apiIds ⊆ indexIds` — a tautology given the server is literally seeded from the index. The file's own header comment promises a test "If a surface is added to OFFICIAL_REGISTRY_INDEX, the API returns it" — **that test does not exist**. The browse-reads-index UI test proves only that the *component* reads `/api/surface-registry` (true, but it always did — pre-existing behavior); it stubs the server response, so it cannot prove the server list is anything but the hardcoded constant.

**Net:** items 1-3 are all broken, exactly as expected. The mechanism that would close the loop — `add` writing to the built path AND appending to a real on-disk index that the registry reads (e.g. a generated `surface-registry.generated.ts` or an `import.meta.glob` over `review/surfaces/*/manifest.ts`) — does not exist. Today: official catalog = hardcoded first-party; `add` = orphan file copy into a non-built dir; community index = browse-only with a manual "run this command" string whose command installs to the wrong place.

This is the same class of defect that caused the reopen ("typed-but-unwired stub"): the seams are now typed AND have green tests, but the tests prove sub-steps (parse, file-copy, fetch-validate, UI-render-from-mock) and never the integrated claim (install → registry → adopt → render). Per the mock-validation-trap and live-proof-lanes memories, this is a false green on the headline AC.

---

## Sanity-break (item 6)

Broke `installFromLocal` (`add-install.ts:182-184`) to skip the `writeFile`. `AL5-add-install-resolver` local-copy test went **RED** (`expect(files).toContain("TestSurface.tsx")` failed); restored → green. The file-copy test exercises real fs behavior, not a mock. (Note: this only proves the copy primitive works — not that the copy lands anywhere the app uses.)

---

## Other lenses

**Security (minimal-hygiene posture, correct per ETHOS "security never preemptive"):**
- **WARNING — unsanitized `surfaceId` path-join.** `surfaceId` comes from the fetched/parsed manifest `id` (`isRegistryItem` only checks `typeof === "string"`, `add-install.ts:50-57`) and is used directly in `destDir = join(targetDir, surfaceId)` (`add-install.ts:171,212`). A manifest with `id: "../../packages/server/src/evil"` escapes `targetDir` on install. The `files` entries are sanitized (`.replace(/\.\.[/\\]/g,"")`, lines 179,222) but `surfaceId` is not — an inconsistent guard. Build-time + human-reviewed, so low severity, but it's a one-line fix (validate `id` matches `/^[a-z0-9-]+$/` or strip traversal) and the asymmetry is a real gap.
- Server routes carry rate-limiters + boundary + authorizeRead/Write; team isolation at the query level — unchanged and fine.

**Simplification:**
- **`OFFICIAL_REGISTRY_INDEX_URL = "https://registry.hyperidle.com/surfaces/index.json"`** (`registry-index.ts:44`) is **aspirational** — `registry.hyperidle.com` does not exist; the constant is exported but only ever referenced by its own lore comment and never fetched. It is dead-but-knip-invisible (it's a `string` export consumed by the barrel). Either wire it (the official index could itself be loaded via `loadRegistryIndex(OFFICIAL_REGISTRY_INDEX_URL)` with the embedded constant as fallback) or drop it. As-is it's a value-free seam dressing the "real index" claim it doesn't deliver.
- `SERVER_FIRST_PARTY` (`surface-adoptions.ts:63`) is `Array.from(SERVER_REGISTRY.values())` immediately after building the map from the same source — one of the two is redundant; the route could map over `OFFICIAL_REGISTRY_INDEX.surfaces` directly.

**Slop:** Low. Naming honest, no AI tells, lore comments are load-bearing. The `installFromLocal` fallback comment "(or all files in the directory if `files` is omitted)" (`add-install.ts:124-125,174-175`) is **inaccurate** — the code falls back to `["registry-item.json"]` only, never "all files in the directory." Misleading comment on implemented code.

**Adversarial / New Hire:** The headline gap (install goes to a dead dir) is exactly what a new hire would hit in 10 minutes: run `npm run surface:add -- ./my-surface`, see "Installed… Adopt the surface in Settings", open Settings, surface is absent. The success message's step 4 ("Adopt the surface in Settings", `surface-add.ts:99`) promises an outcome the system cannot deliver.

---

## Required to reach DONE

1. `add` must install into the **built** surfaces path (`packages/web/src/pages/review/surfaces/<id>/`), not repo-root `surfaces/`.
2. An installed surface must become **registered + adoptable**: the registry (`surface-registry.ts`) and the server validator must discover on-disk surfaces (e.g. generate a registry module, or `import.meta.glob` the manifests) so `getSurfaceEntry`/`SERVER_REGISTRY` include it — and the official index must reflect installed surfaces, not just the static first-party constant.
3. One test that proves the **integrated** loop: install a fixture surface → it appears in the registry/index the app actually reads → adopt it (POST succeeds) → `resolveSurface` returns `source:"adopted"` for it. Until that exists (and a sanity-break reverting the registration step turns it red), the reopen-defining AC is unproven.
4. Fix the `surfaceId` path-traversal asymmetry; resolve or wire `OFFICIAL_REGISTRY_INDEX_URL`; correct the two inaccurate comments.
