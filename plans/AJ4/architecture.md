# AJ4 — Design-change evidence in the PR + ship summary — Architecture

**Workpackage:** AJ4 (Track AJ). Complexity M. Depends on: AJ1 (`.snap` net), AJ2 (ship summary). Sibling: AJ3.
**Phase:** designer production. **No `/design`** (no component, no redesign — see `concept.md` § `/design` skip).
**Relocked premise:** screenshots are **local-only, ship-time, not golden, not committed, not a CI gate**; the changed-set comes from the **DOM-snapshot net** (`catalog-snapshot.test.tsx`), not from any image baseline. See `concept.md`.

---

## One line

At ship time (local), diff the branch's committed `.snap` against `origin/main`'s to get the changed design-system story set; if non-empty, render each changed story `before` (origin/main) and `after` (branch) with Playwright against the live viewer, upload the PNGs as a GitHub release/gist asset, and embed before/after images + openable story links into the PR body (always) and the AJ2 interactive ship summary's design section (when it runs). Empty set → emit nothing.

---

## Why the `.snap` file is the changed-set source (not a re-run, not a re-detector)

The net's committed baseline `packages/design-system/src/__tests__/__snapshots__/catalog-snapshot.test.tsx.snap` **is** the serialized DOM+class+style of every catalogued story variant, keyed `` `<module.title> > <variant> N` ``. A design change is, by construction, a change to one or more of those snapshot blocks (AJ1 § coverage statement: class/style/markup/marker deltas all land in the `.snap`). So:

> **changed-set = keys whose snapshot body differs between branch `.snap` and `origin/main:…/.snap`.**

This reuses the net's own enumeration + serializer transitively (the `.snap` is their committed output) without importing or re-running them. It is **deterministic, offline, fast** (text diff of one file), and **cannot drift** from the gate — the gate writes the file the detector reads. No parallel `discoverStories()` call is needed for *detection*; `discoverStories()` is reused only at *capture* time to resolve a module title → its viewer route + variant render (below).

**Scope boundary (inherited from AJ1, stated honestly):** the `.snap` covers `packages/design-system` stories only (56 modules; web-shell/web-page stories are out of the net and therefore out of AJ4). A restyle confined to a `packages/web` shell component produces no `.snap` delta → AJ4 emits nothing for it. This is the AJ1 trade carried forward, not a new gap. Documented in the coverage note + ship output ("design-system surfaces only").

---

## Components & file paths

All new logic lives in **`packages/design-system`** (it owns the net, the viewer, and `discoverStories`) plus a thin `/ship` wiring. Naming avoids every AC1-guarded banned string (`golden`, `__screenshots__`, `toHaveScreenshot`).

```
packages/design-system/
  scripts/
    design-evidence/
      changed-stories.ts        # pure: parse two .snap texts → ChangedStory[]
      capture-evidence.ts       # orchestrator: changed-set → render before/after → upload → emit PR markdown
      render-story.ts           # drive ds:serve + npx playwright screenshot one story → PNG path
      upload-assets.ts          # gh-based PNG hosting → public image URLs
      story-url.ts              # module.title → viewer hash route + (optional) capture route
      evidence-report.ts        # ChangedStory[] + asset URLs → PR markdown block + summary-section data
  src/
    scripts-tests/              # vitest unit tests for the pure pieces (changed-stories, story-url, evidence-report)
```

Root `package.json` adds one script:
```jsonc
"ds:evidence": "tsx packages/design-system/scripts/design-evidence/capture-evidence.ts"
```
(`tsx` is already a repo dependency; `ds:serve` and the web Playwright CLI already exist.)

`/ship` integration: a new **step 6a** in `.claude/skills/ship/SKILL.md` (between PR-create/ready and CI-poll) calls `npm run ds:evidence -- --pr <n>`; and a **design-section clause** in step 7a (the interactive ship-summary check). Both are described below.

---

## Types / interfaces

```ts
// changed-stories.ts
export interface ChangedStory {
  /** Module title = viewer route key, e.g. "AG6/RowDot". */
  title: string;
  /** Variant names that changed within the module, e.g. ["Success", "ErrorTone"]. */
  variants: string[];
}

/** Pure. Parse two .snap texts, return modules with ≥1 changed/added/removed variant. */
export function changedStories(branchSnap: string, baseSnap: string): ChangedStory[];

// story-url.ts
/** Viewer route to OPEN the story for inspection (hash-based, AJ1 viewer). */
export function storyViewerUrl(title: string, base = "http://localhost:8098"): string;
//   → `${base}/#${encodeURIComponent(title)}`

// render-story.ts
export interface RenderTarget { title: string; variant: string; }
export interface RenderedShot { target: RenderTarget; pngPath: string; }
/** Local-only. Screenshot one story-variant from an already-running viewer origin. */
export async function renderStory(viewerOrigin: string, t: RenderTarget, outDir: string): Promise<RenderedShot>;

// upload-assets.ts
export interface HostedShot { target: RenderTarget; side: "before" | "after"; url: string; }
/** Upload local PNGs via gh; return public image URLs that render in a PR. */
export async function uploadShots(prNumber: number, shots: { side: "before"|"after"; shot: RenderedShot }[]): Promise<HostedShot[]>;

// evidence-report.ts
export interface EvidenceReport {
  /** Markdown for the PR body/comment design section (empty string ⇒ no section). */
  prMarkdown: string;
  /** Structured data the AJ2 ship summary's design section renders. */
  summarySection: { title: string; variants: string[]; storyUrl: string;
                    shots: { variant: string; before?: string; after?: string }[] }[];
}
export function buildEvidenceReport(changed: ChangedStory[], hosted: HostedShot[]): EvidenceReport;
```

---

## How `changedStories()` parses the `.snap` (the detection algorithm)

The `.snap` is a JS module of `` exports[`<key>`] = `…multiline…`; `` blocks (Vitest Snapshot v1). Parse without `eval`:

1. Regex-split on the block delimiter `` /^exports\[`(.+?)`\] = `$/m `` … to the closing `` /^`;$/m ``, capturing key + body. (Keys are unique; bodies are the serialized DOM text. The trailing ` N` in the key is the per-`toMatchSnapshot` index — keep it as part of the key.)
2. Build `Map<key, body>` for branch and base.
3. A key is **changed** if: present in both with different body, **added** (branch-only), or **removed** (base-only). All three are "design changed" (a removed/added variant is a rendered-surface change worth showing — added shows after-only, removed shows before-only).
4. Map each changed key `` `<title> > <variant> N` `` → `{ title, variant }` by splitting on the literal ` > ` and stripping the trailing ` \d+` index. Group by `title` → `ChangedStory[]`.

**Where the base `.snap` text comes from (no checkout needed for detection):**
```bash
git show origin/main:packages/design-system/src/__tests__/__snapshots__/catalog-snapshot.test.tsx.snap
```
If the file does not exist on `origin/main` (first introduction) → treat **all** branch keys as added → every story is "changed" (correct: the net is brand-new). `capture-evidence.ts` passes both texts to the pure `changedStories()`.

**Edge — the `.snap` was re-blessed but nothing visually changed** (e.g. only an id-normalization tweak): the serializer already normalizes ids/timestamps (AJ1), so a body delta is a real DOM/class/style delta. Accepted as the design-change signal — same fidelity the gate itself uses.

---

## Capture: rendering before vs after (local only)

`capture-evidence.ts` orchestration (all local, all at ship time, never CI):

1. **Detect.** Compute `changed = changedStories(branchSnap, baseSnap)`. **If empty → exit 0, emit nothing** (the no-design-change path; see below).
2. **After shots (branch).** The working tree already *is* the branch. Start the viewer (`npm run ds:serve`, port 8098) as a background child, wait for `http://localhost:8098` to answer, then for each changed `{title, variant}` call `renderStory("http://localhost:8098", …, outDir/after)`.
3. **Before shots (origin/main).** Render the *origin/main* version of the **same** stories. Two candidate mechanics — **PICK B**:
   - **(A) git stash / checkout origin/main in place** — mutates the working tree mid-ship; fragile with the in-flight attestation/commit state. **Reject.**
   - **(B) ephemeral detached worktree** — `git worktree add --detach .worktrees/_aj4-evidence-base origin/main`, run `npm run ds:serve` from *that* worktree on a **different port** (e.g. 8099, via `--port`), screenshot the before shots from `http://localhost:8099`, then `git worktree remove --force`. No mutation of the ship worktree; isolated; matches the repo's worktree discipline. **PICK B.** A story that does not exist on origin/main (added) → no before shot (after-only panel). A story removed on the branch → no after shot (before-only panel); render it from the base worktree only.
4. **Render mechanic (`render-story.ts`).** Drive the running viewer with the existing web Playwright CLI:
   ```bash
   npx --prefix packages/web playwright screenshot \
     --browser=chromium \
     --wait-for-timeout=400 \
     "http://localhost:8099/#<encodeURIComponent(title)>" \
     "<outDir>/before/<safeTitle>__<variant>.png"
   ```
   ⚠️ UNVERIFIED — the viewer route renders **all** variants of a module on one page (the `.snap` keys variants per module, but the viewer's component page shows the module's variant stack). Two options:
   - **(B1) Per-module shot:** screenshot the whole module page once; the before/after panel shows the module (all its variants) — coarser but zero viewer change. Variant-level keys still drive *detection*; the *image* is per-module. **Default — no viewer change, simplest, honest.**
   - **(B2) Per-variant capture route:** add an optional viewer query param `?variant=<name>` that mounts a single variant (small `viewer/main.tsx` change) so each PNG is one variant. Higher fidelity, but touches the viewer. **Deferred** unless per-module images prove too noisy in review. Record as a follow-up.
   PICK **B1** for AJ4 (per-module image, variant-level detection). Document the coarsening.
5. **Upload + emit** (below). **Always** stop both viewers and remove the base worktree in a `finally` (no orphan servers/worktrees on failure).

**Failure stance:** capture is **best-effort, non-blocking**. If the viewer fails to boot, Playwright errors, or `gh` upload fails, `capture-evidence.ts` logs a warning, writes a degraded PR note ("design changed in N surfaces; screenshot capture failed — open the stories locally: <links>"), and **exits 0**. Evidence is an artifact, never a gate — a capture failure must not red a green ship (AC4: it is a ship artifact, not a touchpoint; concept § authority: AJ4 never blocks).

---

## Hosting: how PNGs reach a GitHub PR without being committed

Requirement: image renders inline in the PR, no PNG in the repo, no CI. Three `gh` mechanics evaluated:

| Mechanic | How | Renders in PR? | Cost / risk | Verdict |
|---|---|---|---|---|
| **Commit to branch** | add PNG, push, `![](…raw.githubusercontent…)` | yes | pollutes the diff with binaries; AC says "not committed" | **Reject** |
| **Hidden draft release asset** | `gh release create _aj4-evidence-<sha> --draft` then `gh release upload`; asset URL is `https://github.com/<owner>/<repo>/releases/download/…png` | ⚠️ draft-release asset URLs require auth → **do not render** for unauthenticated `<img>` in PR | extra release object to garbage-collect | **Reject** (auth-gated URL) |
| **Issue/PR-comment attachment via the GitHub user-assets CDN** | upload PNG through the GitHub web upload endpoint → returns a `https://github.com/user-attachments/assets/<uuid>` URL that renders for anyone who can see the repo | yes, renders inline; the canonical mechanism for PR/issue images | upload endpoint is the same one the web UI uses; reachable via `gh api` multipart | **PICK** |

**Chosen mechanic — GitHub user-attachments via `gh api`:**
```bash
# Upload one PNG → returns the rendered-in-PR asset URL.
gh api --method POST \
  -H "Content-Type: image/png" \
  --input <local.png> \
  "https://uploads.github.com/repos/<owner>/<repo>/...assets..." \
  --jq '.url'
```
⚠️ UNVERIFIED — the exact user-attachments upload endpoint is not part of the documented stable REST surface; the builder must verify the current `gh`-reachable path in the **red/spike phase** before relying on it. **Documented fallback if the user-attachments endpoint is not `gh`-reachable:** upload PNGs to a dedicated **orphan `pr-evidence` branch** (not `main`, never merged) via `gh api .../contents/…` (base64 PUT), then embed `https://raw.githubusercontent.com/<owner>/<repo>/pr-evidence/<sha>/<file>.png` — renders inline, keeps PNGs entirely out of `main`'s history and the PR diff, and is fully `gh`/`git`-scriptable. The orphan-branch fallback is the **guaranteed-workable** path; user-attachments is the cleaner path if verified. `upload-assets.ts` encapsulates the choice behind `uploadShots()` so the embed code (`evidence-report.ts`) is agnostic.

**GC:** orphan-branch assets accumulate; a periodic prune (or per-PR subfolder deleted on merge) is a follow-up note, not AJ4 scope (assets are tiny PNGs; no correctness impact).

---

## PR embedding + ship-summary integration

### PR body (always — both modes)

`evidence-report.ts` produces a fenced markdown block delimited by HTML-comment markers so re-ship is **idempotent** (replace, not append):

```md
<!-- aj4-design-evidence:start -->
## Design changes (design-system surfaces)
N component(s) changed appearance. Open locally with `npm run ds:serve`.

### AG6/RowDot — [open story](http://localhost:8098/#AG6%2FRowDot)  ·  variants: Success, ErrorTone
| before (main) | after (this PR) |
|---|---|
| ![before](<url>) | ![after](<url>) |
<!-- aj4-design-evidence:end -->
```

`capture-evidence.ts --pr <n>`:
1. `gh pr view <n> --json body -q .body` → current body.
2. Strip any existing `aj4-design-evidence` block (idempotent re-ship).
3. If `changed` empty → write back the stripped body (**removes** any stale design section → AC3) and stop.
4. Else append the new block → `gh pr edit <n> --body-file -`.

Using the **PR body** (not a comment) keeps a single canonical evidence block and makes idempotency trivial; an updated push that no longer changes design auto-strips the section.

### `/ship` step 6a (new, both modes)

In `.claude/skills/ship/SKILL.md`, after step 6 (PR create/ready) and before step 7 (CI poll):
> **6a. Design-change evidence (always — both modes).** Run `npm run ds:evidence -- --pr "$PR_NUMBER"`. It diffs the committed `.snap` against `origin/main`, and — only if a design-system surface changed appearance — captures before/after renders locally and embeds them (with openable story links) into the PR body. No design change → it strips any prior design section and emits nothing. This is a **ship artifact, not a gate**: a capture failure logs a warning and does not block the ship. Runs identically in autonomous and interactive runs.

### `/ship` step 7a design clause (interactive ship summary — AJ2)

Step 7a already emits the interactive ship summary. Add a **sixth, conditional beat**:
> **Design section (only when `ds:evidence` reported a non-empty changed-set):** list each changed surface with its openable story URL and its before/after images. Source this from the `EvidenceReport.summarySection` that `ds:evidence` wrote to `plans/<id>/design-evidence.json` (a transient run artifact, not committed). If the changed-set was empty, the ship summary has **no** design section (AC3). This beat is content, not a new gate — the no-fabricate rule applies: no evidence file ⇒ omit the section entirely (never invent surfaces).

`ds:evidence` writes its `EvidenceReport` to `plans/<id>/design-evidence.json` so step 7a (a separate process) can read it without recomputing. Empty changed-set → no file → no section.

---

## The "no design change → no output" path (AC3) — explicit

Single source of truth: `changedStories()` returns `[]`. Then `capture-evidence.ts`:
- renders nothing, uploads nothing,
- **strips** any pre-existing `aj4-design-evidence` block from the PR body (so a later push that backs out a restyle removes the stale section),
- writes **no** `design-evidence.json`,
- exits 0.
Step 7a sees no file → no design beat. Net: a backend-only WP ships with zero screenshots and zero design section in PR and summary. This is the same boolean (`changed.length > 0`) gating every emission site — no second code path to drift.

---

## Acceptance criteria → verification

| AC | Method | Type |
|---|---|---|
| **AC1** Design change ⇒ PR carries before/after of each changed component, sourced from the regression diff (not a manual capture) | **Unit test** (`changed-stories.test.ts`): feed two synthetic `.snap` strings (one with a changed body, one added, one removed); assert `changedStories()` returns exactly the changed `{title, variants}`. **Unit test** (`evidence-report.test.ts`): given `ChangedStory[]` + `HostedShot[]`, assert `buildEvidenceReport().prMarkdown` contains a before+after `![](url)` per changed module and the `aj4-design-evidence` markers. The "sourced from the regression diff not a manual capture" property is *structural* — `changedStories` takes the `.snap` text as its only input → enforced by the function signature + a **lint/knip check** that `capture-evidence.ts` reads the `.snap` via `git show` and never a hand-authored image list. | runtime test + structural |
| **AC2** Ship summary, when the change includes a design change, lists openable stories + screenshots for changed surfaces | **Unit test** (`story-url.test.ts`): `storyViewerUrl("AG6/RowDot")` === `http://localhost:8098/#AG6%2FRowDot`. **Unit test** (`evidence-report.test.ts`): `summarySection` has one entry per changed module, each with a non-empty `storyUrl` and a `shots` array. The *prose wiring* into step 7a is a SKILL.md change (process) — verified by **manual read** in `/review` + the founder walkthrough (TRACK-AJ proof bar). | runtime test (data) + manual (prose) |
| **AC3** No rendered-design impact ⇒ no screenshots, no design section in ship/PR | **Unit test** (`changed-stories.test.ts`): identical `.snap` texts ⇒ `changedStories()` === `[]`. **Unit test** (`evidence-report.test.ts`): `buildEvidenceReport([], [])` ⇒ `prMarkdown === ""` and `summarySection === []`. The PR-body-strip behavior on empty set is **integration-ish** (touches `gh`) — verified by the founder walkthrough on a backend-only WP (TRACK-AJ proof: "backend-only WP ships → PR carries no screenshots, summary has no design section"). | runtime test + manual |
| **AC4** Produced automatically, present regardless of run mode (interactive/autonomous); a ship artifact not a touchpoint | **Structural:** step 6a in `/ship` is unconditional (no `PIPELINE_INTERACTIVE` guard) — verified by **manual read** that 6a has no mode check (contrast step 7a which is interactive-only). **Unit test** (capture is non-blocking): `capture-evidence` returns/exits 0 on a simulated upload failure (inject a failing `uploadShots`), proving it never throws into the ship gate. The "both modes" property is proven by the **autonomous-parity check** in the TRACK-AJ proof bar (autonomous run still embeds evidence). | structural + runtime test + manual |

**Why these are tests, not file-greps:** `changedStories`, `storyViewerUrl`, `buildEvidenceReport` are **pure functions** — a test imports them and asserts on return values (`import { changedStories } from "../scripts/design-evidence/changed-stories.js"`). The Playwright capture, `gh` upload, and SKILL.md prose are **not** unit-testable as pure logic — they are verified by the founder walkthrough + autonomous-parity check the TRACK-AJ proof bar already mandates for AJ-track process WPs, plus a non-blocking-on-failure unit test for the orchestrator's error stance.

---

## Ordered task list (builder)

1. **(AC1/AC3 red) Unit-test the detector.** `src/scripts-tests/changed-stories.test.ts`: synthetic `.snap` pairs covering changed / added / removed / identical → expected `ChangedStory[]` (incl. `[]`). RED.
2. **(AC2 red) Unit-test the URL + report.** `story-url.test.ts` (hash route, URL-encoded title incl. the `/`); `evidence-report.test.ts` (markers, before+after image per module, empty-input ⇒ empty output, `summarySection` shape). RED.
3. **(green) Implement pure pieces.** `changed-stories.ts` (`.snap` block parser + diff), `story-url.ts`, `evidence-report.ts`. Make 1–2 green.
4. **Spike the hosting mechanic.** Verify whether the GitHub **user-attachments** upload endpoint is `gh api`-reachable; if not, implement the **orphan `pr-evidence` branch** fallback. Lock `upload-assets.ts` to the working path. (Live local check against a scratch PR — not CI.)
5. **(green) Implement capture orchestration.** `render-story.ts` (drive a running viewer via `npx playwright screenshot`), `capture-evidence.ts` (detect → base worktree on 8099 + branch viewer on 8098 → per-module before/after → upload → embed in PR body → write `design-evidence.json`; `finally` tears down viewers + base worktree; best-effort/non-blocking, exits 0 on capture failure). Add root `ds:evidence` script.
6. **(AC4) Non-blocking unit test.** `capture-evidence.test.ts`: inject a throwing `uploadShots`; assert the orchestrator resolves (does not reject) and produces the degraded PR note. (Pure-ish: factor the orchestration so the `gh`/Playwright I/O is injectable.)
7. **(AC1/AC4) Wire `/ship` step 6a.** Edit `.claude/skills/ship/SKILL.md`: add unconditional step 6a calling `ds:evidence`; explicitly "both modes, ship artifact not gate, failure non-blocking."
8. **(AC2/AC3) Wire `/ship` step 7a design beat.** Edit step 7a: add the conditional design section sourced from `design-evidence.json`; no file ⇒ no section.
9. **(AC3) Idempotency + strip.** Confirm re-running `ds:evidence` replaces (not duplicates) the `aj4-design-evidence` block, and an empty changed-set strips it. (Covered by the body-marker logic; live-check on the scratch PR.)
10. **Proof.** Local walkthrough: (a) restyle one DS component + re-bless `.snap` → ship → PR shows before/after + story link, interactive summary shows the design section; (b) backend-only change → ship → no screenshots, no design section; (c) autonomous run (no `PIPELINE_INTERACTIVE`) → PR still carries evidence. Plus `npm run verify` green (the new unit tests run in `test`; nothing touches CI).
11. **(AC1 structural) knip/lint guard.** Ensure `capture-evidence.ts` is reachable (not dead-code), and that no committed PNG / banned string (`golden`, `__screenshots__`, `toHaveScreenshot`) is introduced — `design-source-guard.ts` already bans those; confirm the new code passes it.

---

## Risks / open items

1. **User-attachments endpoint (⚠️ UNVERIFIED).** The clean `gh`-reachable image host is not on the stable REST surface. **Mitigation:** the orphan `pr-evidence` branch fallback is guaranteed-workable and fully scripted; AJ4 ships on the fallback if the spike fails. Either way no PNG enters `main` and no CI runs.
2. **Per-module vs per-variant image (B1 vs B2).** AJ4 ships per-module images (no viewer change) with variant-level detection. If review finds module images too coarse, B2 (a `?variant=` viewer route) is a scoped follow-up.
3. **Base render needs origin/main worktree.** The ephemeral detached worktree on port 8099 is the isolation mechanism; it must be torn down in `finally`. A leaked worktree/server is the main operational footgun — covered by the teardown + the autonomous-parity check.
4. **Scope = design-system stories only.** Web-shell/web-page restyles produce no `.snap` delta → no evidence (inherited AJ1 boundary). Stated in the PR section header ("design-system surfaces") so the absence is legible, not silent. A web-package snapshot net + its evidence is a separate future WP, flagged.
5. **Capture cost at ship time.** Booting two viewers + N Playwright shots adds local ship latency (seconds per shot, only when design changed). Bounded by the changed-set size; backend WPs pay nothing (early exit). Acceptable for a local-only artifact.
6. **Non-blocking discipline.** The single most important invariant: a capture/upload failure **must not** fail the ship (AC4 — artifact, not gate). Enforced by the exits-0 orchestrator + its unit test (task 6).

## Doc cross-check
No `docs/` canonical-shape contradiction — AJ4 is tooling/skill process (`.claude/skills/ship/`, `packages/design-system/scripts/`). No new primitive (concept § "no BLOCKER"). The `.claude/rules/visual-regression.md` rule stays the gate's doc; AJ4 adds an *evidence/reporting* layer that reads the gate's output — note this distinction in `visual-regression.md` at `/write-docs` time so a future agent does not mistake AJ4 screenshots for the gate.
