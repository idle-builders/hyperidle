# BA2 — Architecture critique, review surface and canvas wiring (independent, second pass)

**Scope.** §2.8, §2.8.1, §2.8.2, the T4-family in §5, §6.1, §6.2, and the matching `feasibility.md`
entries (F60–F70). The harness half — hooks, rule store, heartbeat, day-one re-key, the four shims,
the deletions — was not re-reviewed.

**Method.** `hyperidle-trace` was not available in this session; every claim below was established by
opening the file and reading it, with `rg -a` used to enumerate. Nothing is taken from
`architecture-critique-r1..r4.md` or `architecture-critique-surface.md` — none were read. Facts about
the tree were re-derived, not inherited from `superseded/`.

**Authority applied.** `interview-2026-08-25.md` → `founder-rulings.md` (8, 11, 12, 13, 14) →
`plan.md` ACs 8–11 / `requirements.md` → `.claude/rules/typescript.md`, `frontend.md`,
`testing.md`, `CLAUDE.md`, `ETHOS.md`, `tools/governance/README.md`.

**Verdict: 2 BLOCKING. Do not build T4e as written; T4b / T4c / T4d may proceed.**

---

## What is sound, on my own evidence

Stated first, because most of this material holds and a builder should not re-litigate it.

- **The write-path trace (§2.8.2 B1) is correct in every step.** `reviewPayloadSchema`
  (`layers/core-api/src/routes/threads-schema.ts:155-159`) declares `artifactRef` required inside a bare
  `z.object`; `messageInputSchema.safeParse` at `threads.ts:1301-1305` yields `parsed.data`;
  `enrichedPayload = input.payload` (`threads.ts:1382`) is stringified at `:1422`. `review` is indeed the
  only message type whose write and read unions point at the same schema (`threads-schema.ts:213-231`),
  which is the single mechanical cause of both the strip and the read-arm problem. The branch at
  `tool-definitions.ts:643` is `if (input.artifactRef)`. Three gates, all real, all correctly located.
- **The read direction holds.** The demo world writes straight to the table
  (`tools/setup/src/demo-world/conversations.ts:1624`) and the loader's early return spreads the whole
  payload (`layers/core-api/src/routes/reviews.ts:117-119`). I checked the seeded payload
  (`conversations.ts:411-530`): it is a complete `ComposedReviewSubject` — `tokens: "9.2k"`,
  `tools: ["vite","figma"]`, 3 `resultKpis`, 4 `intent`, 1 `needs`, `prompt`, `outcome`, 3 canvas
  artifacts. `{...composedDefaults, ...persistedPayload}` therefore returns every field it returns today.
  The correction of the coordinator's `:149-150,176` citation to `:117-119` is right: those lines are the
  proposed-call branch §2.11 deletes.
- **`action_operation`'s re-derivation (claim 5) is right on the property, not merely safer.**
  `isActionOperationPayload` (`ReviewActionOperation.tsx:441-451`) returns false without
  `isString(payload.amountWire.formatted)`, and the interface requires
  `amountWire: {currency, units, formatted}` (`review-artifact.ts:88-101`). A command or file clearance
  has none of the three. The reversal is correct, and coupling `ProposedCallArgsPanel`'s deletion to the
  `stripe` mapper fix in one task (T4e) is the right sequencing: the panel is the mitigation for that
  fabrication.
- **The kind-name relocation (claim 3) is boundary-legal.** `tools/governance/architecture.json`
  declares `framework/domain-model` with `"reach": "everyone"`, so both `@hyperidle/tool-handlers`
  (deps: db, domain-model, harness-protocol, zod) and core-ui may name it; exporting from the package's
  own `src/index.ts` is not a new surface and needs no `surfaces` declaration. Re-deriving core-ui's
  `ReviewCanvasKind` from `REVIEW_CANVAS_KINDS` keeps one home for the nine names, and keeping the
  payload contract in each canvas's guard avoids the second, drifting contract the naive repair would
  create. The ruling-13 constraint holds: this is not `ARTIFACT_VIEW_SHAPES` coming back.
- **The seeding (claim 4) is genuinely data.** `tools/setup/src/demo-world/` sits outside the shipping
  roots, so it is a development file by the repo's own classifier, and ruling 14 names it explicitly.
  Four payload literals appended to existing `artifacts` arrays add no code path. Seeding
  `action_operation` does not contradict F68: a demo company's refund is data; BA2 inventing an amount in
  code would not be.
- **The two `??` defaults the design rules *not* violations — I agree.** `part.ts:280`'s `?? "Artifact"`
  and `:538`'s `?? "Tool call"` are generic type nouns for a chip label and a verb, not content standing
  in for a value the code lacks. Keeping them is correct.
- **`ToolLogo` was checked and is clean**, and it matters: `:83-85` builds a neutral monogram from the
  tool string itself for an unknown tool. Had it substituted a brand, §2.8.2 D's "route the mappers to
  `artifact.tool`" would have moved the lie one layer down. The design is right to call this
  load-bearing.
- **§6.1's expectations match the seeded data.** I checked step 4 and step 5 against the rows: three
  KPIs ("Support pricing questions 4 / week", "Page length -38%", "Mobile comparison stacks clean"), one
  `needs` entry, three artifacts, the two `visual_diff` region labels, and the `browser_preview` url and
  title are all exactly as written. The two verdict e2e specs are on the exclusion list at
  `__e2e__/known-pre-existing-failures.ts:198` and `:341`, and `test:e2e:ah1|ah5|ah6` are defined in
  `package.json` and invoked by nothing — both claims true.

---

## BLOCKING

### BLK-1 — The ruling-14 sweep enumerated *mappers*, not *rendered output*, and two of the three canvases it certifies clean invent inside the mapper it says it read

`feasibility.md` F70 "Clean — enumerated, not assumed" states:

> all nine canvas mappers | only the five in §2.8.2 D invent; `ReviewCodeDiff`,
> `ReviewFieldChangeSet`, `ReviewBatch` map without inventing

That is false at the exact artifact it names. Read the two mappers:

| site | written | what renders on a payload that PASSES its guard |
|---|---|---|
| `ReviewFieldChangeSet.tsx:373` | `tool: "salesforce"` | a vendor the payload never names |
| `ReviewFieldChangeSet.tsx:374` | `object: "Record"` | an invented CRM object type |
| `ReviewBatch.tsx:547` | `tool: "zendesk"` | a vendor the payload never names |
| `ReviewBatch.tsx:548` | `title: "Overnight support triage"` | an invented title for the agent's batch |
| `ReviewBatch.tsx:554` | `metric: { label: "Median first response", before: "", after: "" }` | an invented KPI, rendered at `:284-289` as "Median first response would drop  → " |
| `ReviewBatch.tsx:520,522` | `sentiment: "neutral"`, `flag: "churn"` | an invented per-item classification |

Three further sites the sweep never reached, because it stopped at the mapper and the fabrication is in
the view:

| site | written | what renders |
|---|---|---|
| `ReviewFieldChangeSet.tsx:335` | `Owner, Lead source, Probability, Type, Account, and {n-5} more were left as-is.` | five invented field names for *any* record, plus arithmetic on a count the payload supplied |
| `ReviewFieldChangeSet.tsx:212` | `<ToolLogo tool="salesforce" …/>` | a Salesforce mark beside every field's provenance line |
| `ReviewMetricsMoved.tsx:460-469` | `Recognized revenue closed at {usd(current)}, up {signed(…)} from April. The period ties to bank; biggest open item is a {usdCents(exceptions[0]?.amount ?? 0)} wire with no source.` | an invented narrative, an invented month, an invented reconciliation claim, and a `$0.00` amount |

The metrics one is not theoretical: against the seeded demo payload
(`conversations.ts:894-905` — `headlines: [{label:"Top-3 hit rate", prior:54, current:68}]`,
`exceptions: []`), the shipping canvas today renders *"Recognized revenue closed at $68, up +$14 from
April. The period ties to bank; biggest open item is a $0.00 wire with no source."* `usd`/`usdCents`
(`:195-209`) format every number as USD, so an agent's hit-rate becomes a dollar figure. T4e removes
only `provenance.tool: "quickbooks"`.

And one more, which is the same proxy error the design's own F70 says it was correcting:

- **`ReviewOutcomeSummary.tsx:374`'s `tokens ?? 0` fires on the guard-PASSING path.**
  `isOutcomeSummaryPayload` (`:342-353`) checks `agentName`, `agentInitials`, `achieved`, `tools`,
  `doneConditions`, `needsYou` and `standing` — it does **not** check `tokens`. So a well-formed payload
  from an agent that reports no token count passes the guard and renders **"0 tok"**. §2.8.2 C and
  revision 10 both classify all three of these as living on "the guard-failure path"; for `tokens` that
  is wrong. Worse, the specified fix ("all three go") then hands `undefined` to
  `TokensChip`'s `tokens: number` (`:73`, `:198-203`), rendering "undefined tok", because the type
  narrowing on the guard-passing branch is a promise the guard does not keep.

**Why this blocks.**

1. **Ruling 14 and `.claude/rules/typescript.md` are violated on the shipping success path** after T4e as
   specified. Three of the four sites belong to `field_change_set`, `batch` and `metrics_moved` — and
   T4d **seeds the first two as demo rows**, so this package is precisely what makes them visible.
2. **T4e's file list does not include `ReviewFieldChangeSet.tsx` or `ReviewBatch.tsx` mappers at all**
   (only their fixture constants), so a builder executing the task as written ships all of it.
3. **The proof cannot catch it.** §6.2's component-lane success-path set covers "each of the five
   mappers" and asserts the absence of `"Solo"/"$19"/"Onboarding · Create account"/"mailchimp"/
   "hello@example.com"/"quickbooks"/"stripe"` — not `"salesforce"`, `"zendesk"`,
   `"Overnight support triage"`, `"churn"`, `"Recognized revenue"`, `"from April"`, `"0 tok"`. §6.1
   step 12's negative list is the same seven strings. The net and the manual test would both go green
   with the lie rendering, which is the "proving it falsely" case.
4. **The specified remedy does not even typecheck for two of them.** `ChangeSet.tool` is the literal type
   `"salesforce"` (`ReviewFieldChangeSet.tsx:47`) and `BatchFixture.tool` is the literal `"zendesk"`
   (`ReviewBatch.tsx:60`), so "take it from the artifact envelope" requires widening the view's own
   types — more than the subtraction §2.8.2 D promises.

**What would close it.** Redo the sweep by the property — *for each of the nine canvases, every string
and number that reaches the DOM on a guard-passing payload that the payload did not supply* — and extend
T4e, §6.1 step 12 and §6.2's component set with what it finds. State the guard-vs-optional-field
distinction explicitly, because `tokens` is not the only field a guard skips (`reviewerName` too, though
`?? ""` there is honest).

### BLK-2 — `visual_diff` cannot be made honest by a mapper change, and the design's two statements about it cannot both hold

§2.8.2 C: `visual_diff` is *"yes, once the mapper stops inventing"*. §7: *"No canvas is designed,
redesigned or deleted"*, and the plan's out-of-scope line is *"reworking the review product's layout or
its canvases"*.

`ReviewVisualDiff` renders `MockScreen` (`:114-160`) — a hand-drawn fake product screen carrying
**"Create your account"**, **"Start your 14-day trial — no card required."**, an Email field with
placeholder `you@company.com`, a Password field, and a **"Create account"** button — as *both* the
"Design" and the "Build" evidence panes, for **every** payload. It is mounted unconditionally at
`:250-251` (thumbnails), `:316-317` (side-by-side, via `RenderPane`) and `:330,339` (overlay/swipe).
`RenderPane` also hardcodes `<ToolLogo tool="figma" …/>` at `:190`, and the overlay header repeats it at
`:320`. `VisualDiffPayload` (`review-artifact.ts:137-145`) carries **labels only — no images**, which the
design itself notes.

So after T4e removes `title: "Onboarding · Create account"` and `tool: "figma"` from the mapper
(`:415-436`), a human approving an agent's real visual comparison is still shown a fabricated signup
screen presented as the agent's before-and-after. That is the AC9 sentence — *"A canvas that silently
substitutes a fabricated demo fails this"* — failed by the largest fabrication in the surface, and it is
ruling 14's prohibition on the shipping path.

There is no subtraction that fixes it: the canvas's evidence panes have no real content to fall back to.
The options are all outside what §7 currently claims — render the honest "no rendered image available"
state in place of the panes, or exclude `visual_diff` from the reachable set, or accept a canvas rework.

**Why this blocks.** The design asserts a property (`visual_diff` honest and reachable after T4e) that
its own specified change cannot deliver, and it asserts a scope boundary (no canvas changes) that
conflicts with ruling 14 on this one canvas. A builder is led either to ship the fabrication or to make
an unapproved renderer decision alone. This needs a stated decision — and, given `visual_diff` is one of
the five kinds the demo world exercises and §6.1 Run A step 5 opens it, the decision cannot be deferred
past T4e.

---

## NON-BLOCKING DEFECTS

1. **The loader's response type has no declared home, and the compiler guarantee §2.8.1 A1 claims does
   not exist.** *"The route builds this as a locally annotated object … so a missing required field is a
   `npm run check` failure."* `ComposedReviewSubject` lives in
   `layers/core-ui/src/pages/review/review-composition.ts:104-123`; `layers/core-api` has no core-ui
   dependency and layer→layer crossing is not permitted (`architecture.json` `containment`). A local
   annotation in core-api proves the *local* type's fields are present, never the consumer's. Related:
   `threadId` is new on the client type and `review-composition.ts` is **absent from T4b's file list**,
   though `ReviewPage` must read `subject.threadId` for the `GET /api/threads/:id` fetch. Both are caught
   by `tsc` in practice — which is why this is not blocking — but the sentence must not be quoted as
   proof of anything. Say instead: the client-side predicate of A3 is the only real gate on the shape.
2. **The canvas-artifact *envelope* is left without a home, and will be declared twice.** §2.8.2 B2
   places the nine kind names in `domain-model` and leaves payloads to the guards, but says nothing about
   `{id, tool, app, sourceHref, title, kind, payload}` — which must exist as a domain-model/zod shape for
   `ReviewPayload.artifacts` and `submit_review`'s envelope validation, while core-ui's `ReviewArtifact`
   (`review-artifact.ts:23-31`) already declares it. Name one home and re-derive the other, exactly as
   was done for the kind names, or the section's own "one contract, one home" argument does not hold for
   the field it exists to add.
3. **`{...composedDefaults, ...persistedPayload}` contradicts "always composed, never from the
   payload".** The A1 table marks `threadId` and `verdict` as always composed; the spread as written lets
   a payload field win. Benign today (no payload carries either) but it is the literal line a builder
   copies. Spell the two as applied after the spread.
4. **"A demo review must come back byte-identical to today" (T4b) is not what the design wants.** The
   response is a strict superset — it gains `threadId` and `verdict`. §6.2's phrasing ("returns its
   `artifacts` array intact, its `resultKpis`, `intent`, `needs`, `tools` and `tokens`") is the correct
   assertion; T4b's sentence would fail it.
5. **The component-lane success-path assertions are absence-only for four of five mappers.** "Asserted by
   absence of the specific invented strings" goes green on a canvas that renders nothing. Only
   `visual_diff` has a positive (`r1` renders as `r1`). Pair each with a positive: a payload-supplied
   value that must appear.
6. **§6.1's dependency table is misnumbered against its own body from step 13 on.** The table says
   "Part 1 steps 7–12" and "Part 2 steps 13–14, 16", but body step 13 (the BLK-1 demo regression re-run)
   is inside Part 1, body step 15 is "return to the thread", body step 16 is the Route B resume, and body
   step 17 (the reload that distinguishes a real write from optimistic UI) has no row at all. This is the
   BLK-7 class of defect recurring inside the revision that fixed BLK-7. Renumber against the body.
7. **T4f's `Depends on` omits T4 and T6, which its own deliverable requires.** §6.1's table says Part 2
   steps need T4 (the verdict logic, without which the decision is discarded at `threads.ts:1537` — I
   confirmed the `void decision`) and step 15/16 need T6. T4f lists only T4d, T4e, T4b. Scheduled on that
   list alone, AC11's proof can only run Part 1 and would be reported as a pass of a procedure that never
   reached the approval.
8. **The kept legacy route is a compat shim CLAUDE.md's absolute rule 2 forbids, and nothing needs it.**
   §2.8.1 B keeps `work/bet/:betId/review/:reviewId` as a redirect. I enumerated the readers of that URL:
   `open-handler.ts:107-118` builds it at runtime, `router.tsx:89` serves it, plus tests and a fixture —
   **no persisted row anywhere holds it** (notification `sourceLink` is `/conversations/:threadId`).
   Delete the old path with the rest, or state the bridge and why.
9. **A resolved questionnaire's "Inspect review" turns from a dead no-op into a 404.** `part.ts:411`
   gives a resolved questionnaire a `reviewTarget`, `ReviewResolvedPart.tsx:49-63` renders the button
   unconditionally, and once `open-handler`'s no-op is removed it will navigate to `/reviews/<id>` — which
   §2.8.1 A2 then 404s. §2.8.1 C's "questionnaire is left alone" is true of `CommentRow` and not of this.
   One line in `part.ts`, a file T4b already edits.
10. **§2.8.2 D and §6.2 disagree on what a guard-failing `outcome_summary` renders.** D says all nine
    fallbacks become `ReviewUnknownCanvas` with `reason:"malformed"`; §6.2 says for this one "the
    assertion is different in shape" — no token count, no standing, no `achieved` line, i.e. the canvas
    still renders. A builder cannot tell which, and the two produce visibly different surfaces.

## FOLLOW-UP / NOTES

- Revision 10's summary line *"§6.1 Run A covers all nine rather than five"* contradicts §6.1's body,
  which correctly runs Run A on an unmodified tree where the four are unseeded (step 6b says so). The
  body is right; the summary is stale.
- §2.11 cites `routes/reviews.ts:34-79,86-89` for `FIXTURE_REVIEW`/`"rev-1"`; the live file has them at
  `:42-87` and `:96-98` (§2.8.1 A6 has it right). Pre-rebase numbers.
- T4d does not say **which** demo review hosts each of the four seeded canvases. A Stripe refund
  (`action_operation`) inside the pricing-page review would be incoherent demo data; name the host.
- `ReviewOutcomeSummary`'s guard accepts any `needsYou[].category`, but `RISK_LABEL`
  (`:33-40`) is keyed on the six risk categories — an agent supplying a seventh renders an empty label.
  Worth one sentence in `submit_review`'s rewritten description, which already has to name the fields.
- `ReviewBrowserPreview.tsx:129` styles a nav link with a raw hex (`#2f6b4f`) keyed on the literal
  `"Pricing"`. It dies with `navLinks: []`, but it is an AQ-008 violation while it lives.

---

## Claim-by-claim

| # | claim under test | verdict |
|---|---|---|
| 1 | no fabricated content remains | **NOT PROVEN — BLK-1, BLK-2.** The two `??` type-noun rulings are correct; I agree with them |
| 2 | the canvas data path works, write and read | **Proven for the mechanism.** Three gates correctly located, layering returns everything the demo carries today. Response-type contract undeclared (NB-1); "byte-identical" is a superset (NB-4) |
| 3 | kind names relocate, UI re-derives, no second vocabulary | **Proven for the names.** Boundary-legal, one home. The envelope is the gap (NB-2) |
| 4 | four canvases seeded as demo rows | **Proven.** Data, not code; development-world file; no shipping path touched |
| 5 | `action_operation` not reachable by this work | **Proven, on the property.** The guard demands `amountWire.formatted`; the reversal is right, not merely safer |
| 6 | §6.1 followable, §6.2 goes red | **Partly.** §6.1 is followable and its observations match the seeded rows; its dependency map is misnumbered (NB-6). §6.2's service lane is real and positive; its component set is absence-only (NB-5) and blind to every site in BLK-1 |
| 7 | scope and proportionality for `mvp` | **Held, with two exceptions.** Nothing of BA9's rows is touched; every T4 task maps to an AC. The kept legacy route (NB-8) and BLK-2's unresolved scope conflict are the exceptions |
| 8 | internal consistency across ten revisions | **Not yet.** NB-3, NB-4, NB-6, NB-7, NB-10 and the two notes are live contradictions between sections |

**May these tasks be built?** T4b, T4c and T4d: yes. T4e: no, not as written — it would ship four
canvases that still fabricate on the success path and one that cannot be fixed by the change it
specifies. T4f depends on T4e and on a dependency list that is missing T4 and T6, so it follows.
