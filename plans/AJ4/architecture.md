# AJ4 — Design-change evidence in the PR + ship summary — Architecture

**Workpackage:** AJ4 (Track AJ). Complexity M. Depends on: AJ1 (`.snap` net), AJ2 (ship summary). Sibling: AJ3.
**Phase:** designer production. **No `/design`** (no component, no redesign — see `concept.md` § `/design` skip).
**Relocked premise:** screenshots are **local-only, ship-time, not golden, not committed, not a CI gate**; the changed-set comes from the **DOM-snapshot net** (`catalog-snapshot.test.tsx`), not from any image baseline. See `concept.md`.

---

## One line

At ship time (local), diff the branch's committed `.snap` against `origin/main`'s to get the changed design-system story set; if non-empty, render each changed story `before` (origin/main) and `after` (branch) with Playwright against the live viewer, **commit the PNGs to an orphan `pr-evidence/<id>` branch** (never `main`, never the PR diff), and embed openable evidence links + (where supported) before/after images + the live-viewer story link into the PR body (always) and the AJ2 interactive ship summary's design section (when it runs). Empty set → emit nothing.

> **Private-repo finding (decisive — verified 2026-06-15):** `ambrovia/hyperidle` is a **PRIVATE** repo (`gh repo view ambrovia/hyperidle --json visibility` → `PRIVATE`). For a private repo there is **no `gh`-token-reachable URL that inline-renders an image in a PR**: `raw.githubusercontent.com` / `blob?raw=true` are JWT-gated and camo (GitHub's image proxy) only proxies *public* URLs, so they do **not** render inline; the only inline-rendering host is `github.com/user-attachments/assets/<uuid>`, whose **upload requires a browser session cookie**, not a token — unusable in an autonomous ship. Therefore the primary mechanic is built to **not depend on inline image rendering**: PNGs land on an orphan `pr-evidence/<id>` branch and the PR carries **openable evidence links** (the GitHub blob-viewer page renders the PNG to any authenticated repo viewer). Inline `<img>` embedding is a **spike-only upgrade** (task 4), never a dependency.

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
      upload-assets.ts          # orphan pr-evidence/<id> branch via gh api → openable blob-viewer URLs (private-safe)
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
export interface HostedShot {
  target: RenderTarget;
  side: "before" | "after";
  url: string;            // PRIMARY: blob-viewer page URL (openable, private-safe). SPIKE: user-attachments inline URL.
  render: "link" | "inline"; // how evidence-report should embed it; default "link" (private-repo guaranteed path).
}
/** Upload local PNGs to the orphan pr-evidence/<id> branch via gh; return openable evidence URLs. */
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

1. **Parse by anchored line delimiters, NOT a single non-greedy block regex.** Vitest's snapshot serializer escapes `` ` ``→`` \` `` and `$`→`\$` inside template-literal bodies, and serialized DOM text can legitimately contain `` ` `` / `${` (e.g. a code-block story or a template-literal class string). A naive `` /exports\[`(.+?)`\] = `…`/m `` non-greedy match would terminate a body early at an escaped backtick → wrong changed-set. Instead, **walk the file line by line:**
   - An **opener** line matches `` /^exports\[`(.+)`\] = `$/ `` → capture the key (group 1), enter body-accumulation mode.
   - Accumulate every subsequent raw line into the body until a **closer** line matches `` /^`;$/ `` (a lone backtick-semicolon at column 0) → that line ends the body (do not include it).
   - Vitest always emits the opener `` …] = ` `` and the closer `` `; `` on their own lines (the body is indented; the closer is column-0), so column-anchored line matching is unambiguous regardless of backticks/`${` *inside* the body. Keys are unique; the trailing ` N` index stays part of the key.
   - Keep body text **verbatim** (including the `` \` `` / `\$` escapes) — equality comparison is over the literal stored text, so escapes on both sides cancel; we never unescape.
2. Build `Map<key, body>` for branch and base.

> **Parser test fixture (proves the escape handling):** `changed-stories.test.ts` must include a fixture whose body contains an **escaped backtick** (`` \` ``) and a `\${` sequence, on a branch-vs-base pair where that block is otherwise identical → asserts the parser keeps the block whole (not split at the escaped backtick) and reports it as **unchanged**; plus a variant where one char *inside* the escaped-backtick body differs → reported as **changed**. This is the regression guard against the non-greedy-regex failure mode.
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
   **Image-count cap (bound ship latency — no silent truncation).** Two viewer boots + N×2 Playwright shots is bounded by changed-module count; a wide change (e.g. a token re-map touching dozens of modules) could add minutes. Cap the **imaged** modules at `EVIDENCE_MODULE_CAP = 12` (a const, not magic): the first 12 changed modules get before/after shots; the **remainder are link-only** (story-viewer link + blob-viewer evidence link, no PNG render). When the cap engages, `capture-evidence.ts` **LOGs** it (`"design evidence: 27 modules changed; imaged first 12, remaining 15 link-only — see story links"`) and `evidence-report.ts` renders an explicit "+15 more changed modules (link-only): …" line in the PR block. **Never silently drop a changed module** — every changed module appears in the output, imaged or linked. Detection is uncapped (the full changed-set always drives the boolean and the link list); only the *image render* is capped.
2. **After shots (branch).** The working tree already *is* the branch. Probe a free port `Pb` (do NOT assume 8098 — a dev viewer may hold it), start the viewer (`npm run ds:serve --port <Pb>`) as a background child, wait for `http://localhost:<Pb>` to answer, then for each changed `{title, variant}` call `renderStory("http://localhost:<Pb>", …, outDir/after)`.
3. **Before shots (origin/main).** Render the *origin/main* version of the **same** stories. Two candidate mechanics — **PICK B**:
   - **(A) git stash / checkout origin/main in place** — mutates the working tree mid-ship; fragile with the in-flight attestation/commit state. **Reject.**
   - **(B) ephemeral detached worktree** — isolated, matches the repo's worktree discipline. **PICK B.** A story that does not exist on origin/main (added) → no before shot (after-only panel). A story removed on the branch → no after shot (before-only panel); render it from the base worktree only.

   **Crash-recovery + dynamic port (idempotent setup — a prior ship may have crashed mid-capture):**
   1. **Force-remove any stale base worktree:** `git worktree remove --force .worktrees/_aj4-evidence-base 2>/dev/null; git worktree prune` (both ignore-error — recovers from a crashed prior ship that left the worktree registered). Then `rm -rf .worktrees/_aj4-evidence-base` (in case the dir survived an unregistered prune).
   2. **Add fresh:** `git worktree add --detach .worktrees/_aj4-evidence-base origin/main`.
   3. **Probe a free port — do NOT hardcode 8099.** A developer's already-running viewer (or a crashed prior run) may hold 8098/8099. Open an ephemeral listen socket on port 0, read the OS-assigned port, close it, pass that to `ds:serve --port <p>`. Use the same free-port probe for **both** the branch viewer (don't assume 8098 is free either) and the base viewer. Pass each chosen origin into `renderStory(viewerOrigin, …)` (already parameterized — no hardcoded port in the render call).
   4. Screenshot the before shots from the base viewer origin.
   5. Teardown (below) force-removes the worktree again in `finally`, so the setup and teardown are both idempotent.
4. **Render mechanic (`render-story.ts`).** Drive the running viewer with the existing web Playwright CLI:
   ```bash
   npx --prefix packages/web playwright screenshot \
     --browser=chromium \
     --wait-for-timeout=400 \
     "http://localhost:<probed-port>/#<encodeURIComponent(title)>" \
     "<outDir>/before/<safeTitle>__<variant>.png"
   ```
   ⚠️ UNVERIFIED — the viewer route renders **all** variants of a module on one page (the `.snap` keys variants per module, but the viewer's component page shows the module's variant stack). Two options:
   - **(B1) Per-module shot:** screenshot the whole module page once; the before/after panel shows the module (all its variants) — coarser but zero viewer change. Variant-level keys still drive *detection*; the *image* is per-module. **Default — no viewer change, simplest, honest.**
   - **(B2) Per-variant capture route:** add an optional viewer query param `?variant=<name>` that mounts a single variant (small `viewer/main.tsx` change) so each PNG is one variant. Higher fidelity, but touches the viewer. **Deferred** unless per-module images prove too noisy in review. Record as a follow-up.
   PICK **B1** for AJ4 (per-module image, variant-level detection). Document the coarsening.
5. **Upload + emit** (below). **Always** stop both viewers and remove the base worktree in a `finally` (no orphan servers/worktrees on failure).

**Failure stance:** capture is **best-effort, non-blocking** at **every** I/O seam. The orchestrator wraps each fallible stage and degrades rather than throws. There are **three distinct failure sources**, each independently degradable:

| Failure source | Stage | Degrade behavior (always exit 0) |
|---|---|---|
| **Viewer boot / `renderStory`** (Playwright launch, viewer not answering, screenshot CLI error) | capture | Skip imaging; emit the **link-only** block ("design changed in N surfaces; screenshot capture unavailable — open the stories locally: `npm run ds:serve` → \<story links\>") + the blob-viewer evidence links. Degraded note recorded in `EvidenceReport`. |
| **`uploadShots`** (orphan-branch push / `gh` failure) | host | Keep the rendered PNGs referenced by **local path note** + story-viewer links; emit a degraded note ("captured N renders; could not publish to the evidence branch — \<story links\>"). |
| **`git worktree add` (base)** | before-shots setup | Skip *before* shots only; emit **after-only** panels for the imaged modules + a degraded note ("origin/main render unavailable; showing after only"). |

In **all three** cases the orchestrator logs a warning, writes a degraded PR note, and **exits 0**. Evidence is an artifact, never a gate — a capture failure must not red a green ship (AC4: ship artifact, not touchpoint; concept § authority: AJ4 never blocks). The non-blocking unit test (task 6) injects a thrown error at **both `renderStory` and `uploadShots`** (and asserts the worktree-add path), asserting exit-0 + a degraded note for **each** source — not just `uploadShots`.

---

## Hosting: how PNGs reach a private-repo PR without being committed to `main`

Requirement: a repo viewer can open the before/after evidence from the PR, no PNG in `main`'s history or the PR diff, no CI, **and it must work for a PRIVATE repo from a `gh` token only** (autonomous ship — no browser, no session cookie).

**The private-repo constraint, verified (2026-06-15):**
- `gh repo view ambrovia/hyperidle --json visibility` → **PRIVATE**.
- For a private repo, **no `gh`-token-reachable URL inline-renders an image in PR markdown.** `raw.githubusercontent.com` and `github.com/.../blob/<branch>/<file>?raw=true` are short-lived-JWT-gated; GitHub's image proxy **camo** only proxies *public* URLs, so a private raw URL is **not** rendered inline (same auth gate that killed the draft-release option). The single inline-rendering host is `github.com/user-attachments/assets/<uuid>` — but its **upload requires a browser session cookie** (the `gh-image` ext and `lisonge/user-attachments` both scrape the cookie); there is **no documented `gh`-token REST upload path**. So inline rendering is **not achievable from a token alone** for this repo.

**Conclusion:** the primary mechanic must **not depend on inline image rendering.** It provides **openable evidence links** (the GitHub blob-viewer *page* renders the PNG to any authenticated repo viewer — cookie-auth, works for private, one click from the PR). Inline `<img>` is a spike-only upgrade.

| Mechanic | How | Private-repo behavior | Verdict |
|---|---|---|---|
| **Commit to the PR branch** | add PNG, push | pollutes the PR diff with binaries; AC says "not committed" | **Reject** |
| **Draft release asset** | `gh release create --draft` + upload | asset URL auth-gated → no inline render; extra release object | **Reject** |
| **`raw.githubusercontent.com` on any branch** | base64 PUT to a branch, embed raw URL | JWT-gated, camo won't proxy private → **does not render inline** | **Reject for inline; the *link* still works** |
| **user-attachments `assets/<uuid>`** | web upload endpoint → inline-rendering URL | renders inline, but **upload needs a session cookie**, not a token | **Spike-only** (task 4); never a dependency |
| **Orphan `pr-evidence/<id>` branch + blob-viewer link** ← **PRIMARY** | base64 PUT each PNG to an orphan branch via `gh api .../contents`; link the blob-viewer page | PNGs out of `main` + out of the PR diff; the blob page renders the PNG to any authenticated repo viewer (works for private) | **PICK — guaranteed-workable from a token** |

### PRIMARY (default, guaranteed-workable): orphan `pr-evidence/<id>` branch + openable blob-viewer links

No local checkout of the orphan branch — create and write it entirely via `gh api` so the ship worktree is never touched:

```bash
# 1. Ensure the orphan branch exists. Create it from an empty tree if absent (no parent → never in main's history).
#    (gh api: create a blob+tree+commit with no parents, then a ref refs/heads/pr-evidence/<id>.)
#    On a re-ship, reuse the existing pr-evidence/<id> branch tip as the parent (idempotent overwrite per file path).

# 2. PUT each PNG (base64) to a per-PR subfolder. Returns the content metadata incl. html_url.
gh api --method PUT \
  "repos/{owner}/{repo}/contents/<pr>/<safeTitle>__before.png?ref=pr-evidence/<id>" \
  -f message="aj4 evidence <pr>" -f branch="pr-evidence/<id>" \
  -f content="$(base64 -i <local.png>)" --jq '.content.html_url'
#    html_url → https://github.com/<owner>/<repo>/blob/pr-evidence/<id>/<pr>/<file>.png
#    This BLOB-VIEWER PAGE renders the PNG to any authenticated repo viewer (private-safe, cookie-auth).
```

The PR block links each before/after as **openable evidence**: `[before (main)](…/blob/pr-evidence/<id>/…before.png)` · `[after (this PR)](…/blob/…after.png)`. Always works from a token; renders for a private-repo viewer in one click. `uploadShots()` encapsulates this so `evidence-report.ts` stays host-agnostic.

### SPIKE (task 4, time-boxed, default-to-PRIMARY on any doubt): inline image upgrade

The builder spends a bounded spike checking whether **any** `gh`-token-reachable path yields a `user-attachments/assets/<uuid>` (inline-rendering) URL — run against a **scratch PR on this private repo**, locally, never CI. If — and only if — a token-only inline path is confirmed to render in *this private repo's* PR, `uploadShots()` returns those URLs and `evidence-report.ts` emits real `![](…)` before/after panels (richer). **On any doubt, the spike defaults to the PRIMARY link form.** The guaranteed verification step the builder must run as **task 4**: open the scratch PR in a browser as the founder and confirm the embedded form actually renders/opens; if it does not, ship on the link-only PRIMARY. No inline rendering is *required* for AJ4 to be DONE — the openable link satisfies the AC ("PR carries before/after of each changed component").

### GC

Orphan-branch PNGs accumulate under `pr-evidence/<id>/<pr>/`. A periodic prune (or delete the `<pr>` subfolder on merge) is a follow-up note, not AJ4 scope (tiny PNGs, off `main`, no correctness impact).

---

## PR embedding + ship-summary integration

### PR body (always — both modes)

`evidence-report.ts` produces a fenced markdown block delimited by HTML-comment markers so re-ship is **idempotent** (replace, not append):

```md
<!-- aj4-design-evidence:start -->
## Design changes (design-system surfaces)
N component(s) changed appearance. Open locally with `npm run ds:serve`.

### AG6/RowDot — [open story](http://localhost:8098/#AG6%2FRowDot)  ·  variants: Success, ErrorTone
before: [main render](<blob-viewer url>)  ·  after: [this PR render](<blob-viewer url>)
<!-- aj4-design-evidence:end -->
```

The PRIMARY (private-safe) form uses **openable evidence links** (blob-viewer pages render the PNG to a repo viewer). If the task-4 spike confirms a token-only inline-rendering host for this private repo, `evidence-report.ts` switches that line to an `![before](…) | ![after](…)` table — same data, richer render. `buildEvidenceReport()` takes a `hosted: HostedShot[]` whose `url` is whatever `uploadShots()` produced, plus a `render: "inline" | "link"` flag so the builder/report knows which markdown form to emit; the default is `"link"`.

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
> **Design section (only when `ds:evidence` reported a non-empty changed-set):** list each changed surface with its openable story URL and its before/after evidence links. Source this from the `EvidenceReport.summarySection` that `ds:evidence` wrote to `plans/<id>/design-evidence.json` (a transient run artifact, not committed). If the changed-set was empty, the ship summary has **no** design section (AC3). This beat is content, not a new gate — the no-fabricate rule applies: no evidence file ⇒ omit the section entirely (never invent surfaces).

`ds:evidence` writes its `EvidenceReport` to `plans/<id>/design-evidence.json` so step 7a (a separate process) can read it without recomputing.

**File-state contract (absent vs malformed):**
- **Empty changed-set → no file written → no section.**
- **Non-empty → file written → render the section.**
- **File present but malformed / not valid JSON / missing the `summarySection` key → treat as ABSENT (omit the section); never throw into the ship summary.** The reader does `try { parse } catch { /* omit */ }` and also omits on a schema mismatch. A corrupt artifact must degrade to "no design section," never red the summary or fabricate surfaces. (Same non-blocking discipline as capture.)

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
| **AC1** Design change ⇒ PR carries before/after of each changed component, sourced from the regression diff (not a manual capture) | **Unit test** (`changed-stories.test.ts`): feed two synthetic `.snap` strings (changed / added / removed / identical), **including the escaped-backtick fixture** (see parser §); assert `changedStories()` returns exactly the changed `{title, variants}`. **Unit test** (`evidence-report.test.ts`): given `ChangedStory[]` + `HostedShot[]`, assert `buildEvidenceReport().prMarkdown` contains a before+after **openable link** (or `![](url)` when `render==="inline"`) per changed module + the `aj4-design-evidence` markers; and that capped-overflow modules appear as link-only "+K more" lines (no silent drop). The "sourced from the regression diff not a manual capture" property is *structural* — `changedStories` takes the `.snap` text as its only input (enforced by the function signature) **+ a grep-lint** that `capture-evidence.ts` obtains `baseSnap` via `git show origin/main:…/.snap` and contains **no inline image-path array literal** (the concrete enforcement; knip only proves reachability). | runtime test + structural lint |
| **AC2** Ship summary, when the change includes a design change, lists openable stories + screenshots for changed surfaces | **Unit test** (`story-url.test.ts`): `storyViewerUrl("AG6/RowDot")` === `http://localhost:8098/#AG6%2FRowDot`. **Unit test** (`evidence-report.test.ts`): `summarySection` has one entry per changed module, each with a non-empty `storyUrl` and a `shots` array. The *prose wiring* into step 7a is a SKILL.md change (process) — verified by **manual read** in `/review` + the founder walkthrough (TRACK-AJ proof bar). | runtime test (data) + manual (prose) |
| **AC3** No rendered-design impact ⇒ no screenshots, no design section in ship/PR | **Unit test** (`changed-stories.test.ts`): identical `.snap` texts ⇒ `changedStories()` === `[]`. **Unit test** (`evidence-report.test.ts`): `buildEvidenceReport([], [])` ⇒ `prMarkdown === ""` and `summarySection === []`. The PR-body-strip behavior on empty set is **integration-ish** (touches `gh`) — verified by the founder walkthrough on a backend-only WP (TRACK-AJ proof: "backend-only WP ships → PR carries no screenshots, summary has no design section"). | runtime test + manual |
| **AC4** Produced automatically, present regardless of run mode (interactive/autonomous); a ship artifact not a touchpoint | **Structural assertion (lint/grep test, NOT manual read):** a test (`ship-step6a-mode-independence.test.ts`) reads `.claude/skills/ship/SKILL.md`, extracts the **step-6a region** (between the `6a.` heading and the next `7`/`7a` heading), and asserts that region contains **no `PIPELINE_INTERACTIVE` token** — while asserting the step-7a region **does** contain it (proving the test discriminates). This turns the most-important AC into a repeatable gate, not an eyeball. *(This reads a file to assert a static property → it is a lint/structural check, not a behavioral unit test — correctly classified per CLAUDE.md "static property → lint rule.")* **Plus runtime test** (capture non-blocking): inject a thrown error at **`renderStory` AND `uploadShots`** (and the worktree-add path) → assert exit-0 + a degraded note for **each** source (see Failure stance table). The "both modes" property is also exercised by the **autonomous-parity check** in the TRACK-AJ proof bar (autonomous run still embeds evidence). | structural lint + runtime test |

**Why these are tests, not file-greps:** `changedStories`, `storyViewerUrl`, `buildEvidenceReport` are **pure functions** — a test imports them and asserts on return values (`import { changedStories } from "../scripts/design-evidence/changed-stories.js"`). The Playwright capture, `gh` upload, and SKILL.md prose are **not** unit-testable as pure logic — they are verified by the founder walkthrough + autonomous-parity check the TRACK-AJ proof bar already mandates for AJ-track process WPs, plus a non-blocking-on-failure unit test for the orchestrator's error stance.

---

## Ordered task list (builder)

1. **(AC1/AC3 red) Unit-test the detector — incl. the escaped-backtick fixture.** `src/scripts-tests/changed-stories.test.ts`: synthetic `.snap` pairs covering changed / added / removed / identical → expected `ChangedStory[]` (incl. `[]`), **plus a body containing `` \` `` and `\${`** asserting the line-delimited parser keeps the block whole (unchanged when identical; changed when one inner char differs). RED.
2. **(AC2 red) Unit-test the URL + report.** `story-url.test.ts` (hash route, URL-encoded title incl. the `/`); `evidence-report.test.ts` (markers, before+after **link** per module — and `![](…)` when `render:"inline"`, empty-input ⇒ empty output, `summarySection` shape, **capped-overflow "+K more" link-only line**). RED.
3. **(green) Implement pure pieces.** `changed-stories.ts` (**line-delimited** `.snap` parser + diff — NOT a non-greedy block regex), `story-url.ts`, `evidence-report.ts`. Make 1–2 green.
4. **Spike the hosting mechanic (time-boxed; default to PRIMARY on any doubt).** PRIMARY is the **orphan `pr-evidence/<id>` branch + openable blob-viewer links** (private-repo guaranteed-workable from a token). Implement that in `upload-assets.ts` first and lock it. THEN, as a bounded spike, check whether any `gh`-token path yields a `user-attachments/assets/<uuid>` inline URL for **this private repo** — **verification step the builder must run: open a scratch PR on this private repo in a browser as the founder and confirm the link opens / the inline form renders.** If inline is not confirmed, ship link-only. (Live local check against a scratch PR — never CI.)
5. **(green) Implement capture orchestration.** `render-story.ts` (drive a running viewer via `npx playwright screenshot`), `capture-evidence.ts`: detect (with `EVIDENCE_MODULE_CAP=12`, log on cap) → **force-remove+prune any stale `_aj4-evidence-base` worktree, add fresh, probe a free port for BOTH viewers (no hardcoded 8098/8099)** → per-module before/after → `uploadShots` (orphan branch) → embed openable links in PR body → write `design-evidence.json`; `finally` tears down both viewers + force-removes the base worktree (idempotent); best-effort/non-blocking, exits 0 on any I/O failure. Factor `renderStory`/`uploadShots`/worktree-add behind injectable seams. Add root `ds:evidence` script.
6. **(AC4) Non-blocking unit test — BOTH failure sources.** `capture-evidence.test.ts`: inject a throwing **`renderStory`** AND (separately) a throwing **`uploadShots`** (and the worktree-add failure path); for **each** assert the orchestrator resolves (does not reject), exits 0, and writes the matching degraded PR note. (Orchestration factored so `gh`/Playwright/worktree I/O is injectable.)
7. **(AC4 structural) Mode-independence lint test.** `ship-step6a-mode-independence.test.ts`: read `.claude/skills/ship/SKILL.md`, isolate the step-6a region, assert **no `PIPELINE_INTERACTIVE`** in it AND that the step-7a region **does** contain it (discriminating). Classified as a lint/structural check (static file property), not a behavioral test.
8. **(AC1/AC4) Wire `/ship` step 6a.** Edit `.claude/skills/ship/SKILL.md`: add **unconditional** step 6a calling `ds:evidence`; explicitly "both modes, ship artifact not gate, failure non-blocking." Must contain **no** `PIPELINE_INTERACTIVE` (test 7 enforces).
9. **(AC2/AC3) Wire `/ship` step 7a design beat.** Edit step 7a: add the conditional design section sourced from `design-evidence.json`; **no file OR malformed file ⇒ no section** (try/catch → treat as absent, never throw).
10. **(AC3) Idempotency + strip.** Confirm re-running `ds:evidence` replaces (not duplicates) the `aj4-design-evidence` block, and an empty changed-set strips it. (Body-marker logic; live-check on the scratch PR.)
11. **Proof.** Local walkthrough: (a) restyle one DS component + re-bless `.snap` → ship → PR shows openable before/after + story link, interactive summary shows the design section; (b) backend-only change → ship → no screenshots, no design section; (c) autonomous run (no `PIPELINE_INTERACTIVE`) → PR still carries evidence; (d) **re-run after a simulated crash** (leave a stale `_aj4-evidence-base` worktree + a viewer on 8098) → ship recovers (force-remove + free-port probe). Plus `npm run verify` green (new tests run in `test`; nothing touches CI).
12. **(AC1 structural) lint guard.** Grep-lint: `capture-evidence.ts` reads `baseSnap` via `git show origin/main:…` with no inline image-path array; no committed PNG / banned string (`golden`, `__screenshots__`, `toHaveScreenshot`) — `design-source-guard.ts` already bans those; confirm the new code passes it. **Protected contract:** AJ1's `catalog-snapshot.test.tsx` is **frozen** — AJ4 only **reads** the `.snap` output, never modifies the net or its enumeration (`≥56`) / non-empty guards (per `visual-regression.md` non-negotiables). Confirm no edit touches the net.

---

## Risks / open items

1. **Private-repo image rendering — RESOLVED.** Repo is PRIVATE → no token-only URL inline-renders in a PR (`raw`/`blob?raw` are JWT-gated; camo won't proxy private; user-attachments needs a cookie). **Resolution:** PRIMARY mechanic is the orphan `pr-evidence/<id>` branch + **openable blob-viewer links** (the blob page renders the PNG to any repo viewer, private-safe, token-only). Inline `<img>` (user-attachments) is a spike-only upgrade that defaults to the link form on any doubt. No PNG enters `main`/the PR diff; no CI. This is the guaranteed-workable path.
2. **Per-module vs per-variant image (B1 vs B2).** AJ4 ships per-module images (no viewer change) with variant-level detection. If review finds module images too coarse, B2 (a `?variant=` viewer route) is a scoped follow-up.
3. **Stale base worktree / port collision — RESOLVED.** Setup force-removes + prunes any `_aj4-evidence-base` left by a crashed prior ship, then probes a free port for both viewers (no hardcoded 8098/8099). Teardown force-removes again in `finally`. Both ends idempotent; recovery proven in task-11(d).
4. **Scope = design-system stories only.** Web-shell/web-page restyles produce no `.snap` delta → no evidence (inherited AJ1 boundary). Stated in the PR section header ("design-system surfaces") so the absence is legible, not silent. A web-package snapshot net + its evidence is a separate future WP, flagged.
5. **Capture cost at ship time — BOUNDED.** Two viewer boots + N×2 Playwright shots; capped at `EVIDENCE_MODULE_CAP=12` imaged modules (remainder link-only, cap LOGged — no silent drop). Backend WPs pay nothing (early exit). Acceptable for a local-only artifact.
6. **Non-blocking discipline.** The single most important invariant: a capture/upload failure **must not** fail the ship (AC4 — artifact, not gate). Enforced by the exits-0 orchestrator degrading at **all three** I/O seams (renderStory / uploadShots / worktree-add) + its unit test injecting failures at each (task 6).
7. **Protected contract — AJ1 net frozen.** AJ4 only **reads** `catalog-snapshot.test.tsx.snap`; it never modifies `catalog-snapshot.test.tsx`, its enumeration guard (`≥56`), or its non-empty guards (`visual-regression.md` non-negotiables). Confirmed in task 12.

## Doc cross-check
No `docs/` canonical-shape contradiction — AJ4 is tooling/skill process (`.claude/skills/ship/`, `packages/design-system/scripts/`). No new primitive (concept § "no BLOCKER"). The `.claude/rules/visual-regression.md` rule stays the gate's doc; AJ4 adds an *evidence/reporting* layer that reads the gate's output — note this distinction in `visual-regression.md` at `/write-docs` time so a future agent does not mistake AJ4 screenshots for the gate.
