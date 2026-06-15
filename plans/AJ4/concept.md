# AJ4 — Design-change evidence in the PR + ship summary — Concept (probe)

**Workpackage:** AJ4 (Track AJ). Complexity M. Depends on: AJ1 (the regression net), AJ2 (the ship summary). Sibling: AJ3.
**Phase:** designer production — `/concept` **probe only**. The founder already relocked the load-bearing decision (below). This doc confirms the nouns and records the relock; it does NOT redefine.

> **No `/concept` gate fires here.** AJ4 introduces no new product primitive. "Design-change evidence" is a **ship-artifact concept** (tooling/process), not a domain noun like Thread / Block / Bet. The probe exists to pin the four nouns AJ4 leans on so the architecture can't drift on a silent assumption.

---

## The relocked premise (founder, 2026-06-15) — load-bearing

The spec text says before/after screenshots are "sourced from AJ1's golden TSX screenshots." **That premise is dead.** AJ1 shipped screenshots (#287), was reverted (#298), and was **reshipped as a vitest DOM-snapshot net** (`packages/design-system/src/__tests__/catalog-snapshot.test.tsx`, #306) that produces **text** diffs of DOM+class+style — there is **no golden PNG baseline** in the repo, and adding a CI screenshot gate is a hard FAIL for this project (the macOS-no-Docker invariant — see MEMORY "Visual regression: no screenshots").

Founder relock: **build local-only screenshots.** Concretely:

- **Trigger / changed-set:** read from the DOM-snapshot net. The net already knows which catalogued stories' DOM/class/style changed on this branch vs `origin/main` — that changed-set is *both* the "is there a design change?" boolean *and* the list of surfaces to screenshot. No parallel detector.
- **Capture:** a **ship-time, local-only** Playwright screenshot of each changed story — `before` = the `origin/main` render of that story, `after` = the branch render. LOCAL ONLY. Never a GitHub Actions job (Playwright/e2e is local-only in this project). NOT the regression gate — the DOM-snapshot net stays the gate.
- **Hosting:** PNGs are **not committed** and are **not a golden baseline**. They reach the GitHub PR via `gh` asset upload + markdown image embed (mechanism settled in `architecture.md`).
- **Story links:** the ship summary links the openable live-viewer URL (`:8098`, `npm run ds:serve`) per changed story, by story id.
- **Always-on / mode-independent:** emitted by `/ship` in **both** autonomous and interactive runs. No design change → emit nothing (no design section anywhere).

This relock supersedes every "golden TSX screenshot" / "AJ1 baseline image" phrase in the AJ4 spec. The dependency on AJ1 is **the changed-set signal**, not an image source.

---

## The four load-bearing nouns

### 1. Changed-component set (the trigger and the worklist)

**IS:** the set of catalogued design-system **stories** (`{ title, variant }` pairs, grouped by module title) whose serialized DOM+class+style differs between the branch's committed `.snap` baseline and `origin/main`'s. It is computed from the **same machinery the net uses** (`discoverStories()` + the serializer in `catalog-snapshot.test.tsx`), never a second detector.

**IS NOT:**
- Not "files that changed" (a `.tsx` edit with no rendered-output delta — a comment, a renamed internal var, a prop never used by any story variant — is NOT a design change).
- Not a pixel diff (there are no pixels in the net; the signal is serialized-DOM text).
- Not the web-shell / web-page stories. The net's scope is the **`packages/design-system` catalog only** (56 stories; AJ1 deliberately did not cross the package glob boundary). AJ4 inherits exactly that scope: a restyle of a `packages/web` shell component is **outside** AJ4's evidence surface. State this honestly; do not silently widen.

**Essential property:** empty set ⇔ no design change ⇔ AJ4 emits nothing. Non-empty ⇔ design change ⇔ AJ4 emits the full evidence block. The set is the single switch.

### 2. Before/after capture (the evidence)

**IS:** two PNGs per changed story-variant — `before` rendered from the `origin/main` checkout of that story, `after` from the branch — both captured locally at ship time by driving the live TSX viewer with Playwright's screenshot CLI. Static images.

**IS NOT:**
- Not a committed artifact (no PNG enters git; no golden baseline).
- Not the regression assertion (capture never fails the gate; the `.snap` net is the gate).
- Not an animation / interaction recording (static only — explicit spec out-of-scope).
- Not a CI step (local-only; CI never runs Playwright here).

### 3. Openable story link (the inspection handle)

**IS:** a live-viewer URL for a changed surface — `http://localhost:8098/#<encodeURIComponent(module.title)>` — that opens the exact story in `ds:serve` so the founder can inspect the real render, not just the static image. One link per changed module.

**IS NOT:** not a deep-link into the running product app; not a permalink (the viewer is a local dev server); not a committed file path. It is a "run `ds:serve` and open this" handle.

### 4. Ship artifact vs founder touchpoint (the emission discipline)

**IS:** a **ship artifact** — produced by `/ship` unconditionally whenever the changed-set is non-empty, in **both** run modes. It is data attached to the PR (body/comment) and woven into the AJ2 ship summary's *design section* when that summary runs (interactive mode).

**IS NOT:** not a **touchpoint** — it never prompts, never gates, never blocks a merge, never waits for the founder. AJ2's ship summary IS a (interactive-only) touchpoint; AJ4's evidence is the *content* the summary's design section renders, but the PR-embedded evidence itself is emitted regardless of mode. The distinction matters: AC4 ("present regardless of run mode") forbids gating AJ4 on `PIPELINE_INTERACTIVE`. The interactive ship summary merely *also* surfaces the same links/images in chat.

---

## Vocabulary-collision check

- **"Visual regression"** already means the `.snap` net (the gate). AJ4 must NOT reuse that phrase for its screenshots. AJ4's noun is **"design-change evidence"** (PR images + story links) — a *reporting* layer that *reads* the regression net's changed-set. The gate catches; AJ4 shows. Keep them lexically separate so no future agent thinks AJ4 screenshots are a gate.
- **"Screenshot"** is overloaded: AJ1's deleted net used "golden screenshot" (banned, guarded by `design-source-guard.ts`). AJ4's screenshots are **local-only PR evidence**, never golden, never committed, never in CI. The architecture must avoid any string (`golden`, `__screenshots__`, `toHaveScreenshot`) that the AC1 guard bans — use `evidence` / `pr-shots` naming.
- **"Ship summary"** is AJ2's prose recap. AJ4 adds a *design section* to it (interactive) **and** a PR-body/comment block (always). Two emission sites, one evidence source.

---

## Lifecycle (one design change, one ship)

1. Branch changes a DS component's render → builder re-blesses `.snap` (AJ1 flow) → committed `.snap` now differs from `origin/main`.
2. `/ship` runs. After CI-green, the evidence step computes the changed-set (diff branch `.snap` vs `origin/main` `.snap`, mapped back to `{title, variant}`).
3. Non-empty → capture before (origin/main render) + after (branch render) per changed story locally via the viewer + Playwright → upload PNGs as a PR asset → edit/append the PR body (or comment) with embedded before/after images + openable story links. If interactive, the ship summary's design section lists the same links + images.
4. Empty → nothing emitted; PR has no design section; ship summary has no design section.

---

## Authority

- **The `.snap` net owns** "did the render change?" — AJ4 never re-decides it.
- **`/ship` owns** emission (it is where the PR + summary already live).
- **The founder owns** the merge decision; AJ4 only informs it. AJ4 never blocks.

---

## No new primitive conflict found → no BLOCKER

The probe surfaced no unresolved primitive collision. The one premise conflict (golden-screenshot source) was **already resolved by the founder** (relock above). Architecture proceeds.

## `/design` skip — recorded

AJ4 introduces **no component and no redesign** (spec: "Human design review: No — surfaces existing screenshots into the PR / ship output; introduces no component and no redesign"). The only "UI" is markdown in a GitHub PR body/comment and a chat-prose ship-summary section — no design-system surface, no viewer story, no rendered HyperIdle component. **`/design` is correctly skipped.** Per `.claude/rules/skill-discovery.md`, `/design` runs only for a new page/primitive/component-shape/interaction/redesign; none apply.
