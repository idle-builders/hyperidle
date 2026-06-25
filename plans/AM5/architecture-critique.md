# Architecture Critique: AM5 (base-primitive re-plan — kind layer COLLAPSED, not purified)

ARCHITECTURE-SCORE: 7/10  rounds=1  score-line: SA:8 LI:9 AC:8 DM:8 N:8 MD:7 FMC:7 S:8 V:6

**Verdict: PASS-WITH-FIXES.**

This plan SUPERSEDES the prior `architecture.md` (the "purify the kind renderers / `Representation` over `getRenderer(kind,representation)` / `select-renderer` over a 3-registry merge" plan) and its prior critique. The foundation decision (2026-06-26) is correctly realized: the AE6 `kinds/*-renderer.tsx` layer + `renderer-registry.ts` + `getRenderer` are **deleted, not purified**; Artifact (single) composes the block payloads directly via `composeArtifactBody`; the diff core moves LOW into `design-system/src/diff/` exposing a per-line slot seam; there is **one** content-renderer family. This is the structurally-honest end state — strictly better than the prior plan's "two kept families behind a `Representation` façade." Two of the prior critique's three must-fixes are now genuinely resolved (the §4.3 slot seam resolves the `code_diff` byte-preservation contradiction; the code-purge enumeration is now exhaustive at 15 with `OLD_KIND_MAP` correctly preserved; the eslint config file is now named).

BUT this critique found **new** load-bearing defects the re-plan introduced or carried, concentrated in the one net-new central contract — `composeArtifactBody` (§2). Three must-fix before `/write-tests`; all are mechanical, none breaks the model.

---

## Explicit judgment on the 9 scrutiny points (verified against source on this branch)

### #1 — Is the collapse real + safe? Every importer accounted? **MOSTLY — one E2E importer gap.**

Verified the FULL importer set of `getRenderer`/`renderer-registry`/the kind renderers:

| Importer | Plan disposition | Verified |
|---|---|---|
| `ArtifactPreviewSurface.tsx:81` (the gate, prod) | re-point to `composeArtifactBody` | ✓ confirmed `:76-88`, gate already null-guards before dispatch |
| `ArtifactView.tsx:106` (shell, prod) | DELETE atomically | ✓ confirmed; `viewSlot=` grep empty → no runtime mount |
| `index.ts:101-117` (barrel block) | DELETE | ✓ exact lines confirmed |
| `web/src/__tests__/AE6-kind-renderers.test.tsx` | rewrite to composition + negative-existence | ✓ imports all 7 renderers + `getRenderer`, 9 `preview={null}` assertions |
| `web/src/__tests__/ArtifactView.test.tsx` | DELETE | ✓ |
| `kinds/*-renderer.stories.tsx` (9) | DELETE | ✓ |
| `viewer/__tests__/discovery.test.ts:93` | **not addressed** | **SAFE — not a real importer.** It passes the path `"../src/kinds/code-renderer.stories.tsx"` as a literal STRING arg to `deriveGroup()` (path-classification logic); it does not import the file. Deleting the story does NOT break it. Note this in the plan so the builder does not chase a phantom. |
| `web/e2e/AI6-renderer-parity.spec.ts` | **NOT LISTED** | **GAP (must-fix, WARNING).** This spec navigates `/designsystem#Kinds%2FImageRenderer` + `#Kinds%2FCodeRenderer` and asserts `kinds/*` renders the SAME treatment as `block/*Payload` — a renderer-PARITY test. The collapse 404s those story routes AND obsoletes the test's entire premise (there is no kind layer to compare). The plan lists `L11-rich-messages.spec.ts` + `R9-action-prominence.spec.ts` (the `[data-component='ArtifactView']` consumers) but omits `AI6-renderer-parity.spec.ts`, which is the spec most directly invalidated by the deletion. It should be DELETED, not re-pointed. |

**Can `composeArtifactBody` render each kind from the block payloads in isolation?** Verified the payloads are self-contained — `CodePayload({lang,text})`, `ImagePayload({alt,url,title})`, `HtmlPayload({raw,sanitizeHtml})`, `renderInline` (barrel-exported `:57`), `deriveBlocks(body,host)` + `Block`. None requires `Block`/host runtime context the artifact path lacks, EXCEPT `HtmlPayload.sanitizeHtml` is a **non-optional prop** (`HtmlPayload.tsx:8`) and DOMPurify is a `web` dep (imported in `KnowledgeBody.tsx:28`), **not verified as a `design-system` dep** — the plan's Task-5 DOMPurify gate is real (see #9).

**Verdict on #1:** collapse is real and the prod-path is fully accounted. One E2E spec (`AI6-renderer-parity`) is an unhandled casualty — local-only, low blast, but the plan's importer enumeration claims completeness and misses it.

### #2 — The `data.rows` ≠ `TablePayload` shape mismatch (⚠️-DATA). **READING CONFIRMED — sound, no hidden fork.**

Verified: `data.ts` `rows: z.array(z.record(z.string(), z.string())).optional()` → `Record<string,string>[]` (freeform key/value grid). `TablePayload` (`:9-10`) takes `header: InlineNode[][]` + `rows: InlineNode[][][]` (GFM inline-node table). They are genuinely not prop-compatible. The plan's disposition — the `data` composition lifts `data-renderer.tsx:85-101` rows-table markup verbatim; `TablePayload` serves block/GFM tables — is the correct call. The alternative (convert `data.rows → InlineNode[][][]` to force `TablePayload` reuse) is a content-shape change beyond AM5 scope; rejecting it is right.

**Is it "two table renderers"?** Technically yes — the freeform `data.rows` `<table>` and `TablePayload` are two table renderers. But they render two DIFFERENT data shapes (untyped k/v grid vs typed GFM inline-node table), so this is not a duplication of the SAME renderer — it is two renderers for two shapes. Consistent with the "reuse foundations, don't reinvent" intent: the plan reuses `TablePayload` where the shape matches (block/GFM) and keeps the freeform grid as a composition-local table where it doesn't. **No hidden fork. Reading confirmed.** (One nit: the lifted rows-table is composition-local markup, not a named base primitive — fine, the concept's "Table (EXISTS) for data" is satisfied by the content-type split, not literal `TablePayload` reuse, which the plan states explicitly.)

### #3 — KPI/Graph extraction. **Source ranges verified; behavior-preserving; one overstated reuse claim.**

Verified `data-renderer.tsx`: KPI headlines flex-grid `:71-83` (mono-caps label + tabular-nums value), `Sparkline()` SVG `:28-58` (80×24 polyline over `--accent-primary`, auto-scaled, not exported). `KpiStat.stories.tsx` + `Sparkline.stories.tsx` exist and **inline** the components (`function KpiStat`/`function Sparkline` defined locally) — Task 1 backs them with the real exported components and re-points the stories. Extraction is a verbatim lift; behavior-preserving.

**Overstated reuse (SUGGESTION):** the plan justifies the KPI/Graph component budget as "used in 2+ contexts: the `data` artifact + the `metrics_moved` review delta." Verified `ReviewMetricsMoved.tsx` renders its OWN bespoke figure markup (`:236-251`, local `NUM`/tabular-nums), and NO AM5 task rewires it to consume `KpiStat`/`Sparkline` (the data-delta canvases are S2 fast-follow — explicitly deferred). So the 2nd consumer does NOT land in AM5. KPI/Graph are still justified by the `data`-split alone (they replace, not add to, `data-renderer.tsx`), so the budget holds — but the plan should not claim a 2nd live consumer it doesn't wire this WP.

### #4 — No `Representation` type — is dropping it sound? **YES — genuinely simpler-and-equivalent.**

The prior plan's `Representation = single|diff|mixture` + `getRenderer(kind, representation)` over a 3-registry merge existed to KEY a kept kind-renderer registry. With the registry deleted, there is nothing to key. Composition is now three distinct call sites — `composeArtifactBody` (Artifact), `getReviewCanvas`-composes-`getDiffRenderer` (Review), `renderPayload`/`Block` (Block) — each composing the same base primitives. A runtime enum threaded through one façade would be pure ceremony over three functions that share no dispatch table.

**Is the closed `single|diff|mixed` set still enforced?** It is now **structural, not type-level** — enforced by the existence of exactly three composition entry points (and the closed `OpenTarget.route`/`FoldMode` unions that gate which one runs), NOT by a `Representation` literal. The concept's "composition CLOSED at three" survives as an architectural invariant (adding a 4th composition = adding a 4th entry point + a concept-doc update), but there is no single runtime artifact that would go red if someone added a 4th. That is acceptable: the concept itself (Phase-4 closure read) says the composition axis is closed at the concept level, and the three-call-site structure makes a 4th conspicuous in review. Dropping the enum loses no guarantee that the enum actually provided — the enum was a consequence of the (now-deleted) shared registry, not the closure mechanism. **Sound.**

### #5 — Diff-core extraction + per-line slot seam. **Re-confirmed against `ReviewCodeDiff.tsx` — the prior verdict's contradiction is now RESOLVED.**

Verified `ReviewCodeDiff.tsx` (802 LOC). `FileDiff` (`:346-480`) interleaves, INSIDE the per-line `hunk.lines.map`: per-line `blockId` (`:388`), `allBlockIds.add` (`:391`), `threadMap` lookup (`:393`), `data-diff-type` tints (`:400`), dual old/new gutter (`:403`), the hover `+` button (`:410-416`), `InlineComposer` (`:436`), `AnchoredThreadCard` (`:447`), plus the orphan-thread pass (`:465-471`). This is exactly the "diff structure fused to anchor machinery" the prior critique flagged as making "output unchanged" unachievable.

The re-plan RESOLVES it: the DS `(code,diff)` core owns the diff STRUCTURE (hunk loop, tints, `data-diff-type`, glyph, per-line `<code>`) and exposes four per-line render-prop slots (`CodeDeltaProps` + `DiffLineRef`, §4.3); `ReviewCodeDiff` fills them with its anchor chrome verbatim → byte-identical DOM. The DS core imports nothing from `web` (`DiffLineRef` is pure data). The protectedTests block correctly states the byte-preservation + the inverse proof (revert slot wiring → RED). **This is the correct fix the prior critique demanded (option (b)). S2 staging is sound** — extract `code` first (the cleanest, highest-value seam), stage the rest as fast-follow; the K2b STRUCTURE (DS-owned core, review composes downward, no parallel family) lands fully in AM5 with only the per-canvas chrome/core split deferred. **S2 confirmed over S1** (S1 = a 7-web-file high-blast refactor for marginal benefit on the chrome-heavy canvases).

### #6 — Code purge completeness (15 consumers + OLD_KIND_MAP stays). **Re-confirmed exhaustive; non-code kinds safe.**

The §4/Migrations enumeration (Family A A1–A11 + Family B B1–B4 = 15) is now exhaustive — it includes the consumers the prior critique flagged missing (`ArtifactStackItem.stories.tsx`, `ArtifactSection.stories.tsx`/`.test.tsx`, `ArtifactPermalink.thread.test.tsx`, `review-canvas.ts`/`.tsx`, and the 4 `code_diff` kind-string fixtures `thread-payload`/`db artifacts`/`R6-events`/`bets-summary`). Verified the server `code_diff→code` re-inject branch exists (`artifacts.ts:84-118`, lore `:89` "old code_diff preview {file,hunks} is compatible with new code schema"); the plan deletes only that branch. `OLD_KIND_MAP` (13 legacy kinds) STAYS, `AE6-kind-registry.test.ts` stays green — verified the map is shared and covers 12 non-`code` mappings, so deleting the `code_diff` normalization does NOT break non-code kinds (they never routed through the deleted branch). Eval scenario `create-artifact.ts` uses `{kind:"code_diff",file,hunks:[...strings...]}` (A6) — note its `hunks` is already an array of strings, not `{header,lines}` objects; the rewrite must produce the pure `{path,lang,text}` shape, not just re-point the kind. **Disposition correct.**

### #7 — Cleanup tasks vs code. **Verified — dispositions correct.**

- `ArtifactSection.tsx:212` (View-all `<span>`), `KnowledgeBody.tsx:44/103/139` (`onOpenBlockActions` unwired), `AssistantOverlay.tsx:188-204` (`BlockRefEmbed`) — WIRE targets exist; dispositions sound.
- **TaskSheet VERIFY-THEN-REMOVE is correct and load-bearing.** The props ARE live (`:201-204` "Open thread" via `resolveThreadId`/`onNavigateToThread`; `:338-366` request form via `postRequest`). The architecture's verify-then-remove + drop-`@deprecated`-from-live-props supersedes a blind remove that would regress "Open thread" + the request form. **The architecture's correction is right and the concept Phase-5 line (`concept.md:341`) already matches it** (VERIFY-THEN-REMOVE) — so unlike the stale prior critique, there is NO concept/architecture contradiction here to flag. Good.
- `ArtifactEmbed.tsx` deletion-safe (`viewSlot=` grep empty; `viewSlot ?? summary` falls to summary). **The plan correctly locates it in `packages/design-system/src/ArtifactEmbed.tsx`** (Layer F / Required-reading) — the stale prior critique's "mis-located in web/components" complaint is RESOLVED.

### #8 — Ordering. **Mostly sound — one code-shape/ordering tension (must-fix, see CRITICAL).**

Tasks 1–2 lift KPI/Graph + the `(code,diff)` core OUT before Task 3 deletes the kind layer — correct (else the deletion loses their content). Task 3 = collapse + shell-delete + gate re-point as ONE atomic step — correct (splitting yields a half-removed registry / red `check`). Task 4 purifies `code` AFTER the diff render is safely relocated — correct.

**The tension:** Task 3 adds `composeArtifactBody` with a `code` branch `<CodePayload lang={preview.lang} text={preview.text} />`. But `code.ts` is NOT purified until **Task 4** — at Task-3 time the `code` preview shape is still `{kind:"code", file, hunks}` (verified `code.ts:18-22`), which has NO `lang`/`text`. So `composeArtifactBody("code",…)` either (a) cannot type-check at Task 3 against the live `CodePreview` type, or (b) is written against a shape that doesn't exist yet, making Task 3's own tests un-writable until Task 4 lands. Either Task 4's `code.ts` purification must move INTO Task 3 (so the pure shape exists when `composeArtifactBody` references it), or Task 3's `code` branch must be explicitly stubbed/deferred to Task 4. The plan's task-dependency note ("Task 4 depends on Tasks 2–3") has the arrow backwards for the `code` content branch. See CRITICAL.

### #9 — BLOCKER-1 + the ⚠️ items. **Each judged.**

- **BLOCKER-1 (`task → null` no-op vs concept-H5 "via parent bet"):** verified `resolveHostRoute(hostKind,hostId)` has no `betId` in scope (`host-route.ts`), the `task` host carries no `betId`, and no AM5 AC requires task navigation (TRACK-AM §AM5 ACs cover artifact/block/review only). The no-op satisfies H5's operative invariant (no reference resolves to a dead URL) + H3. **OK to defer — but it is a documented deviation from a LOCKED concept rule (H5); it needs the founder's (a)/(b) choice and must NOT auto-proceed.** Surface as the first human-design-review question.
- **⚠️-DATA:** ok (see #2).
- **⚠️ EXTRACTION / slot seam:** RESOLVED (see #5).
- **⚠️ relocated `(code,diff)` prop contract:** sound — `code-renderer.tsx` declares its OWN local `{file,hunks}` type (NOT imported from shared), so purifying `code.ts` does not break the relocated core. Verify-at-build is the right posture.
- **⚠️ React-18 scroll-on-mount:** sound — reuses the `scrollIntoView?.()` guard precedent; flush rAF under `act()`.
- **⚠️ K0b enforcer is ESLint/negative-existence, not type:** sound and now LIGHTER (the files are deleted, so there is no `if(!preview)` body to forbid). The negative-existence test (barrel no longer exports `getRenderer`/`*Renderer`) + `knip`/`check` is the right gate. The eslint config blocks are now named (`eslint.config.ts`, with the existing `no-restricted-imports` blocks at `:348/:400/:458/:492/:595` verified present) — the prior critique's "config file unnamed" complaint is RESOLVED.
- **⚠️ DOMPurify-in-DS (Task 5):** a real build-time hard gate, NOT a soft ⚠️ — DOMPurify is a `web` dep (verified `KnowledgeBody.tsx:28`), not confirmed in `design-system`. If absent there, Task 5 must thread `sanitizeHtml` in as a prop (as `render-payload`/`KnowledgeBody` already do) rather than add a wrong-package dep.

---

## CRITICAL (must-fix before /write-tests)

- **[§2 / Key type shapes — `composeArtifactBody`] The central composition contract names fields that do not exist on the real Kind preview schemas.** Verified against the live schemas:
  - `url` → real shape is `{kind:"url", url: string, statusLabel?: string}` (`url.ts:8-12`). There is **NO `href`**. The plan writes `renderInline({type:"link", href: preview.href, …})` (§2 row + §Key-shapes #2 comment). Correct source field is `preview.url`. Also `renderInline` takes `InlineNode[]` (an ARRAY — `inline.tsx:5`), the plan passes a single node object; wrap in an array, and supply a non-empty `children` (the inline `link` node requires `children`).
  - `html` → real shape is `{kind:"html", html: string}` (`html.ts:8-10`). The field is **`html`, not `raw`**. `HtmlPayload`'s PROP is `raw` (correct), so the call is `<HtmlPayload raw={preview.html} sanitizeHtml={…} />`. The plan writes `preview.raw` — does not exist.
  - `image` → real schema `{kind:"image", url, alt?: string, title? absent}` (`image.ts:8-13`); `ImagePayloadProps` requires `alt: string` AND `title: string | null` (both non-optional, `ImagePayload.tsx:7-11`). The plan's `<ImagePayload alt={preview.alt} url title />` is a **type error**: `preview.alt` is `string | undefined` and `preview.title` does not exist on the schema. The adapter must coalesce (`alt: preview.alt ?? ""`, `title: preview.title ?? null`).
  → These are not nits — `composeArtifactBody` is the one net-new contract the whole collapse hinges on, and as written it will not type-check. Fix the §2 dispatch table + the §Key-shapes #2 comment to the real field names + null-coalescing, OR state explicitly that `code`/`html`/`url`/`image` previews are adapted (field-mapped) inside `composeArtifactBody` and show the mapping.

- **[Task 3 / Task 4 ordering — the `code` content branch] `composeArtifactBody("code",…)` references the purified `{lang,text}` shape, but `code.ts` is not purified until Task 4 (one task later).** At Task-3 time `CodePreview` is `{kind:"code",file,hunks}` (verified `code.ts:18-22`) — no `lang`/`text`. The plan declares "Task 4 depends on Tasks 2–3," but the `code` arm of `composeArtifactBody` (added in Task 3) depends on Task 4's purification. Resolve by EITHER (a) folding `code.ts` purification into Task 3 (so the pure shape exists when the composition references it), OR (b) explicitly deferring the `code` branch of `composeArtifactBody` to Task 4 and stubbing it (e.g. `UnknownPayload`) at Task 3. State which, so the red phase has a coherent target and no task lands on a red `check`.

- **[Layer D / §1.3 — snapshot enumeration guard] The plan says "bump the enumeration guard floor" without naming the floor(s) or the new value.** Verified `catalog-snapshot.test.tsx` has TWO guards: `:73` `toBeGreaterThanOrEqual(61)` (primary, "≥61 = 54 root + 7 kinds") AND `:223` `toBeGreaterThanOrEqual(60)` (secondary). The collapse removes 9 `kinds/*.stories.tsx` and adds 10 foundation + (2 KpiStat/Sparkline already counted) + `UnifiedSplitView` — a net story-count shift that crosses BOTH floors. If the floor is not recomputed and both lines updated, the net either red-fails spuriously or (if lowered carelessly) goes vacuously weak. Name both guard lines, compute the post-collapse floor, and state it in §1.3 / Task 3's re-bless step.

## WARNING

- **[#1 / Migrations — E2E] `web/e2e/AI6-renderer-parity.spec.ts` is an unhandled casualty of the collapse.** It navigates `#Kinds%2FImageRenderer` + `#Kinds%2FCodeRenderer` and asserts kind-renderer↔block-payload parity — the deletion 404s those routes AND voids the test's premise. The plan's E2E re-point list (`L11-rich-messages`, `R9-action-prominence`) omits it. → Add it to the migration list as **DELETE** (not re-point — there is no kind layer left to compare). Local-only, but the plan's importer enumeration claims completeness.

- **[#3 / §3] Overstated KPI/Graph reuse.** The plan cites `metrics_moved` as the 2nd consumer justifying the KPI/Graph component budget, but `ReviewMetricsMoved.tsx` keeps its own bespoke figure markup (`:236-251`) and no AM5 task rewires it (data-delta canvases are deferred S2 fast-follow). → Drop the "2nd live consumer" claim for AM5 (the `data`-split alone justifies the extraction — they replace `data-renderer.tsx`, not add to it), or schedule the `metrics_moved` rewire explicitly.

- **[#1 / Migrations] Note that `viewer/__tests__/discovery.test.ts:93` is SAFE.** It passes the kind-story path as a literal string to `deriveGroup` (path-classification), not as an import — deleting the story does not break it. → Record this so the builder does not chase it as a phantom break.

## SUGGESTION

- **[Task 5 / §9] Promote the DOMPurify-in-`design-system` check from ⚠️ to a Task-5 precondition.** DOMPurify is a `web` dep (`KnowledgeBody.tsx:28`), not verified in `design-system`. Default to threading `sanitizeHtml` IN as a prop (the established `render-payload`/`KnowledgeBody` pattern) rather than adding the dep to DS — avoids a wrong-package dependency and a mid-green block.

- **[BLOCKER-1] Surface the (a)/(b) founder choice as the first human-design-review question** — it is the only LOCKED-concept (H5) deviation in the plan, even though no AC forces task navigation.

## What's Working Well

- **The collapse is the honest end state, not a veneer.** Deleting the kind layer + `getRenderer` + the `Representation` façade and composing the block payloads directly is structurally simpler than the prior "two kept families behind an enum." The plan's RETRACT table is precise about what the foundation decision invalidates and why — a reader can diff the two plans cleanly.
- **The §4.3 per-line slot seam resolves the prior critique's hardest must-fix.** The `code_diff` byte-preservation contradiction (simpler DS DOM vs anchor-fused review DOM) is fixed the right way — DS owns the structure, the review fills render-prop slots, the inverse proof (revert → RED) is named. Verified against the real 802-LOC `ReviewCodeDiff.FileDiff`.
- **Verify-against-code discipline.** The TaskSheet props-are-LIVE correction (verified `:201-204`/`:338-366`), the `ArtifactView` `viewSlot=`-empty safety check, the `code`-purge 15-consumer enumeration with `OLD_KIND_MAP` preserved, and the exact `index.ts:101-117` barrel-block citation all hold against grep reality. This is the project's "verify against code, not docs" memory honored.
- **K0b enforcement is correctly downgraded.** With the files deleted, the enforcer becomes negative-existence (`knip`/`check` + a barrel-export assertion) rather than a body-syntax rule on files that no longer exist — the lighter, structurally-correct gate.
