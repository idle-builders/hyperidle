# AJ1 REDO — Architecture Critique

**Reviewer:** reviewer (Phase 2, evaluator — separate from architect). **Date:** 2026-06-15.
**Plan under review:** `plans/AJ1/architecture.md` (vitest DOM-snapshot net; rip out screenshots).
**Locked decision:** Option A per `plans/AJ1/visual-regression-options.md` — NOT relitigated. Critique is plan-quality only.

ARCHITECTURE-SCORE: 8.5/10  rounds=1  score-line: SA:9 LI:9 DC:8 RC:8 EX:8 VG:8 CH:10 D2:9 RS:9

All load-bearing claims in the plan were verified against the worktree (`feat/AJ1-tsx-redo`), not taken on trust.

---

## Verification log (what I checked against the tree)

| Plan claim | Verified | Result |
|---|---|---|
| 49 root + 7 kinds = 56 DS stories | `find … -name '*.stories.tsx'` | ✅ EXACT (49 / 7 / 56) |
| 342 golden PNGs in `__screenshots__/`; `…-snapshots/` dir absent | `find … -name '*.png' \| wc -l`, `ls` | ✅ EXACT (342); `…-snapshots/` does NOT exist ✅ |
| `discoverStories(...globSources)` variadic, `StoryModule{title,tier,uses,variants[{name,render}]}` | read `viewer/discovery.ts` | ✅ EXACT |
| viewer glob roots | read `viewer/main.tsx:26-34,296` | ⚠️ viewer globs `../src/*.stories.tsx` + 2 **web** globs — does **NOT** glob `src/kinds/` (see W-3) |
| verify chain includes `ds:sync && ds:workbench` | root `package.json:33` | ✅ EXACT |
| DS scripts `test:visual/sync-check/test:workbench/test:visual:update`; `@playwright/test` devDep | `package.json:12-17,43` | ✅ EXACT |
| `web/visual:compare` dead entry | `packages/web/package.json:13` | ✅ EXACT |
| CI lines 64-76 = Install Playwright + Visual regression + Workbench smoke | `ci.yml:64-76` | ✅ EXACT (with inline comments inside the block) |
| vitest excludes `**/visual-regression*` + `tests/**` | `vitest.config.ts` | ✅ EXACT |
| knip DS playwright entries 36-37; web block at 48-49 stays | `knip.json` | ✅ EXACT |
| guard already bans `visual:compare`; HTML patterns present | `design-source-guard.ts` | ✅ EXACT |
| skill/rule refs to delete-net language | grep `.claude/{skills,rules}` | ✅ 5 files match Task 11; design/design-critique correctly NOT in hit list |
| dangling references to deleted files | grep `packages/design-system` | ✅ all inside files being deleted — EXCEPT `W2-primitives.test.tsx:7` (KEPT file, dangling comment) → W-1 |
| React `useId` format `_r_N_` | spike-recorded; not re-run (artifact deleted) | accepted (plausible for React 19.2.x) |

---

## 9-Dimension Scores

| # | Dimension | Score | Notes |
|---|---|---|---|
| 1 | Spec fidelity / AC coverage (SA) | 9 | All 5 ACs → concrete verification. AC2 vacuous-gate guard is real. AC4 macOS/Docker-free path clean. |
| 2 | Layer / boundary integrity (LI) | 9 | Refuses cross-package glob into `@hyperidle/web`; scopes net to DS package; honest why (Vite project roots). |
| 3 | Determinism / correctness (DC) | 8 | id-normalization complete for known surface (`id/for/aria-*` share the `_r_N_` token, replaced uniformly). One residual under-treated (W-2, W-4). |
| 4 | Removal completeness (RC) | 8 | Inventory matches tree path-for-path. One KEPT-file dangling comment missed (W-1); the plan's own grep-sweep will false-positive on it. |
| 5 | Executability (EX) | 8 | Ordered, each task → AC. One UNVERIFIED import, de-risked with stated fallback. `>=56` guard depends on a framing the plan states wrongly (W-3) but the *task instruction itself* is correct. |
| 6 | Vacuous-gate resistance (VG) | 8 | `modules.length >= 56` + per-variant render+assert specified. Serializer-emits-empty-string path NOT closed in the snapshot test itself (W-2). |
| 7 | Coverage honesty (CH) | 10 | Exemplary. Blind spot (pure-paint / token re-map / font / cascade / layout) named, mapped to compensating nets. No overclaim. |
| 8 | Design-it-twice / simplicity (D2) | 9 | Two real sub-decisions with honest trade-offs. Custom-walk choice correct (churn-proof, normalization in one place). |
| 9 | Risk surfacing (RS) | 9 | Candid; flags UNVERIFIED import + churn discipline with mitigations. Missed kinds/viewer divergence (W-3). |

**Overall: 8.5 / 10.**

---

## CRITICAL findings

**None.** No H1–H4 violation. No Playwright/screenshot/PNG/Docker/external service in the new net or the resulting `verify`/`ci.yml`. The net runs inside `npm run test` → attested by `test:all`. The `>=56` enumeration guard is real and defeats the exact vacuous-green failure that sank the Playwright net (glob returns `{}` in plain Node → Playwright silently passed; vitest-on-Vite glob is non-empty and the guard asserts it). Plan clears the CRITICAL bar.

---

## WARNING findings (builder must address; none block hand-off)

**W-1 — Dangling comment in a KEPT file trips the plan's own grep-sweep.**
`packages/design-system/src/__tests__/W2-primitives.test.tsx:7` reads `"the full pixel diff is in visual-regression.test.ts / ds:sync"`. The file is KEPT (protected test) but the comment names TWO deleted things (`visual-regression.test.ts`, `ds:sync`). The plan's grep-sweep (architecture.md:154) scans `packages/design-system` expecting **zero** hits — this comment hits `ds:sync`. Builder must update that comment (point at `catalog-snapshot.test.tsx`) during Task 4/8, else the "zero hits" gate is wrong. Comment-only, no runtime break, but it falsifies the stated sweep gate. **Fold into Task 4.**

**W-2 — Snapshot test does not defend against an empty/constant serialized string.**
Vacuous-gate analysis (Risk 3 + AC2) guards enumeration (`>=56`) but NOT serializer output. If `serializeStoryDom` returns `""` or a constant for a variant (portal/comment-only tree, or a future serializer regression), `toMatchSnapshot()` snapshots the empty string and stays green forever. The AC3 `catalog.test.tsx` "≥1 child" check partially backstops this, but it's a *separate* test over the *same* set with nothing tying them together. **Add to the snapshot test:** per-variant `expect(serialized.length).toBeGreaterThan(0)` (or assert serialized text contains the rendered root's tag) BEFORE `toMatchSnapshot()`, so a broken render/serializer FAILS instead of snapshotting empty. Cheap; closes the last vacuous path. Builder adds in Task 1.

**W-3 — "net and viewer enumerate identically by construction" is factually wrong (the kinds dir).**
Plan asserts net↔viewer agree "by construction" (architecture.md:179, sub-decision (b):235). Verified: viewer (`main.tsx:296`) calls `discoverStories(dsStoryGlobs, webShellStoryGlobs, webComponentStoryGlobs)` where `dsStoryGlobs = ../src/*.stories.tsx` (49) and it **never globs `src/kinds/`**. The 7 `src/kinds/*.stories.tsx` are NOT in the viewer; they ARE in the net (Task 1 globs `../*.stories.tsx` + `../kinds/*.stories.tsx`). So the net covers MORE than the viewer (good for AC2), but "identical by construction" is false and the spike line "49 = exactly what the viewer sees" conflates root-glob with total. **Consequence is benign** — `>=56` is achievable and correct because Task 1 explicitly globs both roots — but correct the framing; builder must not assume viewer-renders ⇒ net-renders and vice-versa. Also extend Risk 2's import-resolution check to the kinds stories: confirm the 7 renderer demos render in jsdom without a live block-pipeline dependency.

**W-4 — `pool: forks` isolates *files*, not *variants within a file*; the id-counter still advances intra-file.**
Plan leans on `pool: forks` to "prevent cross-file React id-counter leakage" (architecture.md:190) — true, but the net is ONE file: 56 modules × N variants all mount in one process, so `_r_N_` advances per mount *within* the file (exactly the intra-file churn the spike flagged at architecture.md:29). The id-regex (`/_r_[0-9a-z]+_/g` → `__id__`) is what neutralizes this, NOT forks. The plan implements the regex, so the outcome is fine — but the stated mechanism is wrong and could mislead a builder into thinking forks alone suffices. Clarify: the regex is load-bearing for determinism; forks only buys file-level React-scheduler isolation. **Verify the regex runs on EVERY serialized variant — no early-return/short-circuit path can skip it.**

---

## NICE findings (optional)

- **N-1** — `ds:bless` (architecture.md:222) hardcodes the file path; a future rename silently no-ops (vitest finds no match → updates nothing → green). Prefer a name filter (`vitest run -u --project design-system catalog-snapshot`). Plan already marks the script droppable.
- **N-2** — Lock the serializer's attribute emission ORDER (plan says "sorted-attrs" in one place, "class verbatim, do not sort" in another). Fix a key order (tag, class, style, data-ds-*, role, aria-*, type, for, id); keep class *token* order verbatim (correct). Pin the walk's attribute iteration explicitly (jsdom is insertion-order/stable, but pin to be cross-engine safe).
- **N-3** — Deleting `tests/` "if empty": confirmed only `workbench.spec.ts` lives there — safe to remove unconditionally after Task 5.

---

## Hard-constraint audit (H1–H4) — the reason the last plan died

| H | Constraint | Verdict |
|---|---|---|
| H1 | No Playwright/screenshot/PNG/pixel-diff/Docker | ✅ Net is pure vitest+jsdom; all Playwright machinery removed from DS, CI, scripts, knip. `@playwright/test` correctly retained in `packages/web` (e2e still needs it). |
| H2 | `verify` on macOS, zero Docker / external services | ✅ Post-edit chain = check/lint/knip/guards/build/attest; net in `test:all`; no browser, no port 8098, no golden PNG → no macOS-vs-Linux AA problem. The precise #287 failure is structurally eliminated. |
| H3 | Efficient, in vitest, deterministic, cross-platform, git-text-diffable | ✅ jsdom render sub-ms/variant; `.snap` text committed; determinism via id-regex (modulo W-2/W-4 hardening). |
| H4 | Text-based | ✅ serialized DOM text by construction. |

---

## Verdict

**APPROVED — overall 8.5/10, no unresolved CRITICAL.**

The plan correctly inverts to the LOCKED Option A; the removal inventory is path-accurate against the tree; the constraints that killed #287 are structurally eliminated; coverage honesty is exemplary; the vacuous-gate enumeration guard is real. The four WARNINGs are hardening/accuracy fixes, not redesigns — W-1 (fix dangling comment) and W-2 (non-empty serialized assertion) fold into existing Tasks 4 and 1; W-3/W-4 are framing corrections whose only code consequence is confirming the id-regex runs on every variant. Hand off to the builder with the four WARNINGs as required acceptance items.
