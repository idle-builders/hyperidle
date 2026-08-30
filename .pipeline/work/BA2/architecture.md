# BA2 — Architecture

**Covers phases 2, 3 and 4 of `plan.md`.** Phase 1 is complete; its results
(`harness-research/FINDINGS.md` and the five per-harness files) are treated here as settled fact and
are not re-derived.

**Authority order.** `interview-2026-08-25.md` → `founder-rulings.md` → `plan.md` → `requirements.md`.
`superseded/` was not read and nothing here descends from it.

**Tier: `mvp`.** Two tables, one route, one port member, four shims, one settings screen, one core-api
subscriber. Every mechanism below is either an extension of something already in the tree or is named
with the reason a smaller option does not satisfy an AC.

**Method note.** The `hyperidle-trace` MCP tools were not available in this session. Every "this is the
only X" claim below was established by enumerating matches with `rg -a` across the whole tree and
reading each hit, and the enumeration is shown where the claim is load-bearing.

---

## Revision 11 — the sweep done at the rendered-output layer: all nine canvases fabricate

**Both findings upheld.** BLK-1 is right and understates the problem; BLK-2 is right and is a scope
conflict I cannot resolve alone. All ten non-blocking defects are real and fixed.

**The pattern, and what I did differently.** Seven times now I have verified at whatever layer I happened
to open — the type, the fixture, the schema declaration, the guard, the mapper. The layers are
**guard → mapper → view → rendered output**, and the fabrication has been at a different one each time.
So this pass I did not read code first. **I rendered all nine canvases with sentinel payloads — every
supplied string prefixed `Zx` — dumped `container.textContent`, and listed every token that reached the
DOM without coming from the payload.** Then I worked back to the source. F71 has the method and the raw
output.

**The result is worse than either critique found: all nine canvases put invented content in the DOM on a
guard-passing payload.** F70 certified three of them clean. All three were wrong.

| canvas | in the DOM, not in the payload | where |
|---|---|---|
| `metrics_moved` | *"Recognized revenue closed at … up … from April. The period ties to bank; biggest open item is a $0.00 wire with no source."* + `Apr`/`May` column heads + a "Roll-forward reconciliation" frame. **The payload's own `period` never renders at all** | `:460-469`, `:195-209` |
| `visual_diff` | an entire fake signup screen — *"Create your account"*, *"Start your 14-day trial — no card required."*, `you@company.com`, *"Create account"* — as **both** evidence panes, plus a figma mark | `MockScreen:114-160`, mounted `:250,316,330,339` |
| `batch` | *"Median first response would drop → once the 1 drafts send."*, `CHURN THREAT`, *"No reply drafted — policy routes this straight to you."*, *"Held for your review"*, `neutral` | `:520,522,547,548,554`, view `:284-289` |
| `browser_preview` | `Product Pricing Docs Changelog`, and **two** tiers — `Solo` from the mapper and `Founder` hardcoded in the view — `$19/mo`; `previewBody` rendered twice as literal text | `:479-500`, view `:233` |
| `code_diff` | **`coverage +0.4%`** — an invented test-coverage figure on every diff — and *"Minor / generated & formatting — safe to skip"*. The payload's `triviaSummary` renders separately | `:335-336`, `:751-753` |
| `field_change_set` | a **Salesforce** mark on every field's provenance line, and *"Owner, Lead source, Probability, Type, Account, and N more were left as-is"* — five invented field names for any record | `:212`, `:335`, mapper `:373-374` |
| `rendered_in_context` | `mailchimp`, `hello@example.com`, and `HyperIdle` in the email chrome | `:535-552` |
| `action_operation` | `stripe`, and an **"Approve refund"** button on an operation that is not a refund | `:453-465` |
| `outcome_summary` | **`0 tok`** | `:374` |

**Three of these neither critique named**, and they are the ones that prove the method rather than the
list: `code_diff`'s `coverage +0.4%`, `browser_preview`'s second `Founder` tier, and
`action_operation`'s "Approve refund" label. A grep for the strings the critiques listed would have
shipped all three.

**BLK-1's `outcome_summary` correction is exact and revision 10 got it backwards.**
`isOutcomeSummaryPayload` (`:342-353`) does **not** check `tokens`. My sentinel payload omitted `tokens`,
the guard **passed**, and the DOM read `0 tok`. Revision 10 filed all three of its defaults under "the
guard-failure path". Wrong: `tokens` is a guard-skipped optional, so `?? 0` fires on the success path.
And the specified remedy — "all three go" — hands `undefined` to `TokensChip`'s `tokens: number` (`:73`)
and renders `undefined tok`. **The guard-vs-optional distinction is now stated explicitly in §2.8.2 D**,
because `tokens` is not the only field a guard skips.

**A blind spot in my own method, stated because it bounds the result.** The sweep reads the DOM in its
**default** state. Two of the sites above — `field_change_set`'s Salesforce mark (`:212`) and its
invented field-name list (`:335`) — sit behind `expanded` and `showUnchanged` disclosures and were
**not** in my dump; I found them by working back to the source afterwards. So "rendered output" must
mean *every reachable state*, not the first paint. §6.2's assertion is written to expand the disclosures
for exactly this reason.

**What the honest-fallback rule actually requires — the general answer, not a string list.** The nine
canvases were designed against richer content than their payload types declare, so each has regions with
no derivable source. The rule is a property:

> **No string or number may reach the DOM that the payload did not supply — except fixed interface
> chrome, which names a region rather than asserting a value.** "Blast radius", "files changed",
> "Needs you" are chrome. "Recognized revenue closed at … from April", `coverage +0.4%`, `Solo $19/mo`,
> `0 tok` are values. Where a region has no derivable content, it renders an explicit absence or is not
> rendered — never a plausible substitute.

That line is checkable, it is what ruling 14 says, and it is why `visual_diff` is a founder decision
rather than a bug: it is the case where the un-derivable region **is** the entire evidence surface, so
applying the rule leaves the canvas with nothing to show.

**BLK-2 — `visual_diff` is left alone, and T4e is restructured so nothing waits on it.** §2.8.2 C's
"yes, once the mapper stops inventing" is **retracted for this canvas**: `VisualDiffPayload` carries
labels only, so no mapper change can make those panes honest. §7's "no canvas is designed, redesigned or
deleted" and ruling 14 genuinely cannot both hold here. The decision is the founder's; §9 question 10
states the three options.

**T4e splits in two** so the eight tractable canvases are not blocked by the one that is not, and
**T4f's `Depends on` gains T4 and T6** — without them §6.1 stops after Part 1 and AC11's proof would be
reported as a pass of a procedure that never reached the approval.

---

## Revision 10 — ruling 14: the demo-data line, and a fourth violation the sweep found

Founder ruling 14, now a standing repo rule in `.claude/rules/typescript.md` (bound as `rules.code`, so
every builder and reviewer reads it): **production code may never invent a value it does not have.**
Prefilling the database with demo rows is fine — the line is **code versus data**.

**Revision 9 already complies where it speaks.** The BLK-5 fix is subtraction at the mappers with
unsupplied fields left empty; the guard-failure fallback renders the payload itself; `FIXTURE_REVIEW` and
the checkout mock were already on the delete list. Ruling 14 forces **no change to any of that**.

**But the sweep it asked for found a fourth violation, and it is inside my own design as an explicit
exclusion.**

### The fourth: `ReviewOutcomeSummary` invents three values, and revision 9 said it invented none

`ReviewOutcomeSummary.tsx:368-374`, on the guard-failure path, feeds the view:

| written | why it is prohibited |
|---|---|
| `tokens={payload.tokens ?? 0}` | renders **"0" as a token count** when there is no token count. A reader cannot tell "this run used none" from "we do not know" |
| `standing={payload.standing ?? "Awaiting"}` | **invents a review status.** `standing` drives the blocking indicator — this is a fabricated *state*, not just a label |
| `achieved={payload.achieved ?? artifact.title}` | substitutes the artifact's title for **the agent's own claim about what it achieved**. It reads exactly like the agent's sentence and is not it — the "indistinguishable from the truth" case the rule names |

The `?? ""` and `?? []` siblings on the same call are honest empties and stay.

**Why revision 9 missed it, stated because it is the same method error a fourth time.** I excluded this
canvas from T4e with the words *"`ReviewOutcomeSummary` has no fixture … there is nothing to delete and
**nothing was ever fabricated there**"*, having run `grep -c FIXTURE` on it and got `0`. **I tested for
the shape of the defect — a constant named `FIXTURE` — instead of the property: a value the code did not
have.** The rule is about invented values; a `?? 0` is one, and no grep for `FIXTURE` will ever find it.
That sentence is **retracted**. F70.

This matters more than a stray default because `outcome_summary` is the kind §2.8.2 C designates as **the
natural default and BA2's own** — so a partial payload from an agent lands on exactly this path.

### Two more the sweep names so a builder cannot miss them

- **The eighth constant is not called `FIXTURE`.** `ReviewActionOperation.tsx:49` is `const REFUND`, and
  its guard-failure branch returns it (`:533-535`). A builder grepping for `FIXTURE` finds seven files and
  leaves the Stripe refund in place. T4e now names it.
- **`routes/reviews.ts:164` — `kind: artifactRow?.kind ?? "action_operation"`**, a fabricated artifact
  kind. It sits inside the proposed-call branch §2.11 deletes, so it goes with that branch; named here so
  the refactor does not carry it onto the surviving path.

### What the sweep confirmed is clean

Enumerated rather than assumed, across every production file this design touches:

- **All nine canvas mappers** — only the five in §2.8.2 D fabricate; `ReviewCodeDiff`,
  `ReviewFieldChangeSet` and `ReviewBatch` map without inventing, and their `?? ""` fallbacks are honest
  empties.
- **`ToolLogo` (`:74-77`) does not invent a vendor** for an unknown tool — it builds a neutral monogram
  from the tool string itself and labels it with that string. This matters: §2.8.2 D's fix routes the
  mappers to `artifact.tool`, and had `ToolLogo` substituted a real brand the fix would have moved the lie
  one layer down instead of removing it.
- **`CanvasSourceHeader`** renders `app`/`record` as given; no substitution.
- **`ReviewUnknownCanvas`** renders `JSON.stringify(artifact.payload)` — the actual payload, nothing
  invented. Its only defect is the sentence, already fixed as NB-3.
- **The composed frame of §2.8.1 A1** specifies no invented default: `tokens: ""`, `tools: []`,
  `prompt: ""`, `betTitle` empty when there is no bet, `authorName` from the real sender.
- **`part.ts:280`'s `?? "Artifact"`** and **`:538`'s `?? "Tool call"`** are generic type nouns, not
  fabricated content — a thing called "Artifact" is an artifact. Not violations.
- **`ReviewComposition.tsx`** carries no other hardcoded content; T4c's builder has already removed the
  checkout strings.

### The three — in fact four — unexercised canvases are now seeded

Ruling 14 settles §9's open question in the affirmative: seeding is **data**, so it is allowed. **My call:
do it in this package**, in T4d, which already edits `demo-world/conversations.ts`.

It is four payload literals, not three. `field_change_set`, `rendered_in_context` and `batch` are wired,
producible and unexercised. **`action_operation` is the fourth** — no demo data either, and seeding it is
worth doing because it proves the *renderer*, which is what AC10 asks. It does **not** disturb F68: BA2's
own push-back flow still cannot produce one, because a command clearance has no `amountWire`, and BA2's
review still carries `outcome_summary`. A demo company having a refund to approve is honest demo data;
BA2 inventing an amount in code would not be.

With those four seeded, **all nine canvases have real data on run B's tree**. §6.1 Run A runs on an
**unmodified** tree, where the four are still unseeded — its step 6b says so, and this summary previously
contradicted the body. §6.2's per-canvas assertions stop being vacuous for any kind.

---

## Revision 9 — seven blocking findings, all upheld; the write path traced this time

**Every one of the seven is real. I reproduced each at the code, and executed the two that turn on zod's
behaviour rather than reading them.** Nothing here is contested.

**The method failure the coordinator named is the right diagnosis, and it is the same one as revision 8's.**
Three findings — BLK-2, BLK-4, BLK-5 — come from writing the design against *declarations* instead of
against the path the data takes. In revision 8 I read a type and a fixture and never opened the seeded
database. Here I read `submit_review`'s handler and never followed `insertMessage` through the route it
calls; I read `.optional()` and never asked what it does to a *present, wrong* value; I read each canvas's
type guard and never read the mapper on the other side of it. **In all three cases the thing I did not
open is where the answer was.** F65–F67 record the traces.

| # | Upheld — verified how | Fix |
|---|---|---|
| **BLK-1** | Read. `architecture.md`'s field table specifies `artifacts: []` justified by D1, which §2.8.1 D1 itself marks **WITHDRAWN — false**; T4b then says the handler body is *replaced*. §2.8.2 B asserts the opposite of the same field. And the demo payload is a **complete `ComposedReviewSubject`** — `tokens: "9.2k"`, `tools: ["vite","figma"]`, 3 `resultKpis`, 4 `intent`, 1 `needs`, `prompt`, `outcome`, 3 canvases (`conversations.ts:411-470`). T4b would strip all of it from a shipping surface. | The composed frame becomes a **fallback layer under** the persisted payload, never a replacement. §2.8.1 A1. |
| **BLK-2** | **Traced end to end, and executed.** Three gates: the branch at `tool-definitions.ts:643`, `artifactRef` required at `threads-schema.ts:155-159`, and the strip — `messageInputSchema.safeParse` → `input = parsed.data` (`threads.ts:1301-1305`) → `enrichedPayload = input.payload` (`:1382`) → `JSON.stringify(enrichedPayload)` (`:1422`). **Executed: the parse SUCCEEDS and returns `["title","reasoning","artifactRef"]` — `artifacts` is silently dropped.** F65. | A read-arm schema, the pattern this file already uses; `artifactRef` optional on write; the branch condition widened. §2.8.2 B. |
| **BLK-3** | Read. `@hyperidle/tool-handlers` depends on `db`, `domain-model`, `harness-protocol`, `zod` (`package.json:13-18`) — it cannot import core-ui, and must not. | **A shape that duplicates nothing:** only the nine kind *names* move to `domain-model`; the payload contract stays the renderers' guards, single-homed. §2.8.2 B. |
| **BLK-4** | **Executed.** `z.enum(ARTIFACT_KINDS).optional()` **REJECTS** a present `"text_diff"` and accepts only its absence. All three demo reviews carry pre-consolidation values (`conversations.ts:419,603,772`) and `rowToMessage` does a throwing `.parse` (`threads.ts:593-596`). Listing any thread with a demo review would throw. F66. | Read arm tolerant (`z.string().optional()`), write arm strict. The demo literals move to six-kind values. §2.8.2 B. |
| **BLK-5** | **Read the mappers, which I had never opened.** All five fabricate on the **guard-passing** path: `mapBrowserPayload` (`ReviewBrowserPreview.tsx:479-500`) injects `navLinks` and an entire `Solo / $19 /mo` tier; `mapVisualPayload` (`ReviewVisualDiff.tsx:415-436`) hardcodes `title: "Onboarding · Create account"`, `tool: "figma"` and coerces every unknown region id to `"cta"`; `mapRenderedPayload` (`:535-552`) `tool: "mailchimp"`, `senderEmail: "hello@example.com"`; `mapMetricsPayload` (`:528-535`) `tool: "quickbooks"`; `mapActionPayload` (`:453-465`) `tool: "stripe"`. F67. | §2.8.2 D extended to the mappers. **"The renderers are untouched" is retracted** — it was the sentence that let this through. |
| **BLK-6** | Read. `isActionOperationPayload` (`ReviewActionOperation.tsx:441-451`) **requires `amountWire.formatted`**; a command or file clearance has no money. And the file's `@lore AL7 CRITICAL-3` (`:468-477`) records `ProposedCallArgsPanel` as the fix for *"the approver saw fake Stripe ids/amount"* — which T4e deletes. | Re-derived: `action_operation` is **not** reachable by BA2's flow. BA2's own review carries `outcome_summary`. §2.8.2 C. |
| **BLK-7** | Read as a procedure. Preconditions ("T4b–T4e merged") contradict Part 0 ("passes before any BA2 change"); step 5's expectation is not what `mapBrowserPayload` renders; Route B needs T1/T2/T3/T5 and step 15 needs T4/T6, none listed; step 3's parenthetical describes the pre-change tree. | §6.1 split into two explicit tree states with full dependency lists per part. |

**What BLK-5 changes about reachability, since it is the founder's question.** It does not make a kind
unreachable — it makes five of them *honest*. Combined with BLK-6's re-derivation the table moves by
exactly one row: `action_operation` goes from "the one BA2 closes for real" to **not reachable by this
work**, because its payload demands a monetary amount BA2 never has. BA2's own push-back review carries
`outcome_summary` instead — the proven kind, whose `needsYou` field is precisely "this action needs a
human". Six kinds reachable and honest, three wired and unexercised. §2.8.2 C.

**All eight non-blocking defects verified and fixed**, including two I would otherwise have shipped as
contradictions: `ReviewOutcomeSummary` has **no** fixture to delete (`grep -c FIXTURE` → 0; it falls back
to `{}`), and `ReviewRenderedInContext`'s `FIXTURE` is `export`ed and imported by its own story
(`:63`, `stories.tsx:10`), so "delete the constants" and "stories keep their sample data" collided on one
file.

**Also corrected from the tree:** the migration is `0065_team_action_rules.sql` — main took 0061–0064
during the rebase onto `eaaa74de8`.

**T4c is untouched.** It was judged sound and disjoint and is being built.

---

## Revision 8 — the canvases work; I was wrong, and the story is the wiring

> **Its correction stands; its specifications do not.** The archaeology in this block — the canvases work,
> five kinds ship real payloads, the two axes, the zero-overlap finding — is true and was independently
> confirmed. **But everything it specifies was rebuilt by revision 9** after a review found seven blocking
> defects in it: the loader replaced instead of layered (BLK-1), the write path was never traced so the
> canvas channel could not reach the database (BLK-2), the vocabulary could not live where it was put
> (BLK-3), "optional on read" broke every existing row (BLK-4), five canvases fabricate on the **success**
> path which this block declares untouched (BLK-5), `action_operation` is not producible by BA2 (BLK-6),
> and §6.1 was not runnable (BLK-7). Read §2.8.1, §2.8.2, §5 and §6.1 for the built shape.


**Correction first, because everything in revision 7 hung off it.** I reported that the nine review
canvases have never rendered real data on any route, and built a Path A / Path B fork on top of that,
recommending the deletion of ~4,900 lines. **The premise was false and the fork is void.** Founder ruling
13 records the correction; F60 records how I got it wrong.

**What is true.** The demo world seeds three review messages whose payloads carry a populated `artifacts`
array with real canvas payloads for **five of the nine kinds** — `outcome_summary` ×3, `code_diff` ×2,
`visual_diff`, `browser_preview`, `metrics_moved` (`tools/setup/src/demo-world/conversations.ts:469,503,520,642,664,818,844,894`).
They are persisted whole (`:1624`, `JSON.stringify(message.payload)`) and served whole
(`routes/reviews.ts:117-119` — the early return spreads the payload, `artifacts` included). **All nine
renderers were built complete in AL2 and work.** Four kinds have no data anywhere —
`field_change_set`, `action_operation`, `rendered_in_context`, `batch` — which is a data gap, not a
broken renderer.

**How I got it wrong, stated plainly because the method is the lesson.** I checked the `ReviewPayload`
type (no `artifacts` field) and `FIXTURE_REVIEW` (`artifacts: []` at `routes/reviews.ts:85`) and
concluded from those two that no data existed anywhere. I never looked at what the demo world writes into
the database. **The persisted payload is a superset of its declared type**, so reasoning from the
declaration was reasoning from the wrong artifact — the same class of error as the four this package has
already had. I had even executed a probe against the *fixture* (F42) and read its empty `artifacts`
array as confirmation, which made a narrow check feel like a broad one.

**So the story is small, and it is exactly the two breaks ruling 13 names.**

| # | The break | The fix |
|---|---|---|
| **1** | **An agent cannot attach anything to a review.** `submit_review`'s `artifactRef.kind` is `z.enum(ARTIFACT_VIEW_SHAPES)` — five pre-AM5 words with **zero overlap** with the six kinds `create_artifact` emits (**executed, F51**: all six rejected). And there is no way at all to supply a *canvas* artifact, which is the channel the demo world uses. | `submit_review` gains `artifacts?: ReviewArtifact[]` — byte-identical to what the demo world persists and the loader already serves, so no renderer, no mapping, no new vocabulary. And `ArtifactRef.kind` is respelled to the consolidated `ArtifactKind`, optional on read. |
| **2** | **The loader never resolves a reference.** `artifactRef` is spread into the response and read by nothing. | The loader resolves it with the `work.get(db,"artifact",id)` call it already makes, and `submit_review` first checks the artifact belongs to `ctx.taskId`. One new port member, `getArtifactById`, over the route that already exists. |

**The six-kind consolidation stays and nothing pre-AM5 comes back.** `ReviewCanvasKind` is the AL2
review-*rendering* vocabulary on a different axis from the artifact primitive's kinds; AM5 consolidated
the latter and never touched the former. What is deleted is `ARTIFACT_VIEW_SHAPES` — a third vocabulary,
five values, two readers, both validators, no renderer anywhere (F53) — which is the break itself.

**One thing this work makes urgent that revision 6 only filed as a note.** The nine
`if (!isXPayload(p)) return FIXTURE` sites are harmless only while nothing reaches a canvas. **This
change is what springs that trap**: an agent's near-miss payload would render a fabricated GitHub PR in
place of its real work. The fallbacks become `ReviewUnknownCanvas` — already the registry's default,
already built for this — and the nine fixture constants are deleted. Nine one-line changes; **the
renderers are untouched**.

**Withdrawn in full from revision 7:** Path B, the canvas deletion, the ExaminePane→`ArtifactPreview`
swap, and the removal of anchored commenting. §2.11 and §5 are corrected, not annotated.

**AC10's proof is a manual test of the running product**, per ruling 13 — an agent produces a review, a
human sees it rendered, and approves it. §6.1 is that procedure, written as an ordered deliverable
someone can follow against `npm run dev`. Read from the DOM, reported in prose, **no screenshots**. The
automated lane stays as the regression net and stays **local-only on `verify:release`** (founder
confirmed), which is where the finding that *the three existing real-backend lanes are run by nothing*
still bites.

**Tasks:** T4d (the two fixes), T4e (the substitution fix — no deletions of renderers), T4f (the manual
procedure plus the automated net). §5.

---

## Revision 7 — SUPERSEDED BY REVISION 8. Its premise was false; kept as record only

> **Do not build from this block.** Its central claim — that the nine canvases never render real data —
> is false (F60), and the Path A / Path B fork it forces is void. Founder ruling 13 overturned it and
> §2.8.2 replaces it. What survives is the `ArtifactRef` vocabulary break (F51), the loader never
> resolving a reference (F52), the `ARTIFACT_VIEW_SHAPES` finding (F53), the `totals.tables` correction
> (F58) and the e2e-lane archaeology (F57). Everything about deleting canvases is withdrawn.


Founder ruling 12 overturned revision 6's out-of-scope call on the nine canvases: *"this workpackage is
about getting review to work properly. If the reviews only display stubs right now we also need to fix
this. The goal here is in the end we tested reviews through fully and seen they worked."* That is AC9 and
AC10. The reasoning matters for how far this goes: **the artifacts and examples are the review** — they
are what makes producing one real work for the agent, and what separates a review from the push-back.

**The headline, and it changes the shape of the answer: there is no content pipeline to build.** The
producer exists and is live, the reference exists and is carried, and the renderer exists and already
works with real data. The chain is broken in two specific places, and both were established by execution
rather than reading (F51–F56).

| # | Verified | Where |
|---|---|---|
| **1** | **`create_artifact` is a live, wired agent tool** that writes a real `artifacts` row with a real per-kind preview, through the same `POST /artifacts` route a human uses. Nothing about it is stubbed. | `tool-definitions.ts:1400-1466` |
| **2** | **`submit_review` already carries a reference to one**, persisted on `ReviewPayload.artifactRef` and read back through `reviewPayloadSchema`. | `tool-definitions.ts:586-589,644-648`; `thread.ts:202` |
| **3** | **But the two ends speak different vocabularies with ZERO overlap, so the obvious agent chain is rejected.** `create_artifact` returns one of six `ARTIFACT_KINDS`; `submit_review`'s `artifactRef.kind` is `z.enum(ARTIFACT_VIEW_SHAPES)` — five words that are not those six. **Executed (F51): all six kinds `REJECTED`, overlap `[]`.** An agent that creates an artifact and references it gets `INVALID_INPUT`, every time. Under §2.5's B3 rule (`clearsRuleId` ⇒ `artifactRef` required) this would have made **every BA2 review unsubmittable** — an AC3 blocker, not only an AC9 one. | proven |
| **4** | **And even a review that does carry a valid ref is never resolved.** The loader parses the payload, spreads it, and never reads `artifactRef`. `artifacts` is fed only from `reviewPayload.artifacts` — a field `ReviewPayload` does not have — and the dead proposed-call append. | `routes/reviews.ts:115-119,149-172` |
| **5** | **`ARTIFACT_VIEW_SHAPES` has no renderer at all.** Two production readers in the whole tree, both schema validators. Nothing dispatches on it. It is a fifth vocabulary that exists only to be validated against. | `tool-definitions.ts:588`, `threads-schema.ts:82` |
| **6** | **The nine canvas payloads are not artifacts — they are analyses of artifacts**, and nothing in the product produces any of them. `CodeDiffPayload` wants a diff with per-file bands and rationale; `MetricsMovedPayload` wants period-over-period figures with a tie-out that balances; `BatchPayload` wants rollup partitions. The repo removed the diff from the `code` kind **on purpose** — `registry.ts:63-68`'s own `@lore AM5 K0`: *"the diff belongs to the Review composition (built from two code instances)"* — and nothing builds two. | proven |
| **7** | **A renderer for real agent artifacts already ships, and the review is the only surface not using it.** `composeArtifactBody` / `ArtifactPreviewSurface` / `ArtifactPreview` is keyed on the six real kinds, error-boundaried, live on `/artifacts/:id`, and the conversation's own review Embed already routes there (`part.ts:275-282`). | `ds/kinds/compose-artifact-body.tsx`, `ds/ArtifactPreview.tsx`, `ArtifactPermalink.tsx:121` |
| **8** | **It already answers ruling 12's third point.** `ArtifactUnrenderable` is the never-invent fallback, and AZ6 already reasoned it through: three distinct reasons that must not share a sentence, classified with `isRegisteredKind`, and no "view source" control when there is nothing to reveal. | `ds/kinds/artifact-unrenderable.tsx:10-27,36-60` |

**Consequence — the decision, and it is a real fork.** AC9 has exactly two routes and only one of them fits
this tier. §2.8.2 states both and takes **Path B**:

- **Path A — feed the nine canvases.** Nine new producers for nine analysis payloads, plus, for
  `code_diff`, a second code artifact and a differ that does not exist. This is the content pipeline that
  **cannot be done small**, and it is a product feature (proof composition), not a repair. Stated plainly
  as instructed rather than attempted quietly.
- **Path B — the review renders artifacts the way the product renders artifacts.** The ExaminePane's body
  becomes `<ArtifactPreview data={artifact} sanitizeHtml={sanitizeHtml} showTitle={false} />` — one
  expression, one shipped component, the exact call `ArtifactPermalink.tsx:121` already makes. The nine
  canvases then have no consumer and are deleted (~4,900 lines).

**Path B is what BA2 builds**, because it satisfies the founder's stated goal — a review shows the real
thing, not a stub — at this tier and today. **The canvas deletion is the one call §9 hands back**: it is
large, it is irreversible in this package, and the founder may value the aspiration those files encode.

**AC10 and the e2e gap.** Revision 6 found the two verdict specs on the known-failing exclusion list. It
missed the more useful half: the default Playwright lane **runs vite only, with no API server, and mocks
every `/api/*` route** (`playwright.config.ts:6-10`) — so a green spec there would be the hand-fed
fixture the founder rejected, in a browser. The repo already solved this three times: `ah1`, `ah5` and
`ah6` each have their own config that boots the **real Hono API on a migrated PGlite database**, their own
`testMatch`, and **no `grepInvert`** — untouched by the exclusion list. §6 adds a fourth in that family.
It also fixes what would otherwise repeat the debt: **none of the three existing AH lanes is run by
anything** — not `verify:release`, not any CI job — so the new one is wired into `verify:release`
alongside the harness lane. Proof is read from the DOM and reported in prose; no screenshots are planned.

**Tasks.** T4d (the artifact chain, server side), T4e (the review renders artifacts; the canvas
deletion), T4f (the end-to-end lane). §5.

**Also corrected here, from the tree:** §2.1 and T1 said `totals.tables` "stays 37". It does not — T1 adds
three and T12 drops three, in different phases, and `governance-registry.ts:163` asserts the number
against the live schema on every lint run. The committed registry now reads 40; T12 must take it back to
37 with its drop migration.

---

## Revision 6 — AC8: the review surface audited, and the minimum that makes it work

Founder ruling 11 widened the package at the concept gate: *"part of this workpackage is also to make
sure that the review screens actually work and are accessible."* That is AC8. Revisions 1–5 repaired
only the entry point BA2 itself breaks (a task-hosted review the page cannot open). This revision
audits the review surface as a whole and decides, item by item, what BA2 repairs and what it
deliberately does not.

**"Accessible" is read as reachable and usable** — a human can get to a review and act on it — per
ruling 11's own statement. **Not** assistive-technology accessibility. Nothing below does keyboard or
screen-reader work, and no item in the inventory forced that reading. §9 asks the founder to confirm.

**Method.** The `hyperidle-trace` MCP tools were again unavailable in this session; every "this is the
only X" claim was established by enumerating with `rg -a` and reading each hit. Four claims were also
**executed** against the real components in the core-ui vitest project — the results are recorded as
F41–F44 in `feasibility.md`, and each is the red state of an assertion §6 now names.

**Line-number caveat.** `layers/core-api/src/routes/reviews.ts` is being edited concurrently in this
worktree by T1 (the `adjudicateAction` / `attachClearanceToReview` routes). Every citation of that file
in revision 6 and in F41–F50 is against the **current** file; citations of it in revisions 1–5 and in
§2.11 predate that edit and read about eight lines low. Nothing about the findings changes — resolve by
symbol, not by line, if they disagree.

**What the audit found that revisions 1–5 did not.** The entry point was not the surface's only break,
and it was not the worst one.

| # | Finding, proven | Consequence |
|---|---|---|
| **A1** | **The review page crashes on every real review.** The loader returns the review message payload verbatim (`routes/reviews.ts:115-119`), which is `ReviewPayload` — `{title, reasoning, artifactRef}` (`thread.ts:199-203`). `ReviewComposition` dereferences `subject.artifacts.find` (`ReviewComposition.tsx:768`), `subject.conversation.filter` (`:790`), `s.tools.map` (`:249`), `s.intent.filter` (`:436`), `s.resultKpis.map` (`:445`), `s.needs.length` (`:476`), `s.artifacts.length` (`:575`) — none of which exist. **Executed (F41): `TypeError: Cannot read properties of undefined (reading 'find')` at `ReviewComposition.tsx:768`, rendered body `<div />`.** In the app the shell's `ErrorBoundary` (`AppShell.tsx:669`) paints "Something went wrong". | §2.8.1 **A** — the loader composes a complete subject, and the page guards. Bigger than the entry point: the entry point BA2 was fixing led to a crash. |
| **A2** | **A hardcoded checkout mock renders on every review.** `ReviewComposition.tsx:450` renders `<CheckoutProof />` unconditionally inside `ResultSection`; `CheckoutProof` (`:346-352`) → `CheckoutCard` (`:355-414`) draws "SPRING24", "$120.00", "Promo (SPRING24) −$24.00", "This code expired on Apr 3." **Executed (F42): both strings present in the rendered DOM of the shipping route.** | §2.8.1 **C** — deleted. A human reviewing their own work is shown a fabricated e-commerce receipt. |
| **A3** | **A review renders as a blank row on the Task and Bet pages.** `WorkTask.tsx:342` and `WorkBet.tsx` mount `HostThreadSection`, which renders `CommentRow` with no rich slots (`HostThreadSection.tsx:261-266`); `CommentRow`'s body switch returns `null` for `type:"review"` (`CommentRow.tsx:209-212`). Sender header and timestamp, empty body. | §2.8.1 **C** — the body renders the review's title. Text only; reaching the review still happens through the conversation, per ruling 8. |
| **A4** | **"Inspect review" renders unconditionally and silently does nothing.** `ReviewResolvedPart.tsx:49-63` has no `canOpen` gate — unlike `ReviewRequestPart.tsx:63`. On a task host `open-handler.ts:115` returns. **Executed (F43): the button is present and the click produces zero navigations.** | §2.8.1 **B** — closed by the route change, which removes the betId condition entirely. A dead visible button is worse than a missing one. |
| **A5** | **Nothing tells the human that a verdict was refused, or that it landed.** `postVerdictHostMessage` returns `"forbidden"`/`"race"` (`host-threads.ts:147-150`) and `ReviewPage.tsx:191` discards the return; a 400 throws and `handleSubmitVerdict` has no `catch` (`:173-197`). And the loader never returns a verdict, so `ReviewComposition.tsx:770`'s `resolved` stays false — after a successful approve the page looks identical. | §2.8.1 **A** — the loader returns the verdict; the page reads the outcome. The plan's own constraint forbids reproducing silent failure. |
| **A6** | **A review reaches no human when `submit_review` creates the thread.** The create branch seeds participants `[ctx.agentId]` (`tool-definitions.ts:633-638`), and the thread list is participant-scoped (`threads.ts:807-824`). The precedent for the fix is nine lines up in the same file: `create_item` resolves recipients and merges them (`tool-definitions.ts:450-467`). | §2.8.1 **A** — §2.8 step 2's "seeding the human as a participant" is made concrete by naming that precedent. |
| **A7** | **The loader serves any message id, including a questionnaire.** `routes/reviews.ts:101-105` checks existence, not type — and `part.ts:411` gives a resolved **questionnaire** a `reviewTarget`, so `ReviewResolvedPart` offers "Inspect review" for one. | §2.8.1 **A** — one line: a non-review message is a 404. |

**The route changes shape, and that makes T4b smaller.** `/work/bet/:betId/review/:reviewId`
(`router.tsx:89`) names a bet that a BA2 review does not have. Once the loader returns the review's own
thread (which revision 5 already required), the page needs no host in the URL at all. **The route
becomes `/reviews/:reviewId`**, and with it `ReviewTarget.betId`, the `canOpen` gate, the page-supplied
`betId` context and `ReviewPage`'s `betId` param are all **deleted** rather than widened. This
supersedes T4b's step 0 ("widen `ReviewTarget` to carry the review's host"), which revision 5 named as
the fix — it is strictly more moving parts than removing the condition the URL created. §2.8.1 **B**.

**What is deliberately not fixed, with the reason.** The nine canvases never render with real data and
BA2 does not change that (§2.8.1 **D**); the notification path is item-driven and an agent-raised review
raises none; the assistant overlay and the session view are not review entry points and are untouched;
the empty "Needs you (0)" sections are honest, not broken. §2.8.1 **D** lists each with its evidence.
§9 hands the founder the three of these that a founder might reasonably overrule.

**Tasks.** T4b is rewritten around the smaller route. **T4c is new** — two render repairs (A2, A3) in
files T4b does not touch, so it runs in parallel with everything. **§6 names three assertions for AC8**,
at three different seams, each red today and none sufficient alone — §6's own note explains why one
`Conversations`-level test would repeat revision 5's mistake at a higher altitude.

---

## Revision 5 — the last hop of the entry point, and the throw nobody sees

r4 blocked on two findings, both inside revision 4's own new material, both closed by editing sections
that already exist. No new mechanism, no new table, no new seam, no new scope. Three founder rulings
(§8–§10) also landed and are applied.

| # | Was | Now |
|---|---|---|
| **BLK-1** | §2.8/T4b named the loader, `ReviewPage`, the route and `open-handler` — **none of the three files that gate the render**. Verified: `PartList.tsx:44-46` computes `canOpen = (betId != null && betId !== "") \|\| part.reviewTarget.betId !== ""`, and both disjuncts are false for every BA2 review (`Conversations.tsx:480` sets `reviewBetId` to `null` for a task host; `parts/part.ts:375` builds `{ betId: "", reviewId }` unconditionally; `ReviewTarget` at `:102-106` has no field a task host could travel in). `ReviewRequestPart.tsx:63` renders the button only `{canOpen && …}`, so `open-handler` is never reached. | §2.8 fix list extended to the gate; T4b's file list extended; §6's assertion moved **up** from a `ReviewPage` component test to a `Conversations`-level one, where the button either appears or does not. |
| **BLK-2** | §2.5.1's cannot-resume branch covered two *predicates* only. A **throw** in the bake or the intent record was uncovered — and the neighbouring precedent at the same post-commit site is explicitly throw-on-failure (`threads.ts:1477-1485`'s own `@lore`), while the browser converts only 409/403 into values (`host-threads.ts:147-150`) and `handleSubmitVerdict` has no `try`/`catch` (`ReviewPage.tsx:173-196`), so the human sees an unchanged page. | §2.5.1: the post-commit block is wrapped and **any** failure — predicate or thrown — takes the same cannot-resume branch, with the POST still returning success. One service-lane assertion added. |

**Founder rulings applied.** §8 — no design pass; the review shows up in the thread the human is
already in, and the entry point is an existing affordance needing a conditional. §9 — a decline resumes
the agent and carries the reasoning back: **confirmed**, no longer an assumption; `requirements.md`
updated in place. §10 — the heartbeat is accepted on simplicity, recorded as a deferred decision; §9
keeps what it does not catch stated plainly and keeps the escalation path named.

**§9 now has no open founder questions.**

Non-blocking N-1…N-8 folded in.

---

## Revision 4 — the approval half moves onto the path the browser actually uses

r3 blocked on four narrow findings, all reproduced at the code (F31–F35). The coordinator also lifted
the ban on `superseded/feasibility.md` as a **fact source** — its concept stays dead, but it is an
accurate `path:line` audit of the current tree, and it had r3's BLK-1 right as its own findings B1/B2.
Reading it surfaced a fifth fact that neither critique reached and that is worse than BLK-1 alone.

| # | Was | Now |
|---|---|---|
| **BLK-1** | The clearance and the resumption hung on `POST /:threadId/messages/:messageId/verdict`. Verified: **zero production callers** — every `/verdict` hit in the tree is a test, a doc or an eslint fixture. The browser posts `type:"verdict"` to `POST /api/threads/:id/messages` (`host-threads.ts:132-150`, whose own `@lore` at `:125-130` says so), and that branch throws the decision away: `void decision; // will be used by Task 8 implementation` (`threads.ts:1535-1537`). | **Re-anchored on the live path.** §2.5.1 replaces `void decision` in the messages route. `/verdict` is AL7's, is dead, and joins the phase-4 delete list. The authz difference is now a stated decision, not an accident. |
| **BLK-1b (new — found via `superseded/feasibility.md`)** | Worse than r3 stated. **There is no in-thread verdict control at all.** `ThreadShell`/`RichMessageCard` — the only verdict toolbar — has exactly one production mount, `AssistantOverlay.tsx:480`; the conversation removed it deliberately (`Conversations.tsx:9-21`: *"the conversation no longer TAKES a verdict… The decision UI lives on the review page"*). And the review page is reachable **only from a bet-hosted thread** (`Conversations.tsx:480`; `open-handler.ts:107-118` returns early when betId is null), and its approve button cannot fire even then (`ReviewPage.tsx:131-132` derives the host from `subject?.taskId ?? subject?.betId ?? ""`, and the loader returns a payload carrying neither). | §2.8 rewritten. §2.5's claim that no new surface is needed is **retracted**. BA2 moves reviews to task threads, so BA2 makes the review page reach a task-hosted review — the BA track's own ownership rule. AM1's decision (decision UI on the review page, not in the conversation) is **not** reopened. |
| **BLK-2** | §2.5.1 added route scope to fix "two rendered buttons 400 today". Verified false on the reachable path: the live route validates through `verdictPayloadSchema`, whose `decision` is `z.enum(VERDICT_DECISIONS)` — **all five work today** (`threads-schema.ts:166-170`). The three-value enum is on the route nothing calls. | **Scope struck.** The diagnosis is corrected rather than carried forward. All five decisions are mapped in §2.5.1 because all five arrive, not because anything is broken. |
| **BLK-3** | The re-keyed resolver read `messages`, owned by `conversation`, from inside `review` — which has `@hyperidle/conversation` as a **devDependency only** (`review/package.json:20-26`). | Declared. `getReviewMessage` is an injected dep in the shape `getTaskById`/`getBetById`/`resolveOrCreateCallingThread` already use; the read itself is done by core-api **layer** code, which already imports `@hyperidle/conversation` (`routes/reviews.ts:6`). Same answer for §2.10. |
| **BLK-4** | `ReviewPayload.taskId` required. Verified regression: `reviewPayloadSchema` is the read-back arm of `messageRowSchema`, consumed by `rowToMessage` via `.parse()` (`threads.ts:593-596`), which **throws** — every pre-BA2 review row would fail to list. | **Optional**, with the fallback §2.5.1 already specified made reachable and real. The re-key's claim narrows from "all three always exist" to the truth. |

Non-blocking N-1…N-8 folded in, plus one thing no critique caught: **the harness lane's include list is
explicit** (`vitest.integration.config.ts:21-45`), and the new test file does not match
`*-real.integration.test.ts`. Unlisted, it falls into the service lane's `layers/**` include and
hard-fails CI where the binaries are absent — the lore at `:36-39` names exactly that failure.

---

## Revision 3 — the liveness proof is a different mechanism now

§2.7 failed critique twice across three placements. Each repair moved the defect instead of removing
it, so revision 3 stops repairing the placement and **changes the mechanism**, on the coordinator's
instruction. Four of the five r2 blockers were attacks on machinery that no longer exists.

**Honest finding first, because it decides the shape.** A *per-session* dead-gate alarm is **not
constructible on the `review` side**, and I could not find a construction that works. The fact such an
alarm needs — *which harness ran this session, and was a shim provisioned for it* — is owned by
`run-orchestration` (`HarnessCapabilities`, `agentRunConfig`) and never crosses into core-api. Without
it, "this session never pinged" and "this session was never gated" are the same observation, which is
exactly the cry-wolf BLK-2 names. Every version that tried to close that gap had to make orchestration
carry or read something, which is BLK-1. **So the per-session alarm is dropped, not relocated.**

What replaces it is smaller, is genuinely review-side, and is the thing the plan's constraint actually
asks for — see §2.7.

| r2 # | Was | Now |
|---|---|---|
| **BLK-1** | The liveness flag was read off the bridge entry at teardown. Verified: `closeMcpBridge` runs at `provisioner.ts:1577`, **before** every `transitionRun` (`:1606,1658,1685`), so the entry is already deleted (`mcp/index.ts:44-47`); and `openMcpBridge` returns `{token,url}` only (`provisioner.ts:253-263`) with no accessor to add. | **Removed.** Nothing is read off the bridge. `run-orchestration` is not involved in the liveness proof at all — no field, no accessor, no port, no read. |
| **BLK-2** | Silence conditions tested `"none"` while task-free sessions reported `null`, and two live `session_ended` producers (`runtime-reapers.ts:196-208`, `session-store.ts:206-217` — both verified) set neither field. | **Removed.** The mechanism posts nothing, per session or otherwise, so there is nothing to cry wolf with. |
| **BLK-3** | Claimed a compiler forcing function on a per-adapter `actionGate`. Verified false: `returnEnforcementChannel` is **optional** (`cli-harness-adapter.ts:121`), **all four CLI harnesses share one `getCapabilities`** (`:947`) with a `?? deriveCliChannel(...)` fallback (`:959-960`), and `remote-harness-adapter.ts:207-223` (registered at `boot.ts:198-199`) was missing from my site list. | **Removed.** There is no per-harness declaration anywhere now. The only thing that says "this harness is gated" is a heartbeat from a live shim — nothing to forget and nothing to go stale. |
| **BLK-4** | Asserted resumption on every approval and "nothing new is built". Verified impossible: `resolveReengagementRequest` is keyed on a proposed-call id (`proposed-call-workflow.ts:299-370`), `agentSessionRequests.sourceId` is `notNull` (`schema.ts:292`), and `proposedCallSessionRequestInputSchema` requires `proposedCallId: z.string().min(1)` (`session-request.ts:95-104`). The day-one flow has no such id. | **Re-keyed on the review message id**, which always exists on a verdict. §2.5.1/§2.9 rewritten and **"nothing new is built" retracted** with the new parts listed. |
| **BLK-5** | Every named check on §2.7 asserted silence, so a subscriber that did nothing passed all of them. | §6 now names **positive** per-harness evidence: the heartbeat advances on a live gate, and does **not** advance on a really-broken one while the gated action goes through. That second assertion is a real dead gate, detected. |

Non-blocking N-1…N-6 folded in; each marked in place. N-4 in particular **restores** `requirements.md`'s
recorded decline assumption rather than reversing it, and flags the consequence for the founder.

---

## Revision 2 — what changed after the first critique

> **Historical record. Rows B1 and B2 below describe machinery revision 3 deleted** — the
> `session_ended` fields, the `actionGate` capability, the silence conditions and the
> gate-unproven subscriber are all gone. Read §2.7 for the design; this block only records what
> was tried. B3–B6 are still current.

All six blocking findings were reproduced at the code before being fixed; the evidence is in
`feasibility.md` F16–F21. Nothing the critique upheld was reopened, and scope did not widen.

| # | Was | Now |
|---|---|---|
| **B1** | §2.7 had `run-orchestration` read the rule list and write a thread. It has neither dependency nor port for either, and §2.6 argued the opposite position one section earlier. | §2.7 rewritten. `run-orchestration` reads **one boolean off an in-process runtime object it already queries in the same function** and carries it on the `session_ended` event it already emits. Every domain read and the thread write move to a new **core-api layer** subscriber. Zero orchestration reads, no new event. §2.6's reasoning restated so both sections argue one position. |
| **B2** | The only silence condition was "empty rule list", so builtin and every not-yet-shimmed harness would alarm on every session. | Three silence conditions, the decisive one **self-scoping**: a non-optional `actionGate` channel on `HarnessCapabilities`, beside `returnEnforcement`. `"none"` ⇒ silent. builtin declares `"none"` permanently, and each phase-3 task flips its own harness's value in the same commit as its shim. |
| **B3** | §2.8 assumed the verdict bar renders. Without `artifactRef`, `submit_review` posts a **plain** message and there is no verdict control — the agent would be permanently blocked with nobody told. | `clearsRuleId` present ⇒ `artifactRef` required, enforced in the input schema. No clearance is ever stamped from a plain message. §2.8's claim corrected. |
| **B4** | Approving a review with no clearance was undefined; the inherited route silently returns `{ok:true}`. That is the founder's day-one flow. | **Approval resumes the agent whether or not a clearance is attached.** The clearance, when present, rides along. If resumption is impossible the human is told in that thread. The silent branch is deleted. |
| **B5** | The live `session_ended` liveness net was in neither list and both its tables are deleted. | It **survives, re-keyed**, and moves into the same core-api subscriber as B1's check. Its surfacing improves: a thread message instead of a row only visible on the review page. |
| **B6** | Prescribed adding `XDG_CONFIG_HOME` to `envAllowlist` — which forwards the operator's own value and *is* the leak. | Injected per session into `resolvedEnvMap` in the adapter body, the `CODEX_HOME` shape the repo's own `@lore` prescribes. Never in `envAllowlist`. A harness-lane assertion on the resolved config added. |

Non-blocking N1–N9 are all folded in; each is marked in place.

**One point I am flagging rather than asserting away.** The coordinator cited the ruling that
orchestration is a blind executor "with the push/event variant also rejected". §2.7 adds **two additive
fields to `session_ended`, an event `run-orchestration` already emits**, derived from an object it
already queries in the same function — it does not introduce a new event, a new push, or a read. The
sanctioned precedent for exactly this is `routineRunOutcome` (`framework/event-bus/src/events.ts:166-178`),
whose own comment says it is carried for "the core-api subscriber
`routine-run-session-end-reactions.ts`, the literal replacement for `run-orchestration`'s deleted
direct `routineRuns` write". §2.7 also *cannot* be done without carrying something: the subscriber
needs to know which harness ran, and `agentRunConfig` is owned by `run-orchestration`
(`tools/governance/table-owners.json`), so core-api may not read it. If the ruling forbids even an
additive field on an existing event, say so and the fallback is in §2.7's own note.

---

## 1. What is actually there today

Verified by reading, not by shape.

| Claim | Evidence |
|---|---|
| The review product is real and large | `layers/core-ui/src/pages/review/canvas-registry.ts:20-30` (nine canvases); `submit_review` at `layers/agent-orchestration/tool-handlers/src/tool-definitions.ts:596-664`; the review page at `core-ui/src/pages/review/ReviewPage.tsx`; the review message type and verdict grammar at `framework/domain-model/src/thread.ts:35-44`. |
| **CORRECTED — `POST /:threadId/messages/:messageId/verdict` has zero production callers** | Revisions 1–3 claimed it had "a real UI caller". False. `rg -an "/verdict"` over the tree returns only tests, docs and one eslint fixture. The browser's only verdict call is `postVerdictHostMessage` (`core-ui/src/services/host-threads.ts:132-150`), which POSTs `type:"verdict"` to `POST /api/threads/:id/messages`; its `@lore` at `:125-130` says exactly that. **That live branch discards the decision:** `void decision; // will be used by Task 8 implementation` (`threads.ts:1535-1537`). (r3 BLK-1; also `superseded/feasibility.md` B1/B2.) |
| **CORRECTED — there is no in-thread verdict control** | `RichMessageCard`'s toolbar (`RichMessageCard.tsx:377-396`) is mounted only by `ThreadShell`, whose sole production mount is `AssistantOverlay.tsx:480`. `Conversations.tsx:9-21` removed it deliberately: "`ThreadShell`/`RichMessageCard`/inline-verdict are GONE from the conversation… The decision UI lives on the review page." `HostThreadSection.tsx:255-266` renders `CommentRow`, which returns null for `type:"review"`. (r3 BLK-1b.) |
| **The review page is bet-only and its approve button is dead** | `Conversations.tsx:480` — `hostKind === "bet" ? hostId : null`, its own comment conceding a task host "no-ops"; `open-handler.ts:107-118` — `if (betId === null) return;`; `ReviewPage.tsx:131-133` derives `hostId = subject?.taskId ?? subject?.betId ?? ""` while the loader returns a payload carrying neither (`routes/reviews.ts:166-169`), so `handleSubmitVerdict` returns on its first line (`:173-176`). Only the `"rev-1"` fixture makes it appear to work. (`superseded/feasibility.md` E1/§7.1/§7.6.) |
| The live verdict branch already authorizes | `threads.ts:1362-1373` — `resolvesMessageRow.threadId !== threadId` → 400; then `senderAgent?.role === "founder"` and non-self-verdict, else 403. Stronger than the dead route's `authorizeWrite`, which does not enforce participation for a `bet` or `task` host (`auth/access-boundary.ts:32-40,61-79`). |
| All five verdict decisions reach the live route | `verdictPayloadSchema.decision` is `z.enum(VERDICT_DECISIONS)` (`threads-schema.ts:166-170`), reached via `messageInputSchema`'s verdict arm (`:186-190`). The three-value enum is on the dead route (`threads.ts:1591-1594`). (r3 BLK-2 — revision 3's "two buttons 400 today" was false.) |
| `@hyperidle/review` cannot import `@hyperidle/conversation` | `layers/core-api/review/package.json:20-26` lists it under **devDependencies**. `messages` is owned by `conversation` and ownership covers reads. (r3 BLK-3.) |
| `reviewPayloadSchema` is the read-back arm too | `messageRowSchema`'s review union member (`threads-schema.ts:218-221`) → `rowToMessage`'s `.parse()` (`threads.ts:593-596`), which **throws**. A required new field breaks every pre-BA2 review row. (r3 BLK-4.) |
| The harness lane's include list is explicit | `vitest.integration.config.ts:21-45`. A new file that does not match `*-real.integration.test.ts` must be listed, or it falls into the service lane's `layers/**` include and hard-fails CI where the binaries are absent — the lore at `:36-39` names that failure. |
| `submit_review` anchors to the **bet** | `tool-definitions.ts:618-620` resolves the task's `betId` and calls `getFirstThreadByHost("bet", betId, …)`; `:634` creates `{hostKind:"bet", hostId: betId}`. Contradicts D6/D7. |
| **Without `artifactRef`, `submit_review` posts a `plain` message** | `tool-definitions.ts:642-657` — the `review` branch is taken only `if (input.artifactRef)`; the else branch writes `type:"plain"`. `artifactRef` is optional (`:593`). The verdict toolbar renders under `if (isReview)` (`RichMessageCard.tsx:377`) and `isReview` requires a `review`-typed message with a valid payload (`:318`). **A plain review request has no approve control.** (B3.) |
| Nothing production reads `submit_review`'s returned `betId` | `rg -a "submit_review"` over the tree returns docs, tests, and `framework/harness-protocol/src/harness/return-actions.ts:33`, which names it as a return action, not a caller. No consumer of the return value. |
| **The AL7 capture machinery is production-dead** | The whole router is gated on `options.sessionWorkflow` (`tool-handlers/src/tool-registry.ts:86`). Complete enumeration outside `__tests__`: `framework/harness-protocol/src/harness/harness-adapter.ts:129`; `run-orchestration-composition.ts:332`; `runtime.ts:450`; `contracts.ts:49,257`; `provisioner.ts:304,321,789,1195,1211,1469`; `tool-registry.ts:86,91`; `tool-types.ts:139` — every one a type or a pass-through, **no constructor**. (N8: the first revision's list was short by four; the conclusion is unchanged.) The only production `runSession({mode:"durable"})` site is `run-orchestration/src/start-runtime.ts:164-171` and it passes none. Therefore `proposedCalls` / `tailoredGrants` / `operationOutcomes` are never written in production. |
| `docs/process-layer/staged-operation.md` is wrong about its own code | `:14` states "The only `sessionWorkflow` producer in production is the session-2 grant path (the task dispatcher, wired in `service-bootstrap.ts`)". `rg -a "sessionWorkflow" layers/core-api/src/service-bootstrap.ts layers/core-api/src/services/*.ts` → zero hits. There is no producer at all. |
| The **reengagement** machinery is live and correct, but **nothing production reaches its trigger** | `routes/threads.ts:1653-1697` (approve → `transitionProposedCall({to:"granted"})` with the full emit-time bake) → `review/src/proposed-call-workflow.ts:299-370` → the intent queue → a new session. Every dep is wired at `service-bootstrap.ts:409`. **But its only entry is the uncalled `/verdict` route**, so the machine has never run in production. Revisions 1–3 said "live"; precisely, it is *complete and unreached*. §2.5.1 gives it a reachable entry. |
| **The `session_ended` liveness net is wired, and has never fired** (r4 N-7) | `service-bootstrap.ts:379` wires `registerReviewSubscriptions` (`review/src/session-review-creator.ts:34-66`), which subscribes `session_ended` → `handleUnconsumedGrantOnSessionEnd` (`proposed-call-workflow.ts:733-765`) → `applyLivenessRetry` (`:681-729`). Its trigger reads `tailoredGrants`, which nothing writes in production — so like `/verdict` it is **complete and unreached**, not "live"; revisions 1–4 overstated it the same way. The decision is unaffected: the subscription is real, the net is the only thing it does, and **both tables it reads are on the delete list**, so it can be neither deleted nor left. (B5.) |
| Approving a review with no proposed call does nothing, silently | `routes/threads.ts:1631-1636` — `if (!pcView) { return c.json({ ok: true }, 200); }`. (B4.) |
| D7's thread rule is already implemented | `layers/core-api/src/services/calling-thread-bindings.ts:44-80` — `resolveOrCreateCallingThread(db, taskId, agentId)` resolves the task's `hostKind:"task"` thread or creates one, idempotently, seeding the human and the agent as participants. |
| Nothing intercepts a session action, on any harness | `provision-return-hook.ts:61-85` writes only `Stop`-family artifacts, for `settings-claude` / `settings-codex` / `process-reengage` only. cursor-agent declares `returnEnforcementChannel: "none"` (`adapter-pool.ts:503`) and gets no file. |
| The bridge already carries a plain-HTTP hook adjudication route | `layers/agent-execution/harness-registry/src/mcp/mcp-route.ts:36-56` — `POST /api/mcp/:token/return-status`, Bearer = the session bridge token, token→sessionId via `bridgeRegistry.lookup`, mounted **before** auth middleware. |
| The bridge does **not** already carry per-session closures | `createMcpSession` returns `{token, sessionId, mcpServer, transport}` (`mcp-bridge.ts:163`) and retains neither `registry` nor `onToolCall`; `McpSessionRegistry.lookup` is typed to return `{sessionId}` (`mcp-route.ts:16-19`); `enforcementRegistry` is a separate process-level object created at `layers/agent-execution/src/boot.ts:162` and keyed by `sessionId`. (N2 — the first revision claimed this as an existing pattern. It is not; it is a widening of three declarations.) |
| No permission list exists in any scope | `rg -a "permission" layers/ framework/ applications/ tools/` returns only `adapter-pool.ts:441` (claude's `--permission-mode`) and unrelated file-mode matches. |
| `configurationOverrides` cannot hold per-team rules | `framework/db/src/schema.ts:1184-1209` — unique on `(kind, key)`, no team column. Its `tool` `enabled` field is BA9's row (ruling 2) and is untouched here. |
| `submit_review` is a return action | `framework/harness-protocol/src/harness/return-actions.ts:33`. A blocked agent that raises a review satisfies the return gate and its session ends cleanly — the shape D1 needs. |
| **The MCP bridge is closed before the session-end emit** | `provisioner.ts:1577` (`closeMcpBridge`, with the comment "X2: Unregister the MCP bridge BEFORE calling endSession/crashSession") runs ahead of every `transitionRun` (`:1606,1658,1685`); `close` → `sessions.unregister(token)` → `active.delete(token)` (`mcp/index.ts:44-47`). And `openMcpBridge` returns `{token,url}` only (`provisioner.ts:253-263`). **Nothing can be read back off a bridge entry at teardown.** (r2 BLK-1.) |
| **`session_ended` has more producers than `transitionRun`** | `run-orchestration/src/runtime-reapers.ts:196-208` (`reapStaleRoutineSessions`, live) and `run-orchestration/src/session-store.ts:206-217` (`endSessionByCas`, latent) both emit it with no session context. Any scheme that requires a field on this event is wrong for those producers. (r2 BLK-2.) |
| **There is no per-harness capability forcing function** | `returnEnforcementChannel` is **optional** (`cli-harness-adapter.ts:121`); all four CLI harnesses share **one** `getCapabilities` (`:947`) filling it as `this.config.returnEnforcementChannel ?? deriveCliChannel(this.config.binary)` (`:959-960`). Production `HarnessCapabilities` constructors are three, not one: `builtin-harness-adapter.ts:347`, `cli-harness-adapter.ts:957`, `remote-harness-adapter.ts:207-223` (registered at `boot.ts:198-199`). `npm run check` cannot fail a per-harness omission. (r2 BLK-3.) |
| **Reengagement is keyed on an id the day-one flow does not have** | `resolveReengagementRequest(db, proposedCallId, deps)` (`proposed-call-workflow.ts:299-370`) loads the call *and its grant* and throws if either is missing; `agentSessionRequests.sourceId` is `text().notNull()` (`schema.ts:292`); `proposedCallSessionRequestInputSchema` requires `sourceCorrelation.proposedCallId: z.string().min(1)` (`session-request.ts:95-104`). An approval with no clearance has no id to key on. (r2 BLK-4.) |
| `envAllowlist` **forwards** from the host, it does not inject | `cli-harness-adapter.ts:314-329` — `for (const key of allowlist) { env[key] = process.env[key] }`, then `resolvedEnvMap` is applied over it. The repo's own rule: "`CODEX_HOME` must NOT be in `envAllowlist` (it is injected here, not forwarded from `process.env`)" (`:522-525`), with the injection at `:526-533`. (B6.) |
| A `z.object` payload schema **strips** unknown keys on read-back | `routes/threads-schema.ts:155-159` (`reviewPayloadSchema`) and the `@lore` at `:209-211`: "Using `plainPayloadSchema` here would strip the `toolCalls` field from messages written by the assistant agent." Any new `ReviewPayload` field must be added to that schema or it silently disappears. |

**Reconciliation.** Nothing in `plan.md` names a symbol that does not exist in the assumed shape. The
one correction to the plan's own account of the world: the machinery it describes as existing is
**already unreachable in production**, which makes phase 4 a deletion with no behaviour to preserve —
with the single exception of the `session_ended` liveness net, which is live and is preserved (§2.10).
No plan amendment is proposed.

---

## 2. The decided shape

### 2.1 Ownership — `review` owns the rules and the clearances

**Three** new tables, all owned by **`review`** (`layers/core-api/review`, `@hyperidle/review`), reads
and writes, no exceptions.

**`totals.tables` goes 37 → 40 → 37, and the two hops are in different phases (corrected — revision 6).**
Revisions 1–5 said it "stays 37" because the three added tables offset the three deleted ones. The
offset is real but not simultaneous: T1 (phase 2) **adds** three, and T12 (phase 4) **drops**
`proposedCalls` / `tailoredGrants` / `operationOutcomes`. `governance-registry.ts:163` asserts
`registry.totals.tables === liveTables.size` on every lint run, so the number must move **twice**.
Verified in the tree: the committed `table-owners.json` now reads
`{"tables": 40, "owned": 40, "unowned": 0}` with 40 owner rows, the three new ones present and the three
doomed ones still there — the T1 builder checked the rule rather than following this document, and was
right. **T12 must take it back to 37 in the same commit as the drop migration**, or the lint fails there
instead. (Revisions 1–3 additionally said 37 → 36 and listed only two tables, which contradicted §2.7's
own "third and last table"; r3 N-1 fixed the count and this fixes the arithmetic.) Every one needs its owner row: the file's
note says a table absent from it is a build error.

```
teamActionRules       → "review"
actionClearances      → "review"
teamActionGateChecks  → "review"
```

**Why `review` and not somewhere else.** The rule is the thing that *produces* a review; the clearance
is a rider on that review's approval; and AC5's invariant ("only if it was blocked") relates the two.
Split them across services and the invariant lives in neither and every adjudication crosses two
service boundaries for one decision. `review` also already owns the reengagement resolver the approval
must drive, so the whole loop stays inside one service's typed API.

**Why not `org`.** `org` owns `teams`. A permission rule is scoped *by* a team, not a fact *about* one
— the same relationship `filesystems` has to teams, and `filesystems` is its own owner.

**Why not `settings`.** `configurationOverrides` is globally keyed (`schema.ts:1202`) with no team
column. Adding one changes the uniqueness contract of the surface BA9 owns.

**Why not a new package.** Nothing here needs a boundary the existing one does not draw.

Everything outside `review` reaches these tables through typed functions on its barrel; everything
outside the `core-api` layer reaches them through `CoreApiPort.review` — the seam that exists today at
`framework/api-contract/src/core-api-port.ts:757-761`, whose three capture ops BA2 replaces with two.
No new HTTP seam.

### 2.2 What a rule can express

One row. Nothing else.

| column | type | meaning |
|---|---|---|
| `id` | text pk | the identity carried into the review and back. Server-minted, short, quotable by a model. |
| `teamId` | text → `teams.id`, `onDelete: cascade` | whose list it is. |
| `label` | text | what a human called it — "Merge to main". Shown in settings, named in the deny message and in the review. |
| `actionKind` | text, `'shell' \| 'file_write'` | which subject the pattern is matched against. |
| `pattern` | text | wildcard: `*` = zero or more characters, `?` = exactly one, everything else literal. |
| `createdAt`, `createdByUserId` | text | provenance. |

- **`shell`** matches the full command string the harness reports; **`file_write`** matches the
  absolute path being written.
- **No regex.** Wildcard is what opencode's own permission language uses (research §4) and is what a
  human can write. Implemented by escaping every regex metacharacter in the literal segments and
  anchoring — user input never reaches a regex engine unescaped.
- **No argument capture, no identity hash, no arg-pinning, no reversibility classification, no
  classifier.** D5 and "not a gigantic machinery"; each is a thing the superseded design had.
- **Multiple matches:** first by `(createdAt, id)` wins and is the rule the deny names.
- **r3 N-7 — ordering, because the deny path is the only place a clearance is ever born.** The
  `blocked` row **commits before the deny response is written**. If the write fails, the shim receives
  no deny and the action proceeds (fail-open, consistent with §2.3) — rather than the agent being
  blocked with no row, which would leave its review attaching nothing and show the human *"nothing
  matching it was blocked"*: a true sentence describing a false situation, with the agent looping.
- **Empty list ⇒ no rule matches ⇒ every action allowed.** AC1 holds by construction.

`actionClearances` is the block-and-clearance record. One row per (rule, task, agent) episode:

| column | meaning |
|---|---|
| `id` | pk |
| `ruleId` → `teamActionRules.id`, `onDelete: cascade` | which rule fired |
| `taskId`, `agentId`, `originSessionId` | who was blocked, doing what work |
| `state` | `blocked` → `cleared` → `spent`; or `blocked` → `declined`; or `cleared` → `abandoned` (§2.10 net) |
| `reviewMessageId` | set when the agent's review names the rule; nullable |
| `retryCount` | the liveness net's one retry (§2.10) |
| `blockedAt`, `clearedAt`, `spentAt` | timestamps |
| unique `(ruleId, taskId, agentId)` where `state='blocked'` | one open block per episode; a repeated block is idempotent |

`teamActionGateChecks` is the heartbeat record (§2.7). Primary key `(teamId, harness)`; columns
`lastSeenAt`, `lastSessionId`, `checks`. One bounded row per team per harness — it does not grow with
sessions and needs no cleanup.

**This is not capture.** No argument, no command text, no path is stored. Nothing in this row is ever
shown to a human as "the thing you are approving". The row exists so that "was this action blocked?"
has an answer after the session that was blocked has ended.

### 2.3 The hook contract

**One route, one wire shape, four shims.** The rule engine is HyperIdle's and runs server-side; each
harness-specific artifact only translates.

**Route.** `POST {mcpUrl}/action-check`, added to `mcp-route.ts` beside `/return-status`, registered
before the catch-all `ALL /mcp/:token` for the same Hono specific-path reason, mounted pre-auth like
its sibling. `Authorization: Bearer <bridgeToken>`; token→session via `bridgeRegistry.lookup`.

Request:
```json
{ "harness": "claude-code" | "codex" | "opencode" | "cursor-agent",
  "phase": "session-start" | "action",
  "action": { "kind": "shell", "command": "git push origin main" } }
```
`action.kind` is `"shell"` or `"file_write"` (`{"kind":"file_write","path":"/abs/path"}`).
`phase:"session-start"` carries no action.

Response, always `200` unless the token is bad:
```json
{ "decision": "allow" }
{ "decision": "deny", "ruleId": "r_7f3", "message": "HyperIdle team permission rule \"Merge to main\" (r_7f3) covers this action. It has not been approved." }
```
`401` on an unknown or expired token. Anything else, or an unreachable bridge, is treated by every shim
as **allow** — fail-open is deliberate (ETHOS: no wall built first).

**r3 N-2 — what §2.7 does and does not make visible.** It catches the *structural* class: a shim that
was never installed or never loaded, which is the class phase 1 proved silent (a missing `PreToolUse`
entry, codex without the trust flag, opencode under `--pure`). Those produce **zero** heartbeats. It
does **not** catch a failure that arrives *after* the session-start heartbeat has landed — a mid-session
bridge outage, or cursor's crashed hook — because the `(teamId, harness)` row already reads fresh.
Revisions 1–3 stated this generally; it is true only of the structural class. §9 records the gap.

**The deny message is a terse fact and contains no imperative** (ruling 6; research §4 — an instruction
in a tool result is what Sonnet twice refused as a suspected prompt injection). It names the rule id
verbatim so the agent can quote it back.

**Every shim skips HyperIdle's own MCP tools before it calls anything.** Names beginning `mcp__`,
`MCP:` or belonging to the `hyperidle` server are never adjudicated. Out of scope by plan; and on
cursor-agent a `preToolUse` rule that did not exclude `MCP:` would gate `submit_review` itself, the
tool the blocked agent is being pushed toward (research F6).

**All four shims are generated Node scripts** (`#!/usr/bin/env node`), written server-side into the
sandbox from server-minted values, exactly as `provision-return-hook.ts` already writes
`return-check.sh` (`:139-142`). Node, not `/bin/sh`: three of the four hook protocols require reading a
JSON object from stdin and writing one to stdout, which shell cannot do without adding `jq` to the
sandbox's dependencies.

**claude-code's `type:"http"` form is deliberately not used.** It is proven (research §3, run 8) and
removes a file, but it makes the *server's response body* claude-shaped, pushing one harness's decision
grammar into the one place that must stay harness-neutral. Recorded so nobody re-derives it as a saving.

| harness | artifact and where it is written | matcher | deny is expressed as | the gotcha that must be honoured |
|---|---|---|---|---|
| **claude-code** | a `PreToolUse` entry in the **same** `.claude/settings.json` object that already carries `Stop` (`provision-return-hook.ts:154-165`), pointing at `.claude/action-check.js` | `Bash\|Write\|Edit\|NotebookEdit` | `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"<message>"}}`; allow = exit 0, no output | `--permission-mode bypassPermissions` **stays** (`adapter-pool.ts:455-456`) — proven independent of hooks. Do **not** use the declarative `if` filter: the docs say it fails open on an unparseable command. Paths arrive already absolute. |
| **codex** | a `PreToolUse` entry in the `hooks.json` that `provisionCodexHome` already writes into the per-session `CODEX_HOME` (`provision-return-hook.ts:211+`, `:308-323`) | `Bash\|apply_patch` | `{"decision":"block","reason":"<message>"}`, exit 0 — the wire form `buildCodexReturnCheckScript` already uses (`:365-379`) | **`--dangerously-bypass-hook-trust` must keep being passed** (`cli-harness-adapter.ts:520-533`); without it codex runs the action with no hook, no warning and no event. `apply_patch`'s `tool_input.command` is the whole patch text — the shim extracts paths from its `*** Add File:` / `*** Update File:` / `*** Delete File:` lines. Never emit `permissionDecision:"allow"` or `"ask"`: 0.146.1 rejects them and then **continues the call**. |
| **opencode** | a gate plugin at `<sandbox>/.opencode/plugins/`, beside the existing one (`provision-return-hook.ts:392-436`); a **named export** returning a hooks object with `tool.execute.before` | in the plugin body | `throw new Error(message)` — reaches the model verbatim, loop continues | **`--pure` must be removed** from the spawn args (`adapter-pool.ts:355-368`) **and** from re-engage (`cli-harness-adapter.ts:825`), or the plugin never loads. In the **same** change, isolate the global config per §2.3.1. Never use `permission:"ask"` (it auto-rejects and ends the turn). |
| **cursor-agent** | a **new** `<sandbox>/.cursor/hooks.json`, next to the `.cursor/mcp.json` `writeCursorJson` already writes (`cli-mcp-config.ts:168-190`); read from the process cwd, which is the sandbox (`cli-harness-adapter.ts:559`) | `beforeShellExecution` (no matcher — match in the shim) + `preToolUse` matcher `^Write$` | `{"permission":"deny","user_message":"<message>"}` | **`user_message`, never `agent_message`** — the installed binary drops `agent_message`. **`failClosed: true` on every entry** — a crashed hook otherwise fails open silently. Never emit `"ask"` — headless it silently *allows*. `^Write$` deliberately excludes `MCP:` and `Read`; an edit fires an inner `preToolUse` with `tool_name:"Read"`, so a `file_write` rule must never be expressed as a Read rule. |

**opencode's config `permission` `deny` floor is deliberately not used.** It cannot carry our message,
and it would create a second rule surface to keep in agreement with the real one. Its only advantage is
surviving `--pure`, which is being removed.

**Not fixed here, and must not appear to be.** Removing `--pure` makes the existing `return-signal.ts`
plugin *load*, but its `export default { setup }` shape is not opencode's plugin API
(`provision-return-hook.ts:409-412`; research t7 proved `setup` is never called). opencode return
enforcement stays dead after BA2. Not BA2's row.

#### 2.3.1 Isolating opencode's global config — the correct lever (B6)

Removing `--pure` is the one new security exposure this package creates: it re-enables the operator's
own global opencode plugins, permissions and MCP servers inside the sandbox (research §5, proven —
the resolved config carried `file:///Users/…/.config/opencode/plugins/pipeline.js`).

**Set `XDG_CONFIG_HOME` per session by injecting it into `resolvedEnvMap` in the adapter body**,
pointing at a directory inside the sandbox that HyperIdle writes — the exact shape `CODEX_HOME` uses at
`cli-harness-adapter.ts:526-533`.

**It must NOT be added to `envAllowlist`.** `envAllowlist` is a forwarding list: `buildSandboxedEnv`
copies `process.env[key]` for each allowlisted key (`cli-harness-adapter.ts:314-329`), so allowlisting
`XDG_CONFIG_HOME` forwards the operator's own value — precisely the leak. `resolvedEnvMap` is applied
after the allowlist and therefore wins. The repo states this rule about itself at `:522-525`.

Note `XDG_DATA_HOME` **is** in opencode's `envAllowlist` (`adapter-pool.ts:384`) and is correct there:
callers set it deliberately for SQLite isolation. The two are different mechanisms; do not copy one for
the other.

**Evidence that the isolation holds** is a named harness-lane assertion, not an assumption — §6.

### 2.4 Where the decision is computed, and how it gets a database

`mcp-route.ts` lives in `agent-execution`, which holds no DB handle and may not import a `core-api`
service. It does not need to.

1. `run-orchestration`'s provisioner builds a session-scoped gate and hands it to the bridge at
   `openMcpBridge` (`provisioner.ts:1333-1354`), beside `toolRegistry` and `onToolCall`. It closes over
   `teamId`, `params.taskId`, `params.agentId`, `sessionId` — all in scope at `provisioner.ts:1181-1189`.
2. **N1 — the port member this needs, declared.** `SessionLifecyclePorts` (`provisioner.ts:417-478`)
   has no `coreApi` member and must not grow one. Instead `toolProvider` gains **one method**,
   `buildActionGate(session): ActionGate`, built in `buildToolProvider`
   (`run-orchestration-composition.ts:318-322`) from the `coreApiTransport` already in hand there —
   the same function and the same argument that builds `buildProposedCallWorkflowPort` today, which
   BA2 deletes. **One port member added, one deleted.** The first revision's "net new seams: zero" was
   true of the HTTP seam and false of the port; corrected.
3. The gate calls `CoreApiPort.review.adjudicateAction(...)` → `layers/core-api/src/routes/reviews.ts`
   → `@hyperidle/review`'s typed function. `review` is the only code that touches those tables.
   **r3 N-8 — `phase` rides this op.** Both `phase:"action"` and `phase:"session-start"` travel on
   `adjudicateAction`; the session-start heartbeat has no second seam op. Derivable from §2.3's wire
   shape, but never stated before, so it is stated here and in T1/T2.
4. **N2 — the declarations that widen. Four, not three (r4 N-4).** `openMcpBridge`'s own options
   object (`provisioner.ts:253-263`) must carry the gate before anything downstream can;
   `bridge.open`'s parameter (`mcp/index.ts:63-68`) must accept it; `createMcpSession`'s return
   (`mcp-bridge.ts:163`) must retain it; `McpSessionRegistry.lookup`'s return type
   (`mcp-route.ts:16-19`) must expose it. This is a widening, not an existing pattern — `enforcementRegistry` is a separate process-level
   object (`boot.ts:162`) keyed by `sessionId`, not something the token map carries. Stated plainly so
   the builder budgets for it.

`agent-execution` gains no DB, no `core-api` import, and no knowledge of what a rule is.

**The read must be live, per call** — a rule can be added mid-session and a clearance is spent
mid-session. Nothing on the adjudication path is baked at emit time.

**N9 — a session with no task is not gated.** When `params.taskId == null` (the assistant and
`knowledge_action` — `provisioner.ts:1306-1311`), **no gate is passed to `openMcpBridge`** and the shim
is provisioned with gating off, so it neither adjudicates nor heartbeats. Reason: with no task there
is no review and no clearance, so a block would strand the agent behind an instruction it cannot
follow — `submit_review` returns `NOT_FOUND` on an empty `ctx.taskId`, and nobody would be told. The
plan's "a session with no task is a modelling gap, not a case this bends for" licenses not bending; it
does not license leaving it unstated.

### 2.5 How a review names the action, and how approval matches it back

`submit_review` gains **one optional string field, `clearsRuleId`**, and one constraint.

- The deny message named the rule id. The seed prompt (§2.6) tells the agent to put it there.
- **B3 — `clearsRuleId` present ⇒ `artifactRef` required**, enforced in `submitReviewInputSchema` with
  a `superRefine`; violation returns `INVALID_INPUT` naming the missing field. Without an artifact the
  tool posts a `plain` message (`tool-definitions.ts:653-657`), which renders no verdict control
  (`RichMessageCard.tsx:318,377`) — the agent would be permanently blocked on a message nobody can
  approve, with nobody told. The agent is alive when it hits this and has `create_artifact`
  (`tool-definitions.ts:1404`) to satisfy it. This is also what D11 already says a review is.
- The handler stamps the **existing** `blocked` clearance row for `(clearsRuleId, ctx.taskId,
  ctx.agentId)` with the new `messageId`. **N3 — this is a second seam op**,
  `CoreApiPort.review.attachClearanceToReview(...)`; the handler is `tool-handlers` code and reaches
  core-api only through `ports.coreApi`.
- **No blocked row ⇒ no stamp**, and the tool result says so (`clearanceAttached: false`). The review
  still posts. **AC5 is structural**: no code path creates a clearance row except a real block, so a
  review naming an unblocked or invented action can never cause blocking, for anyone.
- **r2 N-3 — the human is told when nothing matched.** `clearanceAttached:false` reached only the
  agent, so a human could approve a review believing it cleared something and never learn it did not.
  The payload therefore carries `clearsRuleRequested?: string` **whenever the agent named a rule**, and
  `clearsRule` only when a block was actually stamped. The review surface renders one of two lines:
  *"Approving also clears: <label>"*, or *"The agent asked to clear `<id>`; nothing matching it was
  blocked, so approving clears nothing."* One optional field, one line of copy, and the silent case is
  gone.

**The review message carries what approval needs.** `ReviewPayload`
(`framework/domain-model/src/thread.ts:199-203`) gains `taskId: string` and optional
`clearsRule?: { ruleId: string; label: string }`. `clearsRule` is also what renders the "Approving also
clears: <label>" line.

> **Trap, stated because this repo has already been bitten by it.** `reviewPayloadSchema`
> (`routes/threads-schema.ts:155-159`) is a plain `z.object`, which **strips** unknown keys on
> read-back. The `@lore` at `:209-211` records exactly this happening to `toolCalls`. Both new fields
> must be added to that schema in the same change or they vanish silently between write and read.

### 2.5.1 The verdict — on the route the browser actually uses (r3 BLK-1/2/4)

**The live path, verified.** The browser never calls `/verdict`. `postVerdictHostMessage`
(`core-ui/src/services/host-threads.ts:132-150`) POSTs `type:"verdict"` to
`POST /api/threads/:threadId/messages`, and its own `@lore` at `:125-130` states that is the only
client verdict call. A repo-wide enumeration of `/verdict` finds tests, docs and one eslint fixture —
**no production caller.** The live branch resolves the review message and then discards the decision:
`void decision; // will be used by Task 8 implementation` (`threads.ts:1535-1537`).

**BA2 replaces that line.** Everything below hangs off the messages route, post-commit, after
`thread_resolved` is emitted (`threads.ts:1519-1537`) — so the verdict is durable before anything acts
on it. The `/verdict` route is AL7's, has no caller, and joins the phase-4 delete list (§2.11).

**Authorization — a decision, not an inheritance.** The live branch already requires
`senderAgent?.role === "founder"` and rejects a self-verdict (`threads.ts:1366-1373`), and rejects a
`resolvesMessageId` that is not in the posted-to thread (`:1362-1365`). BA2 **adopts that unchanged**.
It is strictly stronger than the dead route's `authorizeWrite`, which does not enforce participation
for a `bet` or `task` host — both are host-scope and `canWrite` returns true for any authenticated
principal (`layers/core-api/src/auth/access-boundary.ts:32-40,61-79`). Nothing new is written.

**All five decisions arrive, and all five are mapped (r3 BLK-2).** The live route validates through
`verdictPayloadSchema`, whose `decision` is `z.enum(VERDICT_DECISIONS)` (`threads-schema.ts:166-170`)
— so `approve`, `approve-with-comments`, `request-changes`, `edit` and `reject` all reach the handler
today. **Revision 3's claim that two of them 400 was false**: the three-value enum
(`threads.ts:1591-1594`) is on the route nothing calls, and the scope it justified is struck. The
mapping: `approve` and `approve-with-comments` are approving; `request-changes`, `edit` and `reject`
are not.

A verdict then does two independent things.

**1. Clear what is attached.** Approving: rows with `reviewMessageId = <that message>` and
`state='blocked'` move to `cleared`. Non-approving: they move to `declined`. None attached is a normal
outcome, not an error. Nothing is ever in `cleared` after a non-approving verdict, so the next attempt
blocks again (**AC7**).

**2. Resume the agent — on every verdict. Founder ruling §9, confirmed.** *"A decline tells the agent
why, and it may come back."* Previously an assumption the orchestrator took; now decided. The agent
cannot return on its own — it ended its session by calling `submit_review`, which satisfies the return
gate (`return-actions.ts:33`), so "later" has no trigger unless the verdict provides one. The resumed
prompt differs by decision. **AC7 still holds:** a decline clears nothing, so the gate still blocks and
the agent cannot perform the action. `requirements.md` is updated in place (its D12).

#### The resumption identity (r3 BLK-4 + r2 BLK-4)

Verified: `resolveReengagementRequest(db, proposedCallId, deps)` (`proposed-call-workflow.ts:299-370`)
loads a proposed call **and its grant** and throws if either is absent;
`agentSessionRequests.sourceId` is `text().notNull()` (`schema.ts:292`); and
`proposedCallSessionRequestInputSchema` requires `proposedCallId: z.string().min(1)`
(`session-request.ts:95-104`). The day-one flow has no clearance and therefore no such id.

**Key the resumption on the review message id**, which exists on every verdict by construction:

- source kind `proposed_call` → **`review_approved`**;
- `sourceId` = the review message id — satisfies `notNull`, and gives the idempotency key
  `verdict:<messageId>` so a double-clicked verdict resumes once;
- `sourceCorrelation` = `{ taskId, reviewMessageId, agentId }`;
- the resolver is re-keyed to `(db, reviewMessageId)`: load the message through the **injected**
  `getReviewMessage` dep (§2.5.2), read `taskId` from the payload, resolve the sender,
  `requireRunnableAgent`, then bake exactly as today. The clearance becomes an optional lookup used to
  name the cleared rule in the prompt, not the key.

**`taskId` is optional on the payload, so the fallback is real (r3 BLK-4).** `reviewPayloadSchema` is
the **read-back** arm of `messageRowSchema` (`threads-schema.ts:218-221`), consumed by `rowToMessage`
via `.parse()` (`threads.ts:593-596`) — which throws. A required `taskId` would break listing any
thread holding a review written before BA2. So: **`taskId`, `clearsRule` and `clearsRuleRequested` are
all optional**, pre-BA2 rows keep parsing, and no migration is needed. The re-key's correctness claim
narrows accordingly and honestly: `reviewMessageId` and `agentId` always exist; `taskId` exists on
every review BA2 writes (`submit_review` returns `NOT_FOUND` without one), and its absence — a pre-BA2
review approved after the upgrade — is exactly the fallback below.

#### When the resumption does not happen (r4 BLK-2, r4 N-1)

**The whole post-commit clear-and-resume block is wrapped, and every failure takes one branch.** Not
just the two predicates — *any* throw from the bake or the intent record lands there too. This matters
because of where the code sits: the neighbouring site at the same post-commit position is deliberately
throw-on-failure, stated in its own `@lore` (`threads.ts:1477-1485` — *"this handler throws (no
try/catch …), the caller sees a 5xx"*). A builder copying the neighbour would leave the verdict message
committed, the review resolved, the clearance possibly already `cleared`, the agent never resumed, and
**nothing written anywhere a human looks**.

The browser cannot rescue it either: `postVerdictHostMessage` converts only 409 and 403 into outcome
values and throws on every other non-OK status (`host-threads.ts:147-150`), while `handleSubmitVerdict`
has no `try`/`catch` (`ReviewPage.tsx:173-196`) and the page's `error` state is loader-only
(`:145-152`). The human clicks Approve and sees an unchanged page. That is
"approved-but-not-done", which AC6 forbids by name — and it is a state **BA2 creates**, since the line
being replaced is `void decision;` and cannot fail today.

So, in one branch:

- **A plain message goes into the thread the human approved in**, saying the verdict was recorded, that
  the agent could not be brought back, and why.
- **The verdict POST still returns success**, carrying a recorded-but-not-resumed outcome, so the page
  refreshes and shows the thread rather than swallowing a 5xx.
- The clearance stays as the verdict left it — `cleared` and unspent — so a later successful resume
  still works.

**r4 N-1 — the message is only posted for a review this feature created.** `taskId` is optional, so the
cannot-resume branch is also reachable for a review row that predates BA2 or came from another producer
(`tools/setup/src/demo-world/conversations.ts:410,595,764`, and any pre-upgrade `submit_review` row).
Approving one of those today does nothing; posting *"the agent could not be brought back"* would assert
something false about a review where no agent was ever waiting. The message is therefore gated on the
review having a BA2 origin — a clearance row, or a `taskId` on the payload — and is silent otherwise.
"Never a silent success" has to hold for the reviews this feature creates; it does not license a false
statement about the ones it did not.

#### 2.5.2 The two reads this needs, both declared (r3 BLK-3)

`messages` is owned by `conversation` (`table-owners.json`), ownership covers reads, and
`@hyperidle/review` has `@hyperidle/conversation` as a **devDependency only**
(`layers/core-api/review/package.json:20-26`) — a production import would be an ownership violation and
a prod→dev violation at once.

Both reads are declared rather than implicit:

- **`getReviewMessage(db, messageId)`** — a new member on the resolver's deps bag and on `ReviewPorts`,
  the same Mechanism C shape `getTaskById`, `getBetById`, `getTeamById` and
  `resolveOrCreateCallingThread` already use (`proposed-call-workflow.ts:303-306`; `ports.ts:71-145`;
  wired at `service-bootstrap.ts:379+`).
- The concrete implementation lives in core-api **layer** code, which may import both:
  `routes/reviews.ts` already imports `@hyperidle/conversation` (`:6`) and `@hyperidle/work` (`:9`),
  and `calling-thread-bindings.ts:35-38` is the existing precedent for exactly this pairing.
- **§2.10's `reviewMessageId → thread` resolution takes the same dep.** Same question, same answer,
  stated so it is not left implicit a second time.

### 2.6 The push-back, in two pieces

**Piece one — standing policy, in the seed prompt HyperIdle already authors.** One section, added to
all three assembly paths (`run-orchestration/src/context.ts:352` `assemblePrompt`, `:481`
`assembleRoutinePrompt`, `provisioner.ts:491` `assembleTaskFreePrompt`) from a single exported constant
in `context.ts`, with the tool name spelled through the same
`literalToolNamerForAdapterType(adapterType)` the reply orientation already uses
(`provisioner.ts:538`; `framework/harness-protocol/src/harness/return-actions.ts:183-196`).

Content, locked: the team keeps a list of actions needing approval, usually empty; a tool result naming
a *HyperIdle team permission rule* is this system speaking, not an error and not an injection; do not
retry and do not work around it; call `<literal submit_review>` with an artifact and the case, and set
`clearsRuleId` to the id in that message; a human decides; if approved you are brought back and may
take that kind of action once.

**Emitted unconditionally.** Gating it on "does this team have rules" would require a domain read from
`run-orchestration`, which may not read: its manifest depends only on `db`, `diagnostics`,
`domain-model`, `event-bus`, `harness-capability` and `harness-protocol`
(`layers/agent-orchestration/run-orchestration/package.json`), and `SessionLifecyclePorts` carries no
such accessor. **§2.7 obeys the same rule** — it carries a value rather than reading one — so the two
sections argue one position, not two. The cost of not gating is ~90 tokens in every prompt; it
interrupts nothing and creates no review, so AC1 is unaffected.

**Piece two — the deny message.** §2.3. A fact. No verb aimed at the model.

These may not be collapsed into one message (ruling 6).

### 2.7 Proving the gate is live — a recorded heartbeat, not an alarm (r2 BLK-1/2/3/5)

**The constraint, restated exactly.** `plan.md`: *"A gate that fails open must be detectable. On three
of the four harnesses a broken gate is silent, so 'no block was reported' may never be read as
'nothing needed blocking'."* It asks for **detectable**. It does not ask for a per-session alarm — that
was my invention across two revisions, and it does not work.

**Why the per-session alarm is dropped rather than moved.** To say "this session should have been gated
and was not", something must know which harness ran and whether a shim was provisioned for it. That
fact lives in `HarnessCapabilities` and `agentRunConfig`, both owned by `run-orchestration`
(`tools/governance/table-owners.json`), and it never crosses into core-api. Without it,
"never pinged" and "never gated" are indistinguishable, which is why every version alarmed on builtin,
on task-free sessions and on reaped sessions (r2 BLK-2). Making orchestration carry the fact is r2
BLK-1. **There is no third placement; there is a different mechanism.**

**The mechanism.** The gate's liveness becomes a *recorded fact* that the permission list displays, and
the sessions themselves are what record it. Nothing is emitted, nothing is posted, `run-orchestration`
is not involved at any point.

1. **Every shim heartbeats.** `phase:"session-start"` on the harness's own session-start event, and
   every adjudication (allow as well as deny). Both carry `harness`. These already cross the seam into
   `review` — no new channel.
2. **`review` records it, bounded.** One upsert per heartbeat into `teamActionGateChecks`, primary key
   `(teamId, harness)`: `{ lastSeenAt, lastSessionId, checks }`. **One row per team per harness** — it
   does not grow with sessions, needs no cleanup, and needs no reaper.
3. **The permission list displays it.** The settings screen that holds the rules renders, above the
   list, what has actually consulted it: *"Checked by claude-code 2 minutes ago · codex 1 hour ago"*
   and, for a harness that never has, nothing at all — with the empty case reading *"No agent session
   has consulted this list yet."*
4. **Nothing is posted to any thread by this mechanism**, ever. No per-session verdict, no silence
   conditions, no cry-wolf on builtin, on a reaped session or on a harness whose shim has not landed.
   Ruling 7's accepted consequence stays accepted: builtin simply never appears in the list of
   harnesses that have checked.

**Why this is detectable in the sense the constraint means.** The failure it exists to catch is: a
human sets a rule, believes matching actions now need approval, the gate is silently dead, and nothing
contradicts the belief. Under this design the surface where that belief is formed carries its own
evidence. A human who set a rule and sees *"Checked by claude-code 2 minutes ago"* with no codex line,
while their codex agents have been working all day, **can tell** — and that is precisely
"'no block was reported' is not readable as 'nothing needed blocking'". The reader is the human who
set the rules, on the screen where they set them.

**r3 N-3 — what the heartbeat proves, exactly.** It advances on *allow* as well as deny, so it proves
the **transport** — shim installed, loaded, reaching the bridge, getting an answer — and not the
**adjudication**. A gate whose rule never matches heartbeats normally, and the display reads healthy for
a gate that blocks nothing. Matching correctness is proven in the lanes (§6), not on the display. Said
here because the display is the only reader.

**Why the heartbeat cannot be faked into looking healthy.** It is written **only** by the seam call a
shim makes. There is no server-side path that writes it — not provisioning, not session start, not
teardown. A dead shim writes nothing, and the display says so. That is also what makes §6's dead-gate
assertion a real one rather than a synthetic condition.

**What this costs, stated plainly.** A team whose codex gate dies at 09:00 learns it whenever a human
next looks at the permission list, not at 09:01. At `mvp`, with a list that is empty by default and a
feature whose stated value is *learning what agents think is dangerous* rather than enforcement, that
is the right trade — and it is a trade I am making visible rather than covering with a mechanism that
does not work. **Founder ruling §10 accepts it**, on simplicity, and records the acceptance as a
*deferred* decision rather than an independently reasoned one — which is why §9 states what it does not
catch plainly rather than briefly. If an active alarm is ever wanted, the escalation is known and is
not a redesign: `run-orchestration` carries which harness ran on `session_ended`. Nothing here
forecloses it, and this table is the substrate it would use.

**Third table, and why it is not scope creep.** This is the third and last table. It is four columns,
one bounded row per (team, harness), owned by `review` like the other two, and it is the entire
substrate of a constraint `plan.md` states in its own words. The alternative — hanging a timestamp on
every rule row — loses the per-harness split, which is the only thing that makes the display
diagnostic.

### 2.8 Anchoring, and the surface that has to exist for it (r3 BLK-1b)

`submit_review` (`tool-definitions.ts:596-664`) changes its thread resolution:

1. If `ctx.threadId` is set (`framework/harness-protocol/src/harness/tool-seam.ts:56-60` — the
   session's baked calling thread), post there. That *is* "the thread the human was already in".
2. Otherwise `getFirstThreadByHost("task", ctx.taskId, ctx.agentId)`, else
   `insertThread({hostKind:"task", hostId: ctx.taskId, …})` — the shape
   `resolveOrCreateCallingThread` produces (`calling-thread-bindings.ts:44-69`), seeding the human as a
   participant so the review reaches the participant-scoped inbox (`routes/threads.ts:806-823`).
3. `ctx.taskId === ""` already returns `NOT_FOUND`. That stays; §2.4 makes sure such a session is never
   gated, so the agent is never told to do something it cannot.

The payload carries `taskId` (optional — §2.5.1) so the verdict can resolve the task without deriving
it from the host.

#### The retraction, and what BA2 must therefore build

**Revisions 1–3 claimed the human-facing half needed no new surface. That was false, three ways.**

- **There is no in-thread verdict control.** `RichMessageCard`'s verdict toolbar
  (`RichMessageCard.tsx:377-396`) is mounted only by `ThreadShell`, whose sole production mount is
  `AssistantOverlay.tsx:480` — the assistant popover. The conversation removed it on purpose
  (`Conversations.tsx:9-21`: *"`ThreadShell`/`RichMessageCard`/inline-verdict are GONE from the
  conversation… The decision UI lives on the review page"*). `HostThreadSection.tsx:255-266` renders
  `CommentRow`, which returns null for `type:"review"`.
- **The review page is reachable only from a bet-hosted thread.**
  `Conversations.tsx:480` — `hostKind === "bet" ? hostId : null`, with its own comment conceding that
  for a task host "the review open action no-ops"; `open-handler.ts:107-118` — `if (betId === null)
  return;`. BA2 puts every review on a **task** thread, so this hop no-ops for every BA2 review.
- **Its approve button cannot fire even on a bet.** `ReviewPage.tsx:131-133` derives
  `hostId = subject?.taskId ?? subject?.betId ?? ""`, and the reviews loader returns the review
  message payload — `{title, reasoning, artifactRef}` — which carries neither
  (`routes/reviews.ts:166-169`). `hostId` is `""`, `useHostThread` skips its fetch, and
  `handleSubmitVerdict` returns on its first line (`ReviewPage.tsx:173-176`). Only the hardcoded
  `"rev-1"` fixture makes it appear to work.

**This is BA2's to fix, not optional and not a redesign.** The BA track's rule is that a package owns
the code its feature touches and cleans up its own rubble; BA2 moves the anchor, so BA2 makes the
anchor's surface work. AC3, AC4 and AC7 are otherwise unreachable through the real consuming path, and
the harness lane would go green on a chain no human can traverse.

**AM1's decision is not reopened.** The decision UI stays on the review page; nothing puts a verdict
bar back into the conversation, and founder ruling §8 settles it: *"If there is already a thread (i.e.
for the task) it shows up in that thread; if not it creates a new thread and it pops up in your
conversation. We use what is there."* Four changes, all plumbing on an existing, approved surface.

**First, the gate that decides whether a human sees anything at all (r4 BLK-1).** Revision 4 named the
last three of these and missed this one, so the hop stayed dead after its own fix.

0. **`canOpen` must resolve for a task host — superseded by §2.8.1 B, which deletes the gate instead
   of widening it.** The diagnosis below is correct and is kept because it is the evidence; the fix
   changed in revision 6. Once the route is `/reviews/:reviewId` there is no bet to resolve, so
   `ReviewTarget` is not widened — `betId` is removed from it.

   **`canOpen` must resolve for a task host.** `PartList.tsx:44-46` computes
   `canOpen = (betId != null && betId !== "") || part.reviewTarget.betId !== ""`, and
   `ReviewRequestPart.tsx:63` renders the button only `{canOpen && …}`. For a BA2 review both
   disjuncts are false — `Conversations.tsx:480` sets `reviewBetId` to `null` for a task host, and
   `parts/part.ts:375` builds `{ betId: "", reviewId: message.id }` unconditionally. **`ReviewTarget`
   (`parts/part.ts:102-106`) is widened to carry the review's host** — its thread id, which the part
   builder has on the message — so the same value satisfies `canOpen` and feeds the route. With the
   route no longer needing a bet to be well-formed, the `canOpen` gate could equally be deleted; either
   closes it, and the builder picks. Files: `parts/part.ts`, `PartList.tsx`, and `Conversations.tsx`'s
   open-handler context.

Then the three revision 4 already had right:

1. **The reviews loader returns the review's own `threadId`.** It already loads the message
   (`routes/reviews.ts:92-96`) and the row carries it. This replaces host derivation entirely, and it
   is also what makes the verdict pass `resolvesMessageRow.threadId !== threadId`
   (`threads.ts:1362-1365`) instead of failing it.
2. **`ReviewPage` uses that thread id** instead of `subject?.taskId ?? subject?.betId ?? ""`.
   **r4 N-3 — the hook it uses today resolves by host.** `useHostThread(hostKind, hostId)`
   (`useHostThread.ts:61-93`) looks a thread up *by host*, and `handlePostComment` (`:159-171`) leans
   on `hostKind`/`hostId` through `resolveOrCreateHostThread`. Using a known thread id means fetching
   `GET /api/threads/:id` directly — the URL that hook already builds at `:88-91`. Small, but it is a
   different call, so T4b says so.
3. **The review route and `open-handler`'s `case "review"` gain a task-hosted shape**, so
   `Conversations.tsx`'s "Open review" hop resolves for a task host instead of no-op'ing. Today the
   route is `work/bet/:betId/review/:reviewId` (`core-ui/src/router.tsx:89`). **Revision 6 settles what
   that shape is: `/reviews/:reviewId` — §2.8.1 B.**

**Design: none needed, and that is now a ruling.** No new layout, no new component, no canvas change —
the plan's out-of-scope line holds. Founder ruling §8 settles the surface question, and the independent
reviewer reached the same conclusion: what is missing is not a design but a **conditional**. The "Open
review" affordance already exists with an approved appearance (`ReviewRequestPart.tsx:63-71`); deciding
it should also appear for a task-hosted review is a one-line rule. §7 states this plainly and the open
question revision 4 raised there is withdrawn.

### 2.8.1 AC8 — the review surface: what is broken, and the minimum that repairs it (ruling 11)

Ruling 11 makes the review surface BA2's where it is broken, not only where BA2 breaks it. This section
is the audit and the decision. Every item carries `path:line`; the four marked **executed** were run
against the real components (F41–F44).

Tier is `mvp` and the founder said not to build gigantic machinery. The rule applied throughout: **repair
what is broken; do not improve what merely could be better.** Where an item is broken and BA2 still does
not fix it, the reason is stated rather than the item omitted.

#### A. The page must render a real review, and say what happened when a human acts

**Every one of these lives in the reviews loader (`routes/reviews.ts`) and `ReviewPage.tsx` — the two
files T4b already owns.**

1. **The loader fills the gaps in what the payload already carries — it never replaces it (BLK-1).**
   Today `routes/reviews.ts:115-119` returns `JSON.parse(reviewMsg.payload)` and the client casts it to
   `ComposedReviewSubject` (`ReviewPage.tsx:48`), a cast that is false for an agent's review and **true
   for a demo review**, because the demo world persists a complete subject (`conversations.ts:411-470`:
   `prompt`, `tokens: "9.2k"`, `tools`, three `resultKpis`, four `intent`, a `needs` entry, and three
   canvas `artifacts`).

   **So the composed frame is a fallback layer *under* the persisted payload, field by field:**

   ```
   subject = { ...composedDefaults, ...persistedPayload }   // persisted wins, always
   ```

   A demo review therefore renders **exactly as it does today** — nothing is composed, because nothing is
   missing — and an agent's sparse review gets a renderable frame. This is what makes §2.8.2 B's "needs no
   loader change" true for the canvas channel: `artifacts` passes straight through when present.

   **Revision 6 got this wrong and it was the single most damaging line in the document.** The table below
   said `artifacts: []` "because nothing produces them", citing a §2.8.1 D1 that is now marked
   *WITHDRAWN — false*; T4b repeated it as "empty arrays for what nothing produces" and replaced the
   handler body. Built as written, it would have stripped every demo review of its KPIs, done conditions,
   needs, tools, token count and all three canvases — a regression to a shipping surface, and to the exact
   surface §6.1 Part 0 depends on.

   | field | composed **only when the payload does not carry it** |
   |---|---|
   | `id`, `title` | the review message id and `payload.title` |
   | `outcome` | `payload.reasoning` joined — the agent's case, displayed nowhere today |
   | `threadId` (new) | `reviewMsg.threadId`. **Always composed** — it is not a payload field and §2.8 step 1 requires it |
   | `taskId`, `taskTitle` | the thread's host when `hostKind:"task"`, else the payload's `taskId` (§2.5.1) |
   | `betId`, `betTitle` | the task's bet when there is one; empty when there is not — a BA2 review need not have one |
   | `authorName` / `reviewerName` | the message sender and the viewer, through the identity read the thread detail route already does |
   | `producedAgo` | `reviewMsg.createdAt`, raw ISO — the client humanizes (`relativeShort`, the existing contract) |
   | `prompt` | the task's own prompt/description; `""` when there is none. **(critique NB-5 — required on `ComposedReviewSubject` (`review-composition.ts:109`) and missing from this table, leaving a builder to invent it.)** |
   | `blocking` | `reviewMsg.resolvedAt === null` |
   | `verdict` | **always composed**, never from the payload: present iff resolved, carrying the decision from the verdict message in the same thread whose `payload.resolvesMessageId` is this review, plus `resolvedAt`. Drives `ReviewComposition.tsx:770`'s `resolved` — the only thing that tells a human their approval landed |
   | `tokens`, `tools` | `""` and `[]` — no token or tool-use fact exists on an *agent's* review message. A demo review carries its own and keeps them |
   | `resultKpis`, `intent`, `needs`, `conversation` | `[]` — an agent supplies none today. A demo review carries its own and keeps them |
   | **`artifacts`** | `[]` **only when absent.** When the payload carries canvas artifacts they pass through untouched — this is the channel of §2.8.2 B — and T4d appends any resolved `artifactRef` to that list rather than to an empty one |

   **The compiler guarantee this previously claimed does not exist (NB-1).** `ComposedReviewSubject`
   lives in `layers/core-ui/src/pages/review/review-composition.ts:104-123`; core-api has no core-ui
   dependency and layer→layer crossing is not permitted (`architecture.json` containment). A local
   annotation in core-api proves *its own* type's fields are present, never the consumer's. **The only
   real gate on the shape is the client-side predicate of A3**, plus §6.2's service assertions on the
   values. The annotation is still worth writing — it catches a field the route forgets — but it must
   not be quoted as proof.

   **Applied after the spread, not merged by it (NB-3):** `threadId` and `verdict` are marked "always
   composed"; a bare `{...composedDefaults, ...persistedPayload}` would let a payload field win. Write
   them after the spread.

2. **A non-review message is a 404.** `routes/reviews.ts:101-105` checks that the message exists, not
   what it is, and `part.ts:411` hands a resolved **questionnaire** a `reviewTarget` that
   `ReviewResolvedPart` turns into an "Inspect review" button. One line.

3. **The page guards its own input.** `ReviewPage`'s loader result is untrusted JSON behind
   `as ComposedReviewSubject` (`ReviewPage.tsx:48`) — the unsafe cast `.claude/rules/typescript.md`
   forbids, and the direct cause of F41. It
   gains a predicate — the arrays are arrays, the strings are strings — and renders the existing
   `ErrorState` (`ReviewPage.tsx:199-210`) when it fails, instead of throwing into the shell's
   `ErrorBoundary`. This is what makes the page **total**: a future loader regression degrades to a
   named error rather than "Something went wrong". It is also the assertion in §6 that cannot be faked
   by a fixture, because its input is typed against the production `ReviewPayload`.

4. **The page reads the verdict outcome.** `ReviewPage.tsx:191` discards
   `postVerdictHostMessage`'s return, which is exactly `"ok" | "race" | "forbidden"`
   (`host-threads.ts:147-150`), and `handleSubmitVerdict` has no `catch`, so a 400 throws into nothing.
   A non-founder (`threads.ts:1368-1373`) therefore clicks Approve and sees the page unchanged,
   permanently. The handler takes the outcome and surfaces `forbidden` and any thrown failure to the
   human. **This is the plan's own constraint** — *"a failure … must reach the human … silent failure
   is a defect this package may not reproduce"* — applied to the one surface where a human acts. It is
   not a new mechanism: the outcome values already exist and are already documented as the reason the
   function does not throw.

   **The `founder`-and-non-self rule itself is not touched** (**D5**).

5. **A created thread seeds the human.** §2.8 step 2 says "seeding the human as a participant"; the
   mechanism is `resolveReviewRecipientsForItem` + `mergeParticipants`, used for exactly this purpose
   nine lines earlier in the same file by `create_item` (`tool-definitions.ts:450-467`), backed by the
   live route `GET /api/org/review-recipients` (`routes/org.ts:218-225`) over
   `ReviewPorts.org.resolveReviewRecipients` (`review/src/ports.ts:83-89`). Without it the review is in
   a thread no human is a participant of, and the participant-scoped list (`threads.ts:807-824`) never
   shows it — the review would be unreachable by construction.

6. **`FIXTURE_REVIEW` and the `"rev-1"` branch** (`routes/reviews.ts:42-87,96-98`) are already on
   §2.11's delete list; AC8 is the second reason. They are also *themselves* incomplete — the fixture
   carries no `tokens`, so even the demo route renders a dangling `" · 9 min ago"` (**executed, F42**).
   §2.11's deletion of the proposed-call nesting (`routes/reviews.ts:109-177`) is subsumed by A1: the
   handler body is replaced, not edited.

#### B. The route: `/reviews/:reviewId`, and four conditions deleted

Revision 5's T4b widened `ReviewTarget` to carry the review's host so `canOpen` could resolve. That was
the right diagnosis of the symptom and the wrong fix for the cause. **The cause is that the URL demands
a bet.** Once the loader returns the review's own thread, nothing downstream needs one.

| today | after |
|---|---|
| `router.tsx:89` — `work/bet/:betId/review/:reviewId` | `reviews/:reviewId`, and **the old path is deleted, not redirected (NB-8)**. Enumerated: `open-handler.ts` builds it at runtime, `router.tsx:89` serves it, plus tests and a fixture — **no persisted row holds it**. A redirect with nothing to bridge is the compat shim CLAUDE.md's absolute rule 2 forbids |
| `open-handler.ts:107-119` — prefers a page betId, falls back to the target's, no-ops when both are absent | `` `/reviews/${target.reviewId}` ``. The `OpenHandlerContext.betId` field (`:41-48`) and its `@lore` ARCH-1 paragraph (`:22-30`) go with it |
| `part.ts:103-106` — `ReviewTarget { betId, reviewId }`; built as `{ betId: "" }` at `:375` and `:411`; declared on `OpenTarget` at `:205-209` | `betId` deleted from all four |
| `PartList.tsx:38,44-47` — the `betId` parameter and the `canOpen` computation | both deleted; `ReviewRequestPart`'s `canOpen` prop (`ReviewRequestPart.tsx:22,31,63`) goes with them |
| `Conversations.tsx:475-490` — `reviewBetId` and its comment | deleted from the handler context |
| `Conversations.tsx:291-295` — `InspectDestination`'s `^/work/bet/([^/]+)/review/([^/]+)$` regex and `overrideBetId` | `^/reviews/([^/]+)$`. **Revision 5's T4b file list omitted this file's inspect path entirely** — the pane presentation would have kept the old URL and stopped resolving |
| `ReviewPage.tsx:27-30,32-37,121-126` — `betId` in `ReviewLoader`, `overrideBetId`, `routeBetId` | deleted; the loader takes `reviewId` only |

Net effect on the two broken hops:

- **`ReviewRequestPart`'s "Open review" appears on a task-hosted thread** because there is no longer a
  condition to fail. Today it does not: **executed (F43)** — with `betId: null`, the exact value
  `Conversations.tsx:480` passes for a task host, the button is absent from the DOM.
- **`ReviewResolvedPart`'s "Inspect review" starts working.** It renders unconditionally today
  (`ReviewResolvedPart.tsx:49-63` — no gate, unlike `ReviewRequestPart.tsx:63`) and its click is
  swallowed at `open-handler.ts:115`: **executed (F43) — button present, zero navigations.** A visible
  dead button is a worse failure than a missing one and neither critique caught it.
- **`AssistantOverlay.tsx:53`'s `createOpenHandler(navigate, {})`** stops being conditionally broken.
  It is not a review entry point today (**D3**) and this changes nothing about that.

**AM1's decision is still not reopened.** The decision UI stays on the review page. What moves is the
page's address, not its role.

**Docs made false by the route change** (folded into T14, which already rewrites the review pages):
`docs/human-interface-layer/open-contract.md:24`, `docs/human-interface-layer/review-primitive.md:23,92`,
`docs/information-architecture/app-shell-always-present.md:57`,
`docs/information-architecture/conversations-view.md:47`,
`docs/information-architecture/cross-view-navigation-map.md:25`,
`docs/information-architecture/work-view.md:18`.

#### C. Two render repairs, in files nothing else in BA2 touches (T4c)

1. **Delete the checkout mock.** `ReviewComposition.tsx:450` renders `<CheckoutProof />`
   unconditionally; `CheckoutProof` (`:346-352`) and `CheckoutCard` (`:355-414`) are a hardcoded
   demo — "SPRING24", "$120.00", "Promo (SPRING24) −$24.00", "This code expired on Apr 3." —
   **executed (F42): present in the rendered DOM of the shipping route.** A human is shown a
   fabricated e-commerce receipt inside the review of their own work. Deleted, together with `ResultRow`
   (`:415`), whose only two callers are the two lines inside `CheckoutCard` (`:401-402`) — enumerated,
   it becomes dead with them.

   In the same file and for the same reason: `{s.tokens} · {s.producedAgo}` (`:258`) renders the
   separator with nothing on its left for every review that is not the demo fixture
   (**executed, F42**). One expression: the separator only when both sides are non-empty.

   **This is not a layout change and not a design pass.** It is a deletion plus one condition; the
   plan's out-of-scope line ("reworking the review product's layout or its canvases") is intact and
   ruling 8 is untouched.

2. **A review is not a blank row.** `CommentRow.tsx:209-212` returns `null` for `type:"review"`; the
   comment says the substance "lives in the rich slots", which is true for `ThreadShell` and false for
   `HostThreadSection` (`:255-266`), which supplies no slots. So on the Task page (`WorkTask.tsx:342`)
   and the Bet page a review is a sender header, a timestamp and nothing. The branch renders the
   review's title. **Text only, no navigation** — `CommentRow` has no `onOpen` and is deliberately
   navigation-agnostic; giving it one would be the surface change ruling 8 declined. Reaching the
   review stays the conversation's job.

   `renderBody` is reached **only** when no rich slot is supplied (`CommentRow.tsx:297-308`), so
   `ThreadShell`'s rendering is unaffected. `type:"questionnaire"` shares the branch and is left alone
   — it is not a review and not BA2's.

#### D. Broken, and deliberately not repaired here

1. ~~**The nine canvases never render with real data — OUT.**~~ **WITHDRAWN — false, and overturned by
   rulings 12 and 13.** Five of nine render real data in the demo world today (F60); the claim came from
   checking the `ReviewPayload` *type* and the `rev-1` *fixture* rather than the seeded database. The
   canvases are in scope, are not deleted, and **§2.8.2** is the wiring that lets an agent feed them.

2. ~~**Every canvas silently substitutes a fabricated demo — OUT, unreachable.**~~ **WITHDRAWN — the
   finding was right, the scope call was wrong.** The nine `if (!isXPayload(p)) return FIXTURE` sites are
   real, and this package is exactly what makes them reachable: an agent's near-miss payload would render
   a fabricated PR in place of its work. **§2.8.2 D** fixes them (T4e-a).

3. **No notification is raised for an agent-raised review — OUT.** The popover navigates a persisted
   `sourceLink` (`NotificationPopover.tsx:117-121`) written as `/conversations/:threadId`
   (`install.ts:432`), but the listener is driven off `items` (`install.ts:441-455`) and
   `submit_review` (`tool-definitions.ts:599-667`) creates none — only `create_item` does. So BA2's
   reachability rests on the conversations list's own `hasUnresolvedReview` flag
   (`threads.ts:826-836`) over the participant-scoped list, which is why A5 above is not optional.
   Making `submit_review` raise a notification means a new producer on a feature BA2 does not own;
   ruling 8's "we use what is there" points the other way. §9 asks the founder.

4. **The assistant overlay and the session view are not review entry points — OUT, no change.** The
   only production `<ThreadShell` mount, and therefore the only production mount of the inline verdict
   toolbar (`RichMessageCard.tsx:377-396`), is `AssistantOverlay.tsx:480` — enumerated across the whole
   tree. It renders `useAssistantThread()`, i.e. `GET /api/threads/assistant`
   (`AssistantOverlay.tsx:329`, `hostTitle="Assistant"`), never a task or bet thread, so no
   agent-raised review can appear in it. `derivePartsFromSession` (`part.ts:492-560`) emits only
   `prose`, `tool` and `reasoning` parts — no review kind — so `SessionView` is not one either.

5. **Only a `founder`, and never the review's own author, may verdict — OUT.**
   `threads.ts:1368-1373`. A pre-existing product rule with its own `@lore`; BA2 makes the refusal
   visible (A4) instead of changing who may act.

6. **Empty "Needs you (0)" / "Artifacts (0)" / "Met the task: 0 of 0" sections — OUT.** They are honest
   empty states over data that legitimately does not exist for a BA2 review. Hiding them is an
   improvement, not a repair, and this tier declines it.

7. **The e2e lane is not where AC8's evidence goes — OUT.** The two specs that would prove the inline
   verdict path — `"RichMessageCard mounts inline with ArtifactView + 5 verdict buttons"` and
   `"thread-verdict: clicking Approve on RichMessageCard POSTs verdict payload"` — are both on the
   known-failing exclusion list (`__e2e__/known-pre-existing-failures.ts:198,341`), so the review
   surface has **no green end-to-end proof at any level today**. §6 puts AC8's evidence in the service
   and component lanes, which run per-merge.

### 2.8.2 AC9/AC10 — an agent's review renders on the canvases (rulings 12 and 13)

**Revision 7's Path A / Path B fork is void. It rested on a false premise that I put there, and this
section replaces it entirely.** What I reported — that the nine canvases have never rendered real data on
any route — is wrong. The correction and my error are recorded in F60.

#### A. What is actually true

**The canvases work, and the demo world proves it in the database.** `tools/setup/src/demo-world/conversations.ts`
seeds three `type:"review"` messages (`:410`, `:595`, `:764`) whose payloads carry a populated `artifacts`
array with **real canvas payloads for five of the nine kinds** — `outcome_summary` (`:469`, `:642`, `:818`),
`visual_diff` (`:503`), `browser_preview` (`:520`), `code_diff` (`:664`, `:844`), `metrics_moved` (`:894`).

They are persisted whole: `conversations.ts:1624` does `payload: JSON.stringify(message.payload)`, so the
`artifacts` array goes to the database even though `ReviewPayload` (`thread.ts:199-203`) does not declare
it. And they are served: for a review with no proposed call — which is every demo review — the loader
returns `c.json({ ...reviewPayload })` at **`routes/reviews.ts:117-119`**, and that spread carries
`artifacts` through. (The coordinator cited `:149-150,176`; that is the *other* branch, the one §2.11
deletes with the proposed-call machinery. The path the demo world actually travels is the early return,
and it is the one that must survive.)

**Where my error came from, because it changes how the rest of this section is written.** I checked
`FIXTURE_REVIEW` in `routes/reviews.ts` — which genuinely does ship `artifacts: []` (`:85`) — and the
`ReviewPayload` type, which genuinely has no `artifacts` field, and concluded from the *type* and the
*fixture* that no data existed. I never looked at what the demo world writes. The persisted payload is a
**superset** of its declared type, and reasoning from the declaration was reasoning from the wrong
artifact. F60.

**So there is no content pipeline to build and no renderer to write.** The canvas channel exists, is
proven, and is one field wide: an agent needs to be able to put artifacts on a review the way the demo
world does.

#### B. The two fixes, final shape — with the write path traced (BLK-2, BLK-3, BLK-4)

Ruling 13 names both breaks. Neither reintroduces the pre-AM5 artifact vocabulary; the six-kind
consolidation (`ARTIFACT_KINDS`, `framework/domain-model/src/kinds/registry.ts`) is untouched.

**Revision 8 specified these against declarations and got three things wrong.** "Written straight onto
the review message payload" was false — nothing is written straight anywhere; "no new vocabulary" hid a
package-boundary problem; and "optional on read" cannot do what I claimed. Traced properly:

##### B1 — the canvas channel, and the three gates on the way to the row (BLK-2)

`submit_review` does not write to the table. It calls `ports.coreApi.insertMessage`, i.e.
`POST /api/threads/:id/messages`. **The demo world writes directly to the table**
(`conversations.ts:1624`) and therefore travels none of this — which is exactly why its payload is a
superset, and why reading that superset as proof the agent's path works was the error.

The full trace, and all three gates it must pass:

```
submit_review  →  ports.coreApi.insertMessage  →  POST /threads/:id/messages
   ①  tool-definitions.ts:643   if (input.artifactRef) { review } else { PLAIN }
   ②  threads.ts:1301-1305      messageInputSchema.safeParse(body); input = parsed.data
                                 → threads-schema.ts:155-159  artifactRef REQUIRED
                                 → bare z.object            → unknown keys STRIPPED
   ③  threads.ts:1382,1422      enrichedPayload = input.payload → JSON.stringify(enrichedPayload)
```

**Executed (F65):** the parse *succeeds* and yields `["title","reasoning","artifactRef"]`. `artifacts` is
dropped **silently** — the worst shape, because nothing anywhere reports a failure. This is the AD8b
`toolCalls` trap that `threads-schema.ts:86-95` documents in its own `@lore AH3 H2` ("Zod strips unknown
keys by default … Same class of bug as AD8b's `toolCalls` addition"), and that F22 already recorded for
this package. T4 applies the lesson correctly for `taskId`/`clearsRule`; revision 8 omitted it for the one
field the section exists to add.

**All three gates are opened, using a split this file already has.** `messageInputSchema` (write) uses
`plainPayloadSchema` while `messageRowSchema` (read) uses `plainPayloadSchemaWithToolCalls` — a strict
write arm and a tolerant read arm, with `@lore AH3 H2` explaining why. **`review` is the one message type
with no read arm: both unions point at the same `reviewPayloadSchema`.** That single omission is the
mechanical cause of BLK-2's gate ③ *and* BLK-4. So:

| gate | change |
|---|---|
| ① the branch | `if (input.artifactRef` **or** `input.artifacts?.length)` — a review carrying only canvas artifacts is a review. An agent that supplies neither still gets today's plain-message behaviour |
| ② required `artifactRef` | `.optional()` on the **write** arm. A canvas-only review is legitimate |
| ② the strip | **`artifacts` declared on the schema.** Undeclared is silently dropped; declaring it is the only thing that makes it survive |
| ③ | nothing — once ② declares the field, `parsed.data` carries it and `JSON.stringify` persists it |

**New: `reviewPayloadSchemaRow`**, the read arm, extending the write arm exactly as
`plainPayloadSchemaWithToolCalls` extends `plainPayloadSchema`, and wired into `messageRowSchema` in place
of the write schema. It is where every read-back tolerance lives (B3).

##### B2 — where the canvas vocabulary lives, and why nothing is duplicated (BLK-3)

`@hyperidle/tool-handlers` depends on `db`, `domain-model`, `harness-protocol` and `zod`
(`tool-handlers/package.json:13-18`). It **cannot** import `ReviewCanvasKind` from core-ui, and must not —
that would be an orchestration → UI import. Revision 8's "no new vocabulary" concealed this.

The naive repair — restate the nine kinds *and* nine payload schemas in the framework — is wrong twice
over: it is a new framework surface far larger than "one field wide", and it creates a second contract
that would drift from, and disagree with, each canvas's own runtime guard (`isCodeDiffPayload` checks four
fields; a generated zod schema would check all of them). Two boundaries accepting different sets, with no
declaration of which is authoritative.

**So the split is by what each side actually owns:**

- **The nine kind names *and the artifact envelope* move to `framework/domain-model` (NB-2)** — one
  `const REVIEW_CANVAS_KINDS` array plus its type, **and the `{id, tool, app, sourceHref, title, kind,
  payload}` shape**, which `ReviewPayload.artifacts` and `submit_review`'s envelope validation both need
  and which core-ui's `ReviewArtifact` (`review-artifact.ts:23-31`) already declares. Re-derived in
  core-ui, not copied — the same treatment as the names, or this section's own "one contract, one home"
  argument does not hold for the field it exists to add. `payload` stays `unknown` on the wire — nine strings, no schemas. Core-ui's `ReviewCanvasKind` (`review-artifact.ts:12-21`) is
  **re-derived from it, not copied**, so there is exactly one home. `submit_review` validates `kind`
  against it.
- **The payload contract stays where it already is: each canvas's own type guard.** `submit_review`
  validates the *envelope* — `id`, `tool`, `app`, `sourceHref`, `title`, `kind ∈ the nine`, `payload` is
  an object — and treats `payload` as opaque. One contract, one home, no duplication, no drift.

**The trade, stated rather than hidden:** `submit_review` cannot tell an agent its payload is malformed;
that is discovered at render, where §2.8.2 D's honest fallback shows it. Accepted at `mvp` because the
alternative is a second payload contract, and because the fallback is being built anyway. What closes most
of the gap costs nothing: the tool description names the nine kinds and their required fields, the way
`create_artifact:1406-1416` already does for its six.

##### B3 — the stored-artifact channel, and why "optional" was a category error (BLK-4)

`ArtifactRef.kind` is `ArtifactViewShape` — five words with **zero overlap** with what `create_artifact`
emits, so every attempt is rejected (**executed, F51**). Revision 8 said it would be "respelled to
`ArtifactKind` and made optional on read so an existing row carrying `"text_diff"` still parses".

**That is impossible, and I executed it to be sure (F66):** `z.enum(ARTIFACT_KINDS).optional()` **rejects**
a present `"text_diff"` and accepts only its *absence*. `.optional()` tolerates a missing key, never a
wrong value. The r3 BLK-4 rule was about *adding* optional fields; applying it to a *respelled closed enum*
is a category error I carried forward.

The blast radius is real: all three demo reviews carry pre-consolidation values
(`conversations.ts:419` `visual_comparison`, `:603` and `:772` `text_diff`), and `rowToMessage` does a
throwing `.parse` with no fallback (`threads.ts:593-596`; the file's own comment says it "fails loudly
here"). Both union arms would fail, so **listing any thread containing a demo review would throw** —
taking out §6.1 Part 0 and the AC8 entry point.

**The fix is the read/write split of B1, which exists to hold exactly this:**

- **Write arm** (`reviewPayloadSchema`): `kind: z.enum(ARTIFACT_KINDS).optional()`. New writes are
  consolidated and nothing pre-AM5 can be written again.
- **Read arm** (`reviewPayloadSchemaRow`): `kind: z.string().optional()`. Old rows parse, threads list,
  nothing throws. **The value is never trusted anyway** — the loader reads the real kind off the artifact
  row, which is the whole reason carrying a second copy in the payload was the bug.
- **The three demo literals move to six-kind values** in the same change. They are seed data; this is a
  string edit, and it stops the demo world being the only writer of a vocabulary nothing reads.
- **`part.ts` is a live reader and was missing from T4d (critique NB-4).**
  `components/parts/part.ts:266-282` keys `ARTIFACT_KIND_LABEL` on the five view shapes and branches
  `ref.kind === "text_diff"` for the diff Embed. `npm run check` catches the comparison; it does **not**
  catch the label map, typed `Partial<Record<string, string>>`, which would silently degrade every label
  to "Artifact". Respelled to the six kinds, with the `text_diff` branch removed — there is no diff kind
  among the six, by the deliberate design `registry.ts:63-68` records.

`ARTIFACT_VIEW_SHAPES` then has no reader and is deleted (§2.11).

##### B4 — the loader resolves the reference

It never reads `artifactRef` at all. It resolves the id and **appends the stored artifact to whatever
`artifacts` the payload already carries** (§2.8.1 A1 — never to an empty list). `submit_review` first
checks the id resolves to an artifact whose `producingTaskId === ctx.taskId`, the binding
`create_artifact` itself enforces (`tool-definitions.ts:1446`), so a review cannot claim proof it does not
have. One new port member, `CoreApiPort.getArtifactById`, in the shape of
`getTaskById`/`getBetById`/`getItemById` (`core-api-port.ts:214-220`) over the route that already exists
(`routes/artifacts.ts:192`); `submit_review` already calls `getTaskById` two lines earlier.

**Correction (critique NB-6):** revision 8 said the loader would reuse "the `work.get(db,"artifact",id)`
call it already makes at `:146`". That call is inside the **proposed-call branch §2.11 deletes**, and
§2.8.2 A itself establishes that the early return is the survivor. It will not exist — the resolution adds
a `work.get` to the surviving path rather than reusing one.

**A stored artifact does not get a purpose-built canvas, and that is deliberate.** Its six-kind preview is
*content*; a canvas payload is an *analysis*. There is no faithful six→nine mapping and inventing one
would fabricate exactly what ruling 12 forbids. It renders on the honest fallback of §2.8.2 D, and its
permalink `/artifacts/:id` — reached from the conversation Embed that already works (`part.ts:275-282`) —
is where its preview renders properly. **An agent that wants a canvas uses the canvas channel; the
reference is a link to stored work.**

#### C. Per canvas kind — what an agent must supply, and what is reachable (BLK-6 re-derivation)

With the canvas channel, **all nine are wired**: an agent that supplies a well-formed payload gets that
canvas. What differs per kind is whether an agent's work naturally *produces* that shape — and, after
BLK-5, whether the canvas renders it without inventing around it. The founder judges the diversity; the
table states facts.

| canvas kind | what the agent must supply | demo data | reachable after this work |
|---|---|---|---|
| `outcome_summary` | `{agentName, agentInitials, reviewerName, achieved, tools[], tokens, standing, doneConditions[], needsYou[]}` — facts about its own run | **yes**, ×3 | **yes — the natural default, and BA2's own.** No mapper, but **not clean**: `tokens ?? 0` renders `0 tok` on the **guard-passing** path (the guard at `:342-353` never checks `tokens`), and `standing ?? "Awaiting"` / `achieved ?? artifact.title` invent on guard failure (`:368-374`). Fixed by T4e-a; `tokens` needs a conditional chip, not a different default (§2.8.2 D). Revisions 9 and 10 were both wrong here |
| `code_diff` | `{prTitle, description, checks[], files[{path, band, rationale, added, removed, hunks[{header, lines[]}]}], triviaSummary}` — the diff it just made | **yes**, ×2 | **yes** — verbose but mechanical; highest value for coding work |
| `visual_diff` | `{before{label}, after{label}, diffRegions[{id,label}], overlayMode}` — **labels only, no image URLs** | **yes** | **PENDING A FOUNDER DECISION — §E.** Retracted: no mapper change can make it honest, because `MockScreen` renders a fabricated signup screen as *both* evidence panes and the payload has no image to put there. Excluded from T4e and from the reachable set until ruled |
| `browser_preview` | `{url, title, previewBody}` | **yes** | **yes, once the mapper stops inventing** (D): today it adds a `Solo / $19 /mo` tier and four nav links the payload never had |
| `metrics_moved` | `{period, headlines[{label, prior, current}], rows[], tieOut{…}, exceptions[]}` | **yes** | **yes when the work is measurable, once the mapper stops attributing every figure to QuickBooks** (D) |
| `field_change_set` | `{recordLabel, fields[{label, old, new, provenance, needsYou}], unchangedCount}` | **yes — seeded by T4d** (ruling 14) | **yes** — an agent editing a record has exactly this |
| `rendered_in_context` | `{inboxRow{sender, subject, preview}, body, renderMode, flags[]}` | **yes — seeded by T4d** | **yes when the work is a message or document, once the mapper stops inventing `mailchimp` and `hello@example.com`** (D) |
| `batch` | `{rollup{…}, flagged[], auto[], drafted[], approveAllExcept[]}` | **yes — seeded by T4d** | **yes when the work is per-item** |
| `action_operation` | `{verb, amountWire{currency, units, formatted}, irreversible, reversible, blastRadius[], receiptFields[]}` | **yes — seeded by T4d**, which proves the renderer | **NO — not producible by BA2's flow. Corrected (BLK-6).** Seeding is data and changes nothing here: a command clearance still has no `amountWire` |

**The `action_operation` correction, in full, because revision 8 rested the package on it.** I wrote that
it was "BA2's own canvas — a pushed-back agent naming the action it wants cleared is literally this shape".
**It is not.** `isActionOperationPayload` (`ReviewActionOperation.tsx:441-451`) requires
`isString(payload.amountWire.formatted)`; the payload interface requires `amountWire: {currency, units,
formatted}` (`review-artifact.ts:88-101`). A clearance for *"run this command"* or *"write this file"* —
the actions the interview names — has no currency, no units and no formatted amount. **An agent could only
satisfy this canvas by inventing money**, which is the fabrication AC9 forbids, at the one moment a human
is deciding whether to authorise something consequential.

**So BA2's own push-back review carries `outcome_summary`.** It fits without strain and needs nothing new:
`achieved` is what the agent did, `doneConditions` is what remains, and **`needsYou[]` is precisely "this
action needs a human"** — `{category, severity, detail, jumpLabel}`. It is the proven kind, with real demo
data and no mapper to fabricate through.

`action_operation` is therefore **wired but not producible by this work**, and it is the only kind in that
state. Widening `amountWire` to optional would be a change to a canvas payload contract and its renderer —
out of scope under the plan's own line, and unnecessary once `outcome_summary` carries the case.

**BLK-6's second half is answered by D, not by keeping the panel.** The critique is right that T4e deletes
`ProposedCallArgsPanel`, whose `@lore AL7 CRITICAL-3` (`ReviewActionOperation.tsx:468-477`) records it as
the fix for *"the approver saw fake Stripe ids/amount, not the agent's real call"*. But that panel is a
*mitigation for a fabrication in the mapper below it* — `mapActionPayload:453-455` hardcodes
`tool: "stripe"`. **D removes the fabrication at source.** Deleting a mitigation for a defect that no
longer exists is not a loss; deleting it while the defect remained would have been. Both must land
together, so **T4e owns both** and neither ships alone.

**What makes an agent use any of them.** The wiring is necessary, not sufficient: `submit_review`'s
description must name the nine kinds and their required fields the way `create_artifact:1406-1416` already
names its six — *"Kind determines the review experience"* — and stop saying "the current bet's work … the
bet's host thread", which §2.8 already made false.

#### D. A canvas may render only what its payload carries (ruling 14, second surface critique BLK-1)

**Established by rendering, not by reading.** All nine canvases were rendered with sentinel payloads and
their DOM text compared against what the payload supplied (F71). **All nine put invented content on the
screen on a guard-passing payload.** Revision 9 named five (mapper-level), revision 10 named a sixth
(`outcome_summary`) and certified three clean; **the three it certified clean all fabricate**, two of
them inside the mapper it said it had read.

##### The rule, as a property rather than a list of strings

> **No string or number may reach the DOM that the payload did not supply — except fixed interface
> chrome, which names a region rather than asserting a value.**

"Blast radius", "files changed", "Needs you", "unchanged" are **chrome**: they label a region and assert
nothing. `coverage +0.4%`, "Recognized revenue closed at … from April", `Solo $19/mo`, `0 tok`,
"Median first response" are **values**. Where a region has no derivable content it renders an explicit
absence, or does not render — **never a plausible substitute**, because a reader cannot tell one from the
truth. A string list is not the specification; this property is, and §6.2 asserts the property.

**Why every canvas has such regions.** The nine were built against richer content than their payload
types declare — `VisualDiffPayload` carries labels and no images, `CodeDiffPayload` carries no coverage
figure, `BatchPayload` carries no per-item sentiment. The gap is structural, and it is a spectrum:
`visual_diff` is simply the case where the un-derivable region is the whole evidence surface (§E).

##### The nine, with what the DOM showed

| canvas | invented in the DOM | site |
|---|---|---|
| `metrics_moved` | "Recognized revenue closed at … up … **from April**. The period **ties to bank**; biggest open item is a **$0.00** wire with no source." + `Apr`/`May` column heads + a roll-forward reconciliation frame. **The payload's own `period` never renders** | `:460-469`; `usd`/`usdCents` `:195-209` force USD on every number |
| `batch` | "**Median first response** would drop → once the N drafts send.", `CHURN THREAT`, "No reply drafted — policy routes this straight to you.", "Held for your review", `neutral` | mapper `:520,522,547,548,554`; view `:284-289` |
| `browser_preview` | `Product Pricing Docs Changelog`; **two** tiers — `Solo` from the mapper, `Founder` hardcoded in the view — and `$19/mo`; `previewBody` rendered **twice** as literal text | mapper `:479-500`; view `:233` |
| `code_diff` | **`coverage +0.4%`** on every diff; "Minor / generated & formatting — safe to skip" | `:335-336`, `:751-753` |
| `field_change_set` | a **Salesforce** mark on every provenance line; "Owner, Lead source, Probability, Type, Account, and N more were left as-is" | view `:212`, `:335`; mapper `:373-374` (`tool: "salesforce"`, `object: "Record"`) |
| `rendered_in_context` | `mailchimp`, `hello@example.com`, `HyperIdle` | `:535-552` |
| `action_operation` | `stripe`; an **"Approve refund"** button on an operation that is not a refund | `:453-465` |
| `outcome_summary` | **`0 tok`** — see the guard note below | `:374` |
| `visual_diff` | an entire fake signup screen as **both** evidence panes | **not fixed here — §E** |

##### Guard-passing versus guard-skipped — the distinction revision 10 got backwards

`isOutcomeSummaryPayload` (`:342-353`) checks `agentName`, `agentInitials`, `achieved`, `tools`,
`doneConditions`, `needsYou`, `standing` — **not `tokens`**. So a well-formed payload from an agent that
reports no token count **passes** the guard and renders `0 tok`. Revision 10 filed all three of that
canvas's defaults under "the guard-failure path"; for `tokens` that is wrong, and it is why the sweep had
to be run at the DOM.

**A guard-skipped optional cannot simply have its `?? default` deleted.** `TokensChip` takes
`tokens: number` (`:73`), so removing `?? 0` renders `undefined tok` — the type narrowing on the
guard-passing branch is a promise the guard does not keep. **The fix is conditional rendering, not a
different default:** no token count supplied ⇒ the chip does not render. Same treatment for every
guard-skipped field; `reviewerName`'s `?? ""` is already honest and stays.

##### Two view-level types make "take it from the envelope" a type change, not pure subtraction

`ChangeSet.tool` is the literal `"salesforce"` (`ReviewFieldChangeSet.tsx:47`) and `BatchFixture.tool`
the literal `"zendesk"` (`ReviewBatch.tsx:60`). Sourcing them from `artifact.tool` requires widening both
to `string`. **Named because §2.8.2 D previously promised "subtraction" and this is not that** — it is
two one-word type widenings, still no layout change and no new component.

##### The guard-failure fallback

Unchanged from revision 10 and now stated once, resolving the §6.2 disagreement (NB-10): a payload that
**fails** its guard renders `ReviewUnknownCanvas` with `reason:"malformed"` — **for all nine, including
`outcome_summary`**, which today falls back to `{}` and renders a half-empty frame. The eight fixture
constants go with the fallbacks; seven are named `FIXTURE`/`CODE_DIFF_FIXTURE` and **the eighth is
`ReviewActionOperation.tsx:49`'s `const REFUND`**, which a `FIXTURE` grep misses.
`ReviewRenderedInContext.tsx:63`'s `export const FIXTURE` is read by its own story
(`stories.tsx:10`), which inlines a copy first.

**`ReviewUnknownCanvas` gains a `reason` prop** so "malformed" does not say "No dedicated canvas" — F56
quotes `ArtifactUnrenderable`'s AZ6 rule that the reasons must not share a sentence, and citing that
standard while breaking it is not acceptable.

##### Untouched

Every renderer's layout, the registry, `review-canvas.tsx`, the anchored commenting
(`ReviewCodeDiff.tsx:643`, `ReviewRenderedInContext.tsx:274`), and the ExaminePane. What changes inside
the renderers is the removal of invented values, two type widenings, one conditional chip, and the two
fallback repairs.

#### E. `visual_diff` — the one canvas a mapper change cannot make honest (BLK-2, founder decision)

**§2.8.2 C's "yes, once the mapper stops inventing" is retracted for this canvas, and T4e excludes it.**

`ReviewVisualDiff` renders `MockScreen` (`:114-160`) — a hand-drawn fake product screen carrying
"Create your account", "Start your 14-day trial — no card required.", an Email field placeholdered
`you@company.com`, a Password field and a "Create account" button — as **both** the Design and the Build
evidence panes, for **every** payload. It is mounted unconditionally at `:250-251` (thumbnails),
`:316-317` (side-by-side) and `:330,339` (overlay/swipe), and a figma mark is hardcoded at `:190` and
`:320`. **Confirmed in the DOM** (F71).

`VisualDiffPayload` (`review-artifact.ts:137-145`) carries `before.label`, `after.label`,
`diffRegions[{id,label}]` and `overlayMode` — **labels only, no images**. So after T4e's mapper fix a
human approving an agent's real visual comparison is still shown a fabricated signup screen presented as
that agent's before-and-after. Under ruling 14 that is prohibited on the shipping path, and there is **no
subtraction that fixes it**: the evidence panes have no real content to fall back to.

**The design cannot hold both of its own statements here.** §7 says "no canvas is designed, redesigned or
deleted" and `plan.md` puts "reworking the review product's layout or its canvases" out of scope; ruling
14 forbids what the canvas does. **This is a founder decision, not mine** — §9 question 10 states the
three options and their costs. Until it is ruled, `visual_diff` is **not** in the reachable set and T4e
does not touch it.

**Nothing waits on it.** T4e splits: **T4e-a** fixes the eight tractable canvases and the fallbacks;
**T4e-b** is `visual_diff` alone and is unscheduled until the ruling. §6.1 Run A step 5 still opens the
demo's `visual_diff` artifact and now records the fabrication rather than expecting honest content.

#### F. Withdrawn from revision 7, in full

So that nothing is left half-retracted: **Path B is void.** `ExaminePane` does **not** become
`ArtifactPreview`; the nine canvases, `canvas-registry.ts`, `ReviewUnknownCanvas.tsx`, `review-canvas.tsx`
and the canvas vocabulary in `review-artifact.ts` are **not** deleted; anchored commenting is **not**
removed; `ToolLogo.tsx` stays. §2.11 is corrected. What survives from revision 7 is the
`ArtifactRef.kind` respelling, the loader resolving the reference, `getArtifactById`, the
`submit_review` description rewrite, and the deletion of `ARTIFACT_VIEW_SHAPES` and the two dead no-op
controls.

#### G. What ruling 13 does not change

Revision 6's out-of-scope calls all stand: the notification producer (§2.8.1 D3), the assistant overlay
and session view (D4), the founder-only verdict rule (D5), the empty "Needs you (0)" sections (D6 — and
`needs` is now producible through the canvas channel's `outcome_summary.needsYou`, so it stops being an
empty section by itself once an agent supplies one). `/reviews/:reviewId` (§2.8.1 B) is unaffected, and
so is every §2.8.1 repair — the page still crashes on a real review today (F41), and the loader still has
to compose the frame the canvases sit inside.

### 2.9 Resumption, and the failure that must not be silent

**Resume.** The bake at `routes/threads.ts:1653-1697` → `resolveReengagementRequest`
(`review/src/proposed-call-workflow.ts:299-370`) is reused, re-keyed on the review message id and
**relocated to the live messages route** (§2.5.1), with the `messages` read taken through the injected
`getReviewMessage` dep (§2.5.2).

**"Nothing new is built" is retracted (r2 BLK-4).** What is genuinely reused: the whole emit-time bake
— bet, team, ranked knowledge, `harnessDisabled`, `requireRunnableAgent`, and the calling thread via
`resolveOrCreateCallingThread` — plus the intent recorder, the durable queue, the drain and the
liveness retry. What is **new**: the resolver's key and its first lookup (a review message and its
payload instead of a proposed call and its grant); a `review_approved` member of the session-request
union replacing `proposed_call`; and the correlation shape `{taskId, reviewMessageId, agentId}`. That
is a re-key of an existing machine, not a new machine — but it is not nothing, and the first revision
was wrong to say so.

**Telling the agent what was cleared.** A reengagement session always carries `requestContext`, so it
takes the `assembleTaskFreePrompt` branch (`provisioner.ts:1273`). That branch renders
`Correlation: <raw JSON>` today (`provisioner.ts:515-519`). For this source kind it becomes one
sentence: the human approved the review; if an action was cleared, its label and that the pass is good
once; and that the agent decides when the work is finished. When nothing was cleared the sentence says
only that the review was approved.

**Failure between approval and resuming (AC6), two branches, one subscriber.**

- **Admission failure.** `reactToAdmissionFailure`'s `reengagement` branch
  (`agent-run-admission-reactions.ts:107-121`) retries via the liveness net; on a terminal failure
  after the retry is spent it now posts into the thread the human approved in — the clearance row's
  `reviewMessageId` resolves it, or the payload's `taskId` when there is no clearance. The clearance
  stays `cleared` and unspent, so a later successful resume still works.
- **Session-end failure.** §2.10's re-keyed net, in the same subscriber as §2.7.

**N5 — precision.** The first revision said the current admission-failure path "tells nobody". More
exactly: the *session-end* net's second no-show writes `operationOutcomes {status:"failed", error:…}`
(`proposed-call-workflow.ts:719-726`), which the review loader nests into the review view
(`routes/reviews.ts:120-166`). It reaches a page, never a thread — and BA2 deletes the table that
surfacing writes to, which is why §2.10 replaces the surfacing rather than merely removing it.

### 2.10 The `session_ended` liveness net — survives, re-keyed, better surfaced (B5)

`registerReviewSubscriptions` (`review/src/session-review-creator.ts:34-66`) is wired in production at
`service-bootstrap.ts:379` and is `applyLivenessRetry`'s main trigger. Both tables it reads are on the
delete list, so it was neither deletable nor leavable as written.

**Decision: it survives, re-keyed, and moves into the §2.7 subscriber.** One core-api file handles both
things a session end can mean for this feature.

- **Trigger, in BA2 vocabulary:** the session ended with a clearance for `(taskId, agentId)` still
  `cleared` and never `spent` — the agent came back and did not do the thing.
- **First no-show:** `retryCount` 0 → 1 and one reengagement intent, the existing `applyLivenessRetry`
  shape (`proposed-call-workflow.ts:681-729`) re-keyed off `actionClearances`.
- **Second no-show:** the clearance moves to `abandoned` and a plain message goes into the thread the
  human approved in (`reviewMessageId` → thread). **Strictly better than today**, which writes a row
  only visible if you open the review page (§2.9 N5) — and it is what AC6 asks for.
- **The `reviewMessageId → thread` resolution takes the same injected `getReviewMessage` dep** as
  §2.5.2, for the same ownership reason — `messages` is `conversation`'s and `review` cannot import it
  (r3 BLK-3). Not left implicit.
- `handleUnconsumedGrantOnSessionEnd` and `registerReviewSubscriptions` are therefore **rewritten and
  relocated**, not deleted; `review` keeps the state transitions, the subscriber lives in the core-api
  layer where it may write a thread.

**Pre-existing bug not to reproduce.** `session-review-creator.ts:58` passes
`resolveOrCreateCallingThread` into `handleUnconsumedGrantOnSessionEnd`, and that function's own
`applyLivenessRetry` call (`proposed-call-workflow.ts:758-765`) drops it from the bake — so a
liveness-net re-provision today bakes no calling thread. The rewrite must forward it. Not chased
further; it disappears with the rewrite.

### 2.11 What is retired

**Deleted (production, and already unreachable — §1).**

- Tables `proposedCalls`, `tailoredGrants`, `operationOutcomes` (`schema.ts:1307-1392`) and their
  inferred types (`:1454-1458`); drop migration.
- `proposed-call-workflow.ts`'s capture/grant/outcome halves: `recordProposedCall`, the `consumed` and
  `outcome-recorded` transitions, `identityHash` arg-pinning. `resolveReengagementRequest`,
  `applyLivenessRetry`, `handleUnconsumedGrantOnSessionEnd` and `reengageOnAdmissionFailure` survive,
  re-keyed (§2.10).
- The workflow router in `tool-handlers/src/tool-registry.ts:86-196`, plus `ProposedCallWorkflowPort`,
  `classifyReversibility`, `identityHash` (`tool-types.ts:135-179`), `SessionWorkflow` /
  `RegistrySessionWorkflow` (`harness-adapter.ts:16-36,129`), the `sessionWorkflow` pass-throughs
  (`contracts.ts:49,257`; `runtime.ts:450`; `provisioner.ts:304,321,789,1211,1469`;
  `run-orchestration-composition.ts:230-232,332`), and the `sessionWorkflow` gating of
  `onAbortSession` (`provisioner.ts:1195`).
- `CoreApiPort.review`'s three capture ops (`core-api-port.ts:757-761`), the three
  `/api/reviews/proposed-calls*` routes (`routes/reviews.ts:185-206`), **and their only non-test
  callers, which the first three revisions missed (r3 N-5):**
  `layers/agent-orchestration/src/services/core-api-port-composition.ts:309` (the client type
  declaration) and `:807,815,824` (the three method implementations). Enumerated with
  `rg -an "proposed-calls"`: those four lines, the three routes, and two test files — nothing else.
- **The whole `POST /:threadId/messages/:messageId/verdict` route** (`routes/threads.ts:1583-1707`),
  including its `if (!pcView) return ok` branch (`:1631-1636`) and its three-value `verdictInputSchema`
  (`:1591-1594`). It is AL7's, it has zero production callers, and §2.5.1 moves its content to the live
  messages route (r3 BLK-1).
- **`FIXTURE_REVIEW` and the `"rev-1"` branch** (`routes/reviews.ts:42-87,96-98` — the pre-rebase
  `:34-79,86-89` in earlier revisions is stale; §2.8.1 A6 has it right) — a hardcoded fixture
  served from a shipping handler. This feature's rubble under the BA track's ownership rule. **r4 N-5 —
  it has one test consumer:** `layers/core-api/src/routes/__tests__/reviews.routes.integration.test.ts`
  asserts the fixture path returns 200. It goes red loudly, so this is scope accounting, not a risk.
- **The dead reversibility annotation plumbing** — `annotations.destructiveHint` / `idempotentHint`,
  declared at `framework/harness-protocol/src/harness/tool-seam.ts:99` and
  `tool-handlers/src/tool-types.ts:44,102`, forwarded by `toRegistered` (`tool-types.ts:64`), and read
  by exactly one function, `classifyReversibility`, which BA2 deletes. No tool definition anywhere sets
  it; its only exercise is `AL7-classifier.test.ts`. the proposed-call nesting in the review loader
  (`routes/reviews.ts:109-177`); `ProposedCallView`/`ProposedCallOutcomeView` in
  `core-ui/src/pages/review/review-composition.ts` and the `proposedCall` prop path in
  `ReviewActionOperation.tsx`. **The canvas, its fixture and its layout stay** — reworking canvases is
  out of scope.
- **`ProposedCallExecutedEvent`, in both copies** — `framework/event-bus/src/events.ts:574-582` **and
  the duplicate at `framework/domain-model/src/events.ts:564`**, plus its `DomainEvent` union entry at
  `domain-model/src/events.ts:634` and the `event-bus` union/registry entries. See the BA8 note.
- **r2 N-1 — barrel and type sites the first revision's list missed**, all compiler-caught but each one
  a step the builder must take: `framework/domain-model/src/proposed-call.ts` (a whole 47-line file)
  and its exports at `framework/domain-model/src/index.ts:153-154`
  (`ProposedCall`/`ProposedCallStatus`/`Reversibility`, `PROPOSED_CALL_STATUSES`/`REVERSIBILITY`);
  `framework/event-bus/src/index.ts:28`; `framework/db/src/index.ts:59,66,82`;
  `layers/agent-orchestration/src/index.ts:62`;
  `layers/agent-orchestration/tool-handlers/src/index.ts:36,39,40`; and
  `layers/core-ui/src/pages/review/ReviewComposition.tsx:733-740`, which reads
  `artifact.proposedCall` / `artifact.stagedOperation` and was absent from the UI list.
- **Tests (N4 — the first revision's list was one short):**
  `layers/core-api/src/__tests__/AL7-proposed-call-capture.integration.test.ts`,
  `AL7-two-session-loop.integration.test.ts`, `AL7-two-session-trust-first.integration.test.ts`,
  `AL7-reviews-loader-redo.integration.test.ts`, **`AL7-classifier.test.ts`** (imports
  `classifyReversibility, identityHash` at `:12`, both deleted), and
  `framework/event-bus/src/__tests__/AL7-proposed-call-types.test.ts`.
  `AL7-no-kernel-executor.test.ts` **stays** — it asserts the *absence* of a kernel executor and
  imports no deleted symbol; that assertion is still true and still worth holding.

**The review canvases are NOT deleted (ruling 13 — revision 7's Path B is void).** Revision 7 put the
nine canvases, the registry, `review-canvas.tsx`'s anchored commenting and `ARTIFACT_VIEW_SHAPES` on this
list. **All of that is withdrawn** except the last item. The canvases render real data today and the
founder has ruled they stay: see §2.8.2. What remains deleted from that block is only
**`ARTIFACT_VIEW_SHAPES` / `ArtifactViewShape`** (`thread.ts:52-59`; barrel exports at
`domain-model/src/index.ts:213,242`), once `ArtifactRef.kind` is respelled to the consolidated six
(§2.8.2 B) — a five-value vocabulary with two readers, both validators, and no renderer anywhere (F53),
which is the very break ruling 13 names. With it goes `part.ts:265-272`'s `ARTIFACT_KIND_LABEL` map and
the `text_diff → diff` Embed branch (`:277-279`), respelled to the six kinds rather than removed.

**Also still deleted (§2.8.2 D):** **eight** per-canvas fixture constants and their
guard-failure fallbacks — the data, not the renderers. **Seven are named `FIXTURE`/`CODE_DIFF_FIXTURE`;
the eighth is `ReviewActionOperation.tsx:49`'s `const REFUND`**, which a `FIXTURE` grep misses.
`ReviewOutcomeSummary` has no constant but is still fixed — its `?? 0` / `?? "Awaiting"` /
`?? artifact.title` are inventions under ruling 14 (§2.8.2 D). `ReviewRenderedInContext`'s is
`export`ed and read by its own story, which inlines a copy first. And the **invented values inside the
five mappers** (§2.8.2 D) — the success-path half revision 8 missed entirely. And the two dead no-op
controls, `ExaminePane`'s "Comment on this" (`ReviewComposition.tsx:705-713`) and `TaskSection`'s
breadcrumb button (`:293-297`).

**Renamed.** The `proposed_call` vocabulary names a dead concept; leaving it is the "finish the feature,
leave the rubble" failure the BA track's ownership rule forbids.

| from | to | sites |
|---|---|---|
| `proposed_call` session source kind / prompt mode | **`review_approved`** (§2.5.1 — the session exists because a review got a verdict, cleared or not) | `framework/domain-model/src/session-request.ts:9-23,95-104`, its check constraints, `session-requests/src/guards.ts`, `provisioner.ts` |
| `ProposedCallGrantedEvent` / `proposed_call_granted` | `ActionClearedEvent` / `action_cleared` | `framework/event-bus/src/events.ts:583-598,707`, and the emit site, which moves with §2.5.1 from the dead `/verdict` route to the live messages route. **Correction (r3 N-6):** `framework/domain-model/src/events.ts` was listed as a site and contains no `ProposedCallGranted` symbol — only `ProposedCallExecutedEvent` at `:564`. |
| `sourceCorrelation.proposedCallId` | **`reviewMessageId`** (+ `agentId`; the clearance is no longer the key — §2.5.1) | `proposed-call-workflow.ts`, `session-request.ts:95-104` |
| **r3 N-6 — three production rename sites the earlier revisions missed** | — | `framework/domain-model/src/work-intent.ts:91,335`; `layers/agent-orchestration/session-requests/src/service.ts:993,1010`; `layers/agent-orchestration/run-orchestration/src/errors.ts:20` |
| **r3 N-6 — the rename needs a `agent_work_intents` migration too** | — | `framework/db/src/schema.ts:403` enumerates `'proposed_call'` in `agent_work_intents_source_kind_ck`, and `:422` binds `kind='reengagement'` to `sourceKind='proposed_call'` in `agent_work_intents_kind_source_compat_ck`. Both check constraints must be rewritten in the same migration as the session-source rename. |
| `proposed-call-workflow.ts` | `clearance-workflow.ts` | file rename |

Enumerated cost: 20 production files carry `proposed_call`/`proposedCall`, concentrated in
`proposed-call-workflow.ts` (44) which is being rewritten anyway.

**`action_cleared` has no subscriber and will not gain one here.** `rg -a "proposed_call_granted"`
finds the emit (`routes/threads.ts:1690`), the type (`events.ts:583-598`), the registry entry (`:707`)
and tests — **no production subscriber**; the `@lore` at `events.ts:587` names a
`handleProposedCallGranted` subscription that no longer exists. Resumption is driven by the intent
recorder, not by this event. It is renamed and stays emitted-and-unread, which is legitimate under the
BA track's ruling that events are an extension surface — and it is the event BA8 should attach to.

**BA8 knock-on — flag it, do not fix it here.** `proposed_call_executed` was "emitted after an approved
call executes in session 2" (`events.ts:568-582`). Under this design HyperIdle never executes the
approved action — the agent does, and HyperIdle never learns the result (founder: *"if it fails the
agent will fix itself"*). **The event names a fact that cannot occur** and BA2 deletes it. BA8 must drop
it from its five and may attach to `action_cleared`. `.pipeline/BA.md:51` already assigns this decision
to BA2's architecture; BA2 does not edit BA8's row.

---

## 3. AC → obligation map

| AC | Obligation | Where |
|---|---|---|
| 1 — empty list, no interruption, no review | no rule matches ⇒ `allow`; §2.7 silent | §2.2, §2.7 |
| 2 — a matching action is stopped and the agent is told it needs approval and how to ask, every CLI harness | deny + terse fact + standing policy in the seed prompt, four shims | §2.3, §2.6 |
| 3 — the agent raises a review naming the action, and it reaches the human in the task's thread | `clearsRuleId` + the artifact requirement + task-thread anchoring + **the surface that makes a task-hosted review approvable** | §2.5, §2.8 |
| 4 — approval lets it act once, and the agent resumes and finishes | `cleared` → CAS to `spent`; resumption on every verdict, **on the messages route the browser calls** | §2.5.1, §2.8, §2.9 |
| 5 — an action named but never blocked stays unblocked, for everyone | a clearance row exists only because a block created it | §2.5 |
| 6 — a failure between approval and resuming reaches the human in that thread | admission-failure branch **and** the session-end net, both posting to that thread | §2.9, §2.10 |
| 7 — declining leaves it blocked | non-approve ⇒ `declined`; nothing in `cleared`; no resume | §2.5.1 |
| 8 — the review screens work and are reachable (ruling 11) | the loader composes a complete subject and the page guards it; the flat `/reviews/:reviewId` route deletes the bet condition on both entry points; the verdict outcome reaches the human; the checkout mock and the blank task-page row are repaired | §2.8.1 A/B/C |
| 9 — a review shows the real thing, not a stub (ruling 12) | an agent can supply canvas artifacts and a stored-artifact reference; no canvas substitutes a fixture when a payload does not type-guard | §2.8.2 B/D |
| 10 — an agent's review renders on the canvases and can be approved (ruling 13) | the canvas channel on `submit_review`, byte-identical to the demo world's proven shape; the loader resolves the reference; all nine kinds wired, four unexercised (§2.8.2 C) | §2.8.2 B/C |
| 11 — demonstrated end to end, DOM-read, prose-reported, no screenshots | **the manual procedure of §6.1** against the running product, plus the AH-family regression lane of §6.2 on `verify:release` | §6.1, §6.2 |
| plan constraint — a gate that fails open must be detectable | shim heartbeat → `review`-recorded per-harness fact → displayed on the permission list, with a positive dead-gate assertion per harness | §2.7, §6 |

---

## 4. Security reasoning, on the surfaces this actually reaches

- **A new state-changing HTTP endpoint reachable pre-auth** (`/action-check`). Authenticated exactly as
  its sibling: the session bridge token in the path *and* as a Bearer header, both checked, and
  `bridgeRegistry.lookup` refuses a token never issued or whose session ended (`mcp-route.ts:87-101` —
  header equality alone is explicitly not treated as proof). Abuse case: a host process guesses a token
  and probes the rule list. Closed by the same server-minted token the agent's entire tool surface
  already relies on. The response never enumerates rules — one action in, allow/deny plus the one
  matching rule's id and label out.
- **Agent-authored input reaches the rule matcher** (command string, path). Used only as the *subject*
  of a wildcard match; never stored, never interpolated into a shell command, never written to a file.
  The pattern comes from a human and is escaped before reaching a regex engine.
- **The heartbeat is written on an agent-triggered call** (§2.7). It is an upsert into a single row
  keyed `(teamId, harness)`, so a session that calls it repeatedly cannot grow the table, and the only
  values it writes are a timestamp, the session id and a counter — none agent-authored: `harness` is
  matched against the four known names and anything else is rejected, and `teamId` comes from the
  server-side session lookup, never from the request.
- **Agent-authored input reaches the clearance path** (`clearsRuleId`). An equality key against rows
  scoped to `ctx.taskId`/`ctx.agentId`, which the agent does not control. The worst a forged id does is
  fail to attach.
- **Server-minted values only enter the sandbox.** Shims are generated from the bridge token, the
  bridge URL and the harness name — the rule `provision-return-hook.ts`'s `@lore` already states.
- **Removing `--pure` widens the opencode sandbox.** The one real new exposure. §2.3.1 closes it with
  the correct lever, in the same change, and §6 names the assertion that proves it. The first revision
  prescribed the wrong lever, which would have re-opened the hole while appearing to close it.
- **This is not containment and must not be described as one.** An agent that wants to route around a
  command-text rule can (`base64 -d | sh`, a script it wrote first). Tool-level interception cannot
  close that and, per ETHOS, this package is not built for a rogue agent.
- **r4 N-6 — the cost, priced rather than assumed.** The gate is a live read per call and the heartbeat
  advances on every adjudication, so **every** `Bash`/`Write`/`Edit` in a gated session costs an HTTP
  round trip to the local bridge, a rule query and an upsert — including on a team whose rule list is
  empty. AC1's "behaves exactly as it does today" holds behaviourally and **not** in cost; that is
  stated here rather than left for someone to discover. It is accepted at `mvp`: the bridge is
  in-process on localhost, the rule query is a single indexed read on a table with a handful of rows,
  and the alternative — caching the rule list per session — would make a rule added mid-session not
  take effect, which §2.4 rules out. If it ever bites, the cheap first move is to skip the heartbeat
  upsert when the row is already fresh, which costs nothing the display needs.
- **Surfaces this change does not touch:** credentials, connections, filesystem mounting, the model
  gateway, the worker WebSocket, any outbound request to a third party.

---

## 5. Tasks

One builder per task. "Parallel with" means no file overlap and no dependency.

### Phase 2 — the loop end to end on claude-code

| # | Task | Depends on | Parallel with |
|---|---|---|---|
| **T1** | **The store.** `teamActionRules` + `actionClearances` + `teamActionGateChecks` in `schema.ts` (three owner rows; **`totals.tables` 37 → 40**, not "unchanged at 37" — `governance-registry.ts:163` asserts it equals the live table count, and T12 takes it back to 37 with the drop migration; §2.1); `adjudicateAction` carries both `phase` values (r3 N-8); migration **`0065_team_action_rules.sql`** (main took 0061–0064 during the rebase onto `eaaa74de8`; T1 is built and this is the number in the tree); `@hyperidle/review` typed functions (list/create/delete rules; match; open a block; stamp; clear; decline; CAS-spend; the net's retry and abandon); `table-owners.json`; `CoreApiPort.review` gains `adjudicateAction` **and `attachClearanceToReview`** (N3); `routes/reviews.ts` routes. Service-integration tests for the matcher, the state machine, AC5 and AC7. | — | — |
| **T2** | **The adjudicator seam.** `/action-check` on `mcp-route.ts`, handling both `phase:"action"` and `phase:"session-start"`; the per-session gate carried through `createMcpSession` → `McpSessionRegistry.lookup` → `bridge.open` (N2 — three declarations widen); `toolProvider.buildActionGate` in `buildToolProvider` (N1); the gate closure in `provisioner.ts:1333`, **not built when `params.taskId == null`** (N9); the `teamActionGateChecks` upsert on every heartbeat. **No `HarnessCapabilities` field, no `session_ended` field, no teardown read — all removed in revision 3.** | T1 | T4, T5 |
| **T3** | **claude-code.** The generated `action-check.js`; the `PreToolUse` entry beside `Stop`; the session-start heartbeat. The standing-policy section in the three prompt assemblers. | T2 | T5 |
| **T4** | **The human half, server side.** `submit_review` re-anchored to the task thread; `clearsRuleId` + the artifact constraint (B3); `ReviewPayload` **and `reviewPayloadSchema`** gain **optional** `taskId`/`clearsRule`/`clearsRuleRequested` (r3 BLK-4, r2 N-3); **the verdict logic in the live messages route, replacing `void decision` at `threads.ts:1537`** (r3 BLK-1) — clear-or-decline, resumption on every verdict, all five decisions mapped (r3 BLK-2), adopting the route's existing founder + non-self authz; **the reengagement re-key onto the review message id** with the `review_approved` session-request member; **the injected `getReviewMessage` dep on `ReviewPorts` and its core-api-layer implementation** (r3 BLK-3); the per-decision resume sentence; the admission-failure notification. | T1 | T2, T5 |
| **T4b** | **The human half, surface — and AC8's reach-and-act repair (r3 BLK-1b, r4 BLK-1, ruling 11).** **The route flattens first (§2.8.1 B):** `router.tsx` serves `reviews/:reviewId` and **deletes** `work/bet/:betId/review/:reviewId` outright — not a param-forwarding redirect; corrected per NB-8 below, since no persisted row holds the old shape and a redirect would be exactly the compat shim CLAUDE.md's absolute rule 2 forbids; `open-handler.ts`'s `case "review"` drops the betId preference chain and `OpenHandlerContext.betId`; `part.ts` drops `betId` from `ReviewTarget` (`:103-106`), both builders (`:375`, `:411`) and the `OpenTarget` member (`:205-209`); `PartList.tsx` drops the `betId` param and the `canOpen` computation (`:38,44-47`) and `ReviewRequestPart.tsx` its `canOpen` prop (`:22,31,63`); `Conversations.tsx` drops `reviewBetId` (`:475-490`) **and repoints `InspectDestination`'s regex (`:291-295`)**; `ReviewPage.tsx` drops `betId`/`overrideBetId`. **Then the loader (§2.8.1 A):** `routes/reviews.ts`'s handler body is replaced by a **fallback layer under the persisted payload** — `{...composedDefaults, ...persistedPayload}`, persisted always wins (BLK-1). Composed only when absent: `taskId`/`taskTitle`, `betId`/`betTitle`, author and reviewer names, `producedAgo`, `prompt`, `blocking`, `outcome` from `payload.reasoning`, and `[]` for `resultKpis`/`intent`/`needs`/`conversation`/`artifacts`. Always composed, never from the payload: `threadId` and `verdict`. **A demo review must come back with every field it returns today — all three canvases, its KPIs, `tokens: "9.2k"`, `tools` — i.e. a strict superset, since the response also gains `threadId` and `verdict`** (NB-4: "byte-identical" was wrong and would fail its own §6.2 assertion) — and `artifacts` must pass through untouched, or the canvas channel is dead on arrival. Plus a 404 for a non-review message. **Then the page:** `ReviewPage` fetches `GET /api/threads/:id` with the returned `threadId` instead of `useHostThread`'s by-host lookup (r4 N-3; `useHostThread.ts:87` also takes `threads[0]`, the wrong thread when a host has several), guards the loader payload and renders `ErrorState` rather than throwing, and reads `postVerdictHostMessage`'s `"ok"` / `"race"` / `"forbidden"` outcome plus any throw so a refused verdict is not silent. **And `submit_review` seeds the human** on a thread it creates, via `resolveReviewRecipientsForItem` + `mergeParticipants` — the precedent nine lines up in its own file (`tool-definitions.ts:450-467`). **Also (NB-9):** `part.ts:411` gives a resolved **questionnaire** a `reviewTarget`, and `ReviewResolvedPart.tsx:49-63` renders "Inspect review" unconditionally — once the no-op is removed that navigates to `/reviews/<id>`, which A2 then 404s. Today's dead button becomes a 404; drop the `reviewTarget` from the questionnaire branch. **And (NB-8) delete `work/bet/:betId/review/:reviewId` rather than redirecting it** — enumerated readers are `open-handler.ts` (builds it at runtime), `router.tsx:89`, tests and a fixture; **no persisted row holds it** (notification `sourceLink` is `/conversations/:threadId`), so a redirect is a compat shim CLAUDE.md's absolute rule 2 forbids with nothing to bridge. **Files:** `router.tsx`, `open-handler.ts`, `part.ts`, `PartList.tsx`, `ReviewRequestPart.tsx`, `ReviewResolvedPart.tsx`, `Conversations.tsx`, `ReviewPage.tsx`, **`review-composition.ts`** (NB-1 — `threadId` is new on the client type), `routes/reviews.ts`, `tool-definitions.ts`. Without this the review page crashes on every real review (F41) and neither entry point resolves for a task host (F43). | T4 | T2, T5, T4c |
| **T4c** | **AC8's two render repairs (§2.8.1 C).** Delete `CheckoutProof`/`CheckoutCard` (`ReviewComposition.tsx:346-352,355-414`) and its unconditional call site (`:450`) — a hardcoded "SPRING24 / $120.00" checkout mock rendered inside every review (F42) — with `ResultRow` if it has no other reader; and render the `{tokens} · {producedAgo}` separator (`:258`) only when both sides are non-empty. Then make `CommentRow`'s `type:"review"` body render the review's title instead of `null` (`CommentRow.tsx:209-212`), so a review is not a blank row on the Task and Bet pages (`WorkTask.tsx:342`, `HostThreadSection.tsx:255-266`). Text only, no navigation, no layout change. **Files:** `ReviewComposition.tsx`, `CommentRow.tsx` — disjoint from every other task. | — | all |
| **T4d** | **The two breaks, with all three write gates opened (§2.8.2 B).** **Schemas first:** split `review` into a strict write arm and a tolerant read arm, the shape `plainPayloadSchema` / `plainPayloadSchemaWithToolCalls` already has in the same file (`threads-schema.ts:150-159,213-231`) — `reviewPayloadSchemaRow` wired into `messageRowSchema`. Write arm: `artifactRef` `.optional()`, **`artifacts` declared** (undeclared is silently stripped at `threads.ts:1301-1305` — executed, F65), `artifactRef.kind` `z.enum(ARTIFACT_KINDS).optional()`. Read arm: `artifactRef.kind` `z.string().optional()` so the three demo rows still parse (`rowToMessage` throws — `threads.ts:593-596`; F66). **Then the tool:** `submit_review`'s branch becomes `if (input.artifactRef` **or** `input.artifacts?.length)` (`tool-definitions.ts:643`); `artifacts` validated on the **envelope only** — `kind` against the new `REVIEW_CANVAS_KINDS` in `domain-model`, `payload` opaque (§2.8.2 B2); each `artifactRef` id checked to resolve to an artifact with `producingTaskId === ctx.taskId`; description rewritten to name the nine kinds. **Then the seams:** `REVIEW_CANVAS_KINDS` added to `framework/domain-model` and core-ui's `ReviewCanvasKind` **re-derived from it, not copied**; `CoreApiPort.getArtifactById` (`core-api-port.ts:214-220` shape) over `GET /artifacts/:id`; the loader resolves refs and **appends to the payload's existing `artifacts`**, adding its own `work.get` on the surviving early-return path (the `:146` call is in the branch §2.11 deletes — NB-6). **Then the readers:** `part.ts:266-282`'s `ARTIFACT_KIND_LABEL` respelled to the six kinds and the `text_diff` branch removed — `npm run check` does **not** catch the label map (NB-4); the three demo `artifactRef` literals (`conversations.ts:419,603,772`) moved to six-kind values. **And the seeding ruling 14 allows:** four canvas payload literals added to the existing demo reviews' `artifacts` arrays — `field_change_set`, `rendered_in_context`, `batch` and `action_operation`, the four kinds with no data anywhere. **Name the host review for each so the demo stays coherent** — a Stripe refund inside the pricing-page review would be nonsense; put `action_operation` and `batch` where a support/billing bet already exists and `field_change_set`/`rendered_in_context` where a record or message change does. So all nine canvases have real data and §6.1 Run A covers all nine. Data only, no code. **Files:** `threads-schema.ts`, `threads.ts`, `thread.ts`, `domain-model/src/index.ts`, `review-artifact.ts`, `tool-definitions.ts`, `core-api-port.ts`, `core-api-port-composition.ts`, `routes/reviews.ts`, `part.ts`, `demo-world/conversations.ts`. Shares `routes/reviews.ts` with T4b, so it follows it. | T4b | T4c, T5 |
| **T4e-a** | **No fabrication, eight canvases (§2.8.2 D).** **The property, not a string list:** no string or number reaches the DOM that the payload did not supply, except chrome that names a region. **Success path:** `metrics_moved` `:460-469` (the whole narrative, `Apr`/`May` heads, the USD coercion at `:195-209` — and make the payload's own `period` render); `batch` mapper `:520,522,547,548,554` + view `:284-289`; `browser_preview` mapper `:479-500` + **the `Founder` tier hardcoded in the view at `:233`** + stop rendering `previewBody` twice as text; `code_diff` **`:335-336`'s `coverage +0.4%`** and `:751-753`'s trivia framing; `field_change_set` mapper `:373-374` + **view `:212`'s Salesforce mark and `:335`'s invented field names (both behind disclosures — expand to verify)**; `rendered_in_context` `:535-552`; `action_operation` `:453-465` **plus the "Approve refund" button label**; `outcome_summary` `:374` — **`tokens` is guard-skipped, so the chip renders conditionally rather than defaulting** (deleting `?? 0` renders `undefined tok`). Two literal types widen to `string`: `ReviewFieldChangeSet.tsx:47`, `ReviewBatch.tsx:60`. **Guard-failure path:** all nine fall back to `ReviewUnknownCanvas` with a new `reason` prop; delete the eight constants — seven `FIXTURE`/`CODE_DIFF_FIXTURE` plus **`ReviewActionOperation.tsx:49`'s `REFUND`** — and `ReviewRenderedInContext.stories.tsx:10` inlines its own copy first. `ProposedCallArgsPanel`'s deletion (§2.11) lands **here**, never before the `stripe` fix. Also the two dead no-op controls (`ReviewComposition.tsx`). **No layout changes.** | T4c | T4d, T5 |
| **T4e-b** | **`visual_diff` — BLOCKED on a founder decision (§2.8.2 E, §9 q10).** `MockScreen` (`:114-160`) renders a fabricated signup screen as *both* evidence panes at `:250,316,330,339`, with figma marks at `:190,320`; the payload carries labels only, so no mapper change makes it honest. Unscheduled until ruled. **Nothing else depends on it.** | founder ruling | — |
| **T4f** | **The proof (AC10/AC11, §6.1 and §6.2).** **§6.1 is the deliverable**: the ordered manual procedure, run against `npm run dev` with a demo-seeded database, reported in prose from the DOM — no screenshots. Plus the automated net: a fourth AH-family lane (`playwright.review.config.ts` + `__scripts__/review-test-server.ts`, own `testMatch`, **no `grepInvert`**, real Hono API on a migrated per-boot PGlite dir), seeded through the **real `create_artifact` and `submit_review` handlers**, with `npm run test:e2e:review` added to **`verify:release`** — local-only, founder-confirmed; the three existing AH lanes are run by nothing, and an unrun lane is not evidence. | T4b, T4d, T4e-a, **T4, T6** | — |
| **T5** | **Settings.** `GET/POST/DELETE /api/settings/action-rules?teamId=…`, the GET also returning the `teamActionGateChecks` rows; `SettingsActionRules.tsx` + `.stories.tsx` + section registration, including the "checked by … / no agent session has consulted this list yet" line (§2.7). | T1 | T2, T3, T4 |
| **T6** | **The session-end net.** The re-keyed `session_ended` subscriber (B5): a clearance still `cleared` and never `spent` → one retry, then `abandoned` plus a message in the approving thread. Includes replacing `session-review-creator.ts`'s subscription and forwarding `resolveOrCreateCallingThread` into the bake. **The gate-unproven alarm is gone** — §2.7 is a recorded fact, not a subscriber. | T1, T2, T4 | — |
| **T7** | **The proof.** The `[harness:claude]` lane in `layers/core-api/src/__tests__/action-gate-realbinary.integration.test.ts`, **added to the explicit `HARNESS_INCLUDE` list** (`vitest.integration.config.ts:21-45`) — it does not match `*-real.integration.test.ts`, and unlisted it falls into the service lane's `layers/**` include and hard-fails CI where the binaries are absent (that file's own lore at `:36-39`); the gate-alive assertion; recorded-payload service tests for the route. | T3, T4b, T4c, T4d, T6 | — |

### Phase 3 — the remaining harnesses to equal coverage

The contract is frozen by T3. These touch disjoint files and are **mutually parallel**. Each carries its
own session-start heartbeat, which is the only thing that makes its harness appear on the permission
list's "checked by" line — there is no separate declaration to forget (r2 BLK-3).

| # | Task | Depends on | Parallel with |
|---|---|---|---|
| **T8** | **codex.** Shim + `PreToolUse` in the CODEX_HOME `hooks.json`; `apply_patch` path extraction; session-start ping; an assertion that `--dangerously-bypass-hook-trust` is still passed. `[harness:codex]` lane. | T7 | T9, T10, T11 |
| **T9** | **cursor-agent.** New `.cursor/hooks.json` writer beside `writeCursorJson`; shim with `user_message` + `failClosed`; `^Write$` with the `MCP:`/`Read` exclusions; session-start ping. `[harness:cursor-agent]` lane. | T7 | T8, T10, T11 |
| **T10** | **opencode.** Gate plugin in opencode's real plugin API; **`--pure` removed from both spawn sites** with **`XDG_CONFIG_HOME` injected into `resolvedEnvMap`, not allowlisted** (§2.3.1); the resolved-config isolation assertion; session-start ping; a regression check that the existing opencode lane still passes. Largest of the four. | T7 | T8, T9, T11 |
| **T11** | **builtin.** A `[harness:builtin]` lane asserting the ruled consequence: a team rule does not reach a builtin agent, and that a builtin session writes no `teamActionGateChecks` row — builtin never appears on the "checked by" line, which is ruling 7's accepted consequence stated as a fact rather than an alarm. | T7 | T8, T9, T10 |

### Phase 4 — retire and correct

| # | Task | Depends on | Parallel with |
|---|---|---|---|
| **T12** | **Delete the capture machinery.** §2.11's delete list, including the drop migration and the six test files. **`table-owners.json` back to `totals.tables` 37 in the same commit** — three owner rows removed with the three dropped tables; `governance-registry.ts:163` fails the lint otherwise (§2.1). Must follow phase 3 — until then those tests are the only exercise some paths get. | T8–T11 | T14 |
| **T13** | **Rename the vocabulary.** §2.11's rename table, including the session-source check constraints. | T12 | T14 |
| **T14** | **The docs.** Rewrite `docs/process-layer/staged-operation.md` from scratch. Correct the pages that repeat its mechanism: `docs/human-interface-layer/review-primitive.md`, `docs/architecture/as-implemented-domain-architecture.md:127`, `docs/agent-layer/harness-capability-descriptor.md:150-153`, `docs/architecture/system-overview.md`, `docs/architecture/system-boundary.md`, `docs/process-layer/canonical-shapes.md`, `docs/process-layer/index.md`, `docs/human-interface-layer/overview.md`, `docs/human-interface-layer/items-and-routing.md`, `docs/system-prompts/assistant.md`. **Also one line on `ReviewActionOperation.tsx:1-17`**, whose header still describes the killed concept ("staged, PRE-COMMIT receipt … the reviewer's verdict is what fires the side-effect") — the canvas stays (F12), but the stale framing must not read as current. A general sweep is out of scope. | T12 | T12, T13 |

**Migration filenames are descriptive, not id-prefixed** (`0065_team_action_rules.sql`, and the phase-4
drop takes whatever number is next at the time — main moves), diverging deliberately from the `0059_BA1_…` precedent: work-package
ids do not belong outside `.pipeline/`.

---

## 6. Verification

### The one piece of end-to-end evidence

**Lane:** `npm run test:integration:harness` (local only; part of `verify:release`; no CI job).
**File:** `layers/core-api/src/__tests__/action-gate-realbinary.integration.test.ts`, one
`describe("[harness:<name>]")` per harness, following
`real-harness-return-enforcement-realbinary.integration.test.ts`.
**Gate:** `requireHarness(<name>)` — a missing binary hard-fails, never `skipIf`.

Per harness, with the real binary, a real PGlite database, the real Hono app and the real bridge —
nothing on the chain stubbed:

1. Seed a team, a task, an agent, and one `teamActionRules` row.
2. Provision a real session; prompt the agent toward the gated action.
3. Assert the action **did not happen** (checked on disk / by absence of effect, not inferred from the
   stream) and that the deny text reached the model.
4. Assert `submit_review` was called with `clearsRuleId` **and an artifact**, that the message landed
   in the **task's** thread as `type:"review"`, and that a `blocked` row carries that `reviewMessageId`.
5. POST the real approve verdict **the way the browser does** — `POST /api/threads/:id/messages` with
   `type:"verdict"`, as a founder, non-self (r3 BLK-1). Not `/verdict`, which has no production caller
   and which BA2 deletes. Assert the clearance is `cleared` **and** a reengagement intent was recorded.
6. Run the resumed session; assert the action **did** happen and the clearance is `spent`.
7. Attempt once more; assert it blocks again.
8. **Positive heartbeat assertion (r2 BLK-5).** Assert `GET /api/settings/action-rules?teamId=…`
   reports a `teamActionGateChecks` row for this harness whose `lastSeenAt` advanced across the run and
   whose `checks` increased. A route or an upsert that does nothing fails this.

**Named per-finding assertions** added to the same lane:

- **B3** — `submit_review` with `clearsRuleId` and no `artifactRef` returns `INVALID_INPUT` and stamps
  nothing.
- **B4 / r2 BLK-4** — with an **empty** rule list, an agent that self-elects a review, approved by a
  human, **is resumed** — the founder's day-one flow, a first-class assertion, and the case that has no
  clearance id to key on. Asserted through the real durable queue, so the `review_approved` request row
  and its `notNull` `sourceId` are exercised, not just the resolver.
- **r2 N-4** — a **declined** review also resumes the agent, carrying the rationale, and the action is
  still blocked afterwards (AC7).
- **AC8 / r3 BLK-1b / r4 BLK-1 — the human path is real. Three assertions, three seams, each red
  today, none sufficient alone.** Revision 4 named a `ReviewPage` component test and it would have gone
  green with the entry point invisible; revision 5 moved it up to `Conversations`. Moving it up once
  more is not the answer either — **a `Conversations`-level component test still hand-feeds the loader,
  so it goes green while the real route returns three fields and the page crashes** (F41). That is the
  same mistake at a higher altitude. The seam the component lane cannot see needs its own assertion,
  and the page needs to be total over the worst input the loader can produce.

  1. **Service lane — the loader returns a review a surface can render.** Seed a task, a thread and a
     `type:"review"` message the way `submit_review` writes one, then `GET /api/reviews/:id` and assert
     the response carries every field `ReviewComposition` dereferences — `artifacts`, `conversation`,
     `tools`, `intent`, `resultKpis`, `needs` as arrays, and `title`, `outcome`, `betTitle`,
     `authorName`, `reviewerName`, `producedAgo`, `blocking` — **and that the values are right**:
     `threadId` is the review message's own thread (not a by-host lookup), `taskId` is the task,
     `outcome` carries the agent's `reasoning`, and `verdict` is absent before a verdict and present
     with the decision after one. Then a second review under the same task, resolved by a verdict,
     asserts the verdict arm. Also: a `type:"questionnaire"` message id returns 404. **Red today** — the
     route returns `{title, reasoning, artifactRef}` and 200s on a questionnaire.

     *Named limit:* the field list is written by hand against `ReviewComposition.tsx`'s line-cited
     dereferences and can drift from it. The route's locally-annotated build (§2.8.1 A1) catches a
     *missing* field at `npm run check`; assertion 3 catches the page's behaviour when one is missing
     anyway. Neither makes the list self-maintaining, and at `mvp` that is accepted rather than solved.

  2. **Component lane, `Conversations` level — the whole human hop.** Render `Conversations` on a
     **task-hosted** thread holding an unresolved BA2 review and assert a reachable "Open review"
     affordance whose click navigates to `/reviews/:reviewId`; then that `ReviewPage` on that route
     reaches a live approve control whose click issues the messages-route POST. Then the same for a
     **resolved** review: "Inspect review" navigates rather than swallowing the click. **Red today for
     three independent reasons and it stays red if any one is skipped** — the "Open review" button does
     not render at all on a task host (F43: absent from the DOM), "Inspect review" renders and produces
     zero navigations (F43), and the page derives `hostId` from a payload carrying neither `taskId` nor
     `betId` so `handleSubmitVerdict` returns on its first line (`ReviewPage.tsx:175-176`).

  3. **Component lane, the crash guard — the assertion that cannot be faked by a fixture.** Render
     `ReviewPage` with a loader returning **only a `ReviewPayload`** — the production type imported from
     `@hyperidle/domain-model`, so the test's input follows the real shape and cannot drift into a
     convenient one — and assert the page renders its `ErrorState`, **not** that it throws. **Red
     today**, and this is the one that was executed: F41 records
     `TypeError: Cannot read properties of undefined (reading 'find')` at `ReviewComposition.tsx:768`
     with a rendered body of `<div />`. This is what makes a future loader regression a named error
     instead of the shell's "Something went wrong".

- **AC8 / T4c — the two render repairs.** In the component lane: `ReviewComposition` rendered with a
  BA2-shaped subject contains **neither** `"SPRING24"` nor `"$120.00"` (red today — F42 found both in
  the rendered DOM of the shipping route), and renders no bare `" · "` when `tokens` is empty (red
  today — F42). And `CommentRow` given a `type:"review"` message **with no rich slots** renders the
  review's title (red today — the body switch returns `null`, `CommentRow.tsx:209-212`), while the same
  message **with** rich slots is unchanged, so `ThreadShell` is provably not affected.

- **B5** — approve, then end the resumed session without the action: assert one retry, then on the
  second no-show `abandoned` plus a message in the approving thread.
- **r2 BLK-5 — the dead gate, detected. Per harness, and this is the assertion that matters.** Break
  the shim exactly as the red table below says, run the *same* session with the *same* rule, and assert
  **both**: (a) the gated action **happened** — the gate really is dead, not merely quiet; and (b) the
  team's `teamActionGateChecks` row for that harness did **not** advance, so the permission list still
  reports that harness as never-checked while an action it covers went through. That pair is a real
  dead gate being detected by the mechanism, not a synthetic condition. It goes red if the heartbeat is
  ever written from anywhere but a live shim — provisioning, session start, or teardown — which is the
  one way this mechanism could be made to lie.
- **B2 / ruling 7** — a builtin session writes no `teamActionGateChecks` row, so builtin never appears
  on the "checked by" line. Nothing is posted anywhere for it.
- **B6** (opencode only) — with the sandbox's provisioned environment, `opencode debug config`
  resolves **no** `plugin` path outside the sandbox and **no** MCP server other than `hyperidle`.
  **r2 N-5 — the decoy must be reachable for the assertion to be non-vacuous:** plant a decoy plugin
  and `permission` block in a scratch directory **and set `process.env.XDG_CONFIG_HOME` to it before
  spawning**, because `buildSandboxedEnv` copies from `process.env` and copies nothing when the
  variable is unset (`cli-harness-adapter.ts:314-320`). The red case is then exactly the named one:
  allowlist `XDG_CONFIG_HOME` instead of injecting it and the decoy appears in the resolved config.
  Research §5 (`opencode.md:167-179`) proved both halves live, so this is the inverse of a demonstrated
  finding.

**What makes it go red:**

| harness | break | expected failure |
|---|---|---|
| claude-code | remove the `PreToolUse` entry from the provisioned settings | step 3 fails (the command runs) and the heartbeat never advances — the dead-gate assertion's two halves |
| codex | drop `--dangerously-bypass-hook-trust` | step 3 fails **with no signal from codex at all** — the heartbeat is the only thing that shows it |
| opencode | re-add `--pure` | the plugin never loads; step 3 fails and the heartbeat never advances |
| opencode | allowlist `XDG_CONFIG_HOME` instead of injecting it | the B6 assertion fails — the decoy plugin appears in the resolved config |
| cursor-agent | drop `failClosed: true` and make the shim exit non-zero | the action runs; step 3 fails. The session-start heartbeat may already have landed before the crash, so **this harness's dead-gate case is proven by step 3, not by the heartbeat** — stated rather than papered over |
| any | write the heartbeat from provisioning or teardown instead of from the shim | the dead-gate assertion goes green when it must be red — the one way this mechanism could lie, and the CI half asserts against it directly |
| any | delete the standing-policy section from the seed prompt | step 4 becomes unreliable — the model may read the deny as an injection and refuse (research §4: Sonnet, twice) |

**Steady-state flakiness, named where it will be read.** Step 4 is a live-LLM behavioural assertion.
Research §4 records Sonnet refusing the push-back twice on two phrasings before the seed-prompt
mitigation, and complying first try after it. Expect this step to be the lane's least stable and treat
a single failure as a signal to re-read the deny wording, not to bump a model —
`HARNESS_TEST_MODELS` is founder-set.

**T11's builtin lane cannot go red if the feature breaks**, because it asserts an absence. It is a
guard against papering over ruling 7, not evidence the feature works. Listed in the must-be-green set
for that reason and no other.

### The CI-runnable half

`npm run test:integration:service` (real DB + real app fixtures), covering everything that needs no
binary:

- the wildcard matcher, including metacharacter escaping and deterministic first-match ordering;
- the clearance state machine: block → clear → spend; block → decline; cleared → retry → abandoned; a
  second CAS-spend of the same row returning nothing;
- **AC1** — with no rules, `/action-check` allows and no clearance row appears;
- **AC5** — a review naming a rule that never blocked attaches nothing and the action stays allowed
  after approval;
- **AC6** — a terminal `agent_run_admission_failed` on a reengagement, and a session-end second
  no-show, both post into the approving thread;
- **AC7** — after a decline, the same action is denied again;
- **r2 BLK-4** — the verdict branch resumes with no clearance present, keyed on the review message id,
  and posts a message into that thread when it cannot;
- **r3 BLK-2** — all five verdict decisions reach the live messages route and map to approving /
  non-approving as §2.5.1 states. (They already all arrive — `verdictPayloadSchema.decision` is
  `z.enum(VERDICT_DECISIONS)`. The assertion pins the mapping, not a fix.);
- **r3 BLK-4** — a review row written **before** BA2 (payload `{title, reasoning, artifactRef}`) still
  parses through `messageRowSchema` and lists in its thread, and approving it takes the
  cannot-resume branch **silently**, without the false "could not be brought back" message (r4 N-1);
- **r4 BLK-2 — the throw branch, the one part of AC6 nothing proved.** With the intent recorder forced
  to throw, assert the verdict is still resolved, a message lands in the approving thread, and the
  response is **not** a 5xx. Red if the post-commit block is left unwrapped, which is what copying the
  neighbouring site (`threads.ts:1477-1485`) would produce;
- **r2 N-3** — a review whose `clearsRuleId` matched no block renders the "nothing matching it was
  blocked" line rather than the clearing line;
- **§2.7** — the heartbeat upsert is idempotent and bounded to one row per `(teamId, harness)` across
  many sessions; the settings response renders "never checked" for an absent row; **no server-side path
  writes the row** (asserted by driving provisioning and a synthetic `session_ended` and checking the
  table is untouched);
- **the payload round-trip** — a `ReviewPayload` carrying `taskId` and `clearsRule` survives write and
  read-back through `reviewPayloadSchema` (the `toolCalls` stripping trap, §2.5);
- **the shims' recorded payloads** fed to the route, asserting normalization and the `MCP:`/`mcp__`
  skip. **N7 — three harnesses only.** opencode's `write`/`edit` argument shape was never captured
  (feasibility F9) and must not be written from memory; opencode's file-write payload joins this set in
  T10.

That last item tests **the route**, not a harness, and is not harness coverage.

## 6.1 The manual test — an agent's review, seen and approved (AC10/AC11, ruling 13)

**This is a deliverable, not a note**, and it is written for someone who was not in this conversation.
Ruling 13: *"we should manually test that an agent creates a review and we can see it and approve it."*
**Everything asserted is read from the DOM or from a visible surface and reported in prose. No screenshot
is taken, and a screenshot is not evidence in this repository.**

**It is two runs against two different trees, and that is deliberate (BLK-7).** Revision 8 asked for
"T4b–T4e merged" and then claimed Part 0 passes "before any BA2 change" — a contradiction a person cannot
satisfy, which would have made a working environment look broken.

| run | tree | needs merged | proves |
|---|---|---|---|
| **A — baseline** | `origin/main`, or the BA2 branch before any T4 task | **nothing** | the canvases already render real data — the record that revision 7's premise was false |
| **B — the story** | the BA2 branch with the tasks below | see each part | an agent's review renders and can be approved |

**Run B's dependencies, in full.** Revision 8 listed only T4b–T4e; four more are needed and are named here
because a person cannot infer them.

| part | requires |
|---|---|
| Run B Part 1, **steps 7–13**, Route A | **T4b, T4c, T4d, T4e-a** — the loader, the entry point, the canvas channel, no fabrication. Step 13 is the demo-regression re-run and belongs to Part 1 |
| Run B Part 1 step 7, **Route B** | Route A's four **plus T1** (rule store), **T2** (adjudicator seam), **T3** (claude shim), **T5** (the settings screen that creates the rule). *T1 and T2 are built and green; T3 and T5 are not, so Route B is unavailable until they are* |
| Run B Part 2, **steps 14, 15, 17** | Route A's four **plus T4** — the verdict logic. Without it the decision is discarded at `threads.ts:1537` and nothing on the page changes |
| Run B Part 2, **step 16** (Route B resume) | Route B's set plus **T4** and **T6** (the session-end net) |
| Run B Part 3, **steps 18–20** | T4d and T4e-a only |

**Preconditions.** `npm install` done; nothing on 3001/5173; `OPENROUTER_API_KEY` or a configured CLI
harness for step 7.

### Run A — the baseline: the canvases already render real data

Run this **first and on an unmodified tree**. It takes no BA2 change and must pass there. If it fails,
the environment is wrong — that judgement is only valid on this tree, which is why it is run here and not
after a merge.

1. `npm run setup -- --demo` — seeds the Acme demo world (`setup-cli.ts:203-206` → `seedDemoWorld`).
2. `npm run dev`; open `http://localhost:5173/conversations`.
3. Open the thread holding the pricing review. **Expect:** a "Review requested" card with the title and an
   **"Open review"** button. *(On this tree the button appears because the thread is **bet**-hosted —
   `PartList.tsx:46`'s `canOpen`. On run B's tree that gate is gone and the button appears for a task host
   too; that is §2.8.1 B and it is what step 9 checks.)*
4. Click it. **Expect:** the title, the agent → reviewer line, a "Result" section with three KPIs
   ("Support pricing questions 4 / week", "Page length -38%", "Mobile comparison stacks clean"), a
   "Needs you (1)" entry, and an **"Artifacts (3)"** list.
5. Open each artifact and **record the text actually on screen**:
   - *Outcome summary* → `outcome_summary`: "Two-tier pricing page built from the approved structure", and
     the done-condition "Copy final on every section" with its "FAQ lands tomorrow from Growth" note.
   - *Pricing page — before / after* → `visual_diff`: the two region labels, "Comparison table replaces the
     middle tier" and "Hero leads with the trial, not the logo".
   - *Rendered preview* → `browser_preview`: the URL `https://acme.example/pricing-preview` and the
     headline "Pricing — Pulse". **Record also what is fabricated here** — a `Solo` tier at `$19 /mo`, nav
     links "Product / Pricing / Docs / Changelog", and the preview HTML rendered twice as prose. **None of
     it is in the payload** (`conversations.ts:516-527`); it is `mapBrowserPayload:479-500`. This is
     BLK-5 observed, and it is what run B step 12 must find gone.
6. Repeat on the other two demo reviews for `code_diff` (×2) and `metrics_moved`. On `metrics_moved`,
   record that every figure is attributed to **QuickBooks** — also fabricated (`:528-535`).
6b. **On run B's tree only, four more kinds have data** (T4d seeds them — ruling 14 allows demo rows):
   open the `field_change_set`, `rendered_in_context`, `batch` and `action_operation` artifacts and record
   a quoted string from each. **All nine canvases are then covered**, which is what makes AC10's "the
   canvases work" a demonstrated fact rather than five-ninths of one. On this baseline tree those four
   have no data and there is nothing to open — record that too.

**Report:** the five kinds named with a quoted string from each, **and the fabricated strings found
alongside them**. Run A is the record both that the renderers work and that they invent.

### Run B, Part 1 — an agent produces a review, and it renders

7. Create a task and give an agent work that ends in a review. It is made to produce one by the standing
   seed-prompt policy (§2.6) and `submit_review`'s rewritten description (§2.8.2 C). **Do not hand it a
   payload** — the point is that it composes one.
   - **Route A (day-one flow, no blocking):** ask for work worth reviewing and for a review when done.
   - **Route B (BA2's own loop):** add a team rule in Settings covering the action it will need, let the
     push-back fire, let it raise the review naming the rule to clear. *Requires T3 and T5.*
8. **Where the human looks:** the bell shows nothing for an agent-raised review (§2.8.1 D3, a known and
   accepted gap) — go to `/conversations`. **Expect:** the task's thread with an unresolved-review
   indicator (`threads.ts:826-836`).
9. Open the thread. **Expect:** the review Part, and an **"Open review"** button **on a task-hosted
   thread**. Record that it is present. *(Before T4b it is absent — F43.)*
10. Click it; the URL is **`/reviews/:reviewId`** (§2.8.1 B). **Expect:** the title, the agent's reasoning
    as the Result prose, and an Artifacts section listing what **the agent supplied**. Record the count and
    each title. *(If this section is empty, the canvas channel did not survive the write path — BLK-2.)*
11. Open each. **Expect** the canvas the agent chose, rendering **the agent's content**. Record a quoted
    string from each that could only have come from this run.
12. **The negative, stated as the property — a string list is not the test.** For each artifact opened,
    check every string and number on screen against what the agent's payload supplied. **Anything a
    reader could take for real data that is not in the payload is a failure**, whatever it says; region
    labels ("Blast radius", "files changed", "Needs you") are chrome and are fine. **Expand every
    disclosure** — "Source", "+N unchanged", the trivia block — because two known fabrications sit
    behind them (§2.8.2 D). Known strings to confirm gone: `"SPRING24"`, `"$120.00"` (T4c);
    `"Solo"`, `"Founder"`, `"$19"`, `"Product"/"Pricing"/"Docs"/"Changelog"`, `"mailchimp"`,
    `"hello@example.com"`, `"quickbooks"`, `"stripe"`, `"Approve refund"`, `"salesforce"`,
    `"Owner, Lead source, Probability"`, `"Median first response"`, `"CHURN THREAT"`,
    `"coverage"`/`"+0.4%"`, `"Recognized revenue"`, `"from April"`, `"0 tok"`. **The list is a
    convenience; the property is the test** — revision 9's step 12 listed seven strings and would have
    passed with twelve other fabrications on screen.

12b. **`visual_diff` is the exception and is recorded, not failed (§2.8.2 E).** Until the founder rules,
    its evidence panes still show the fabricated signup screen. Record what is on screen; do not treat it
    as a defect of T4e-a.

13. **Re-run run A's steps 3–6 on this tree.** Every demo review must still show its three KPIs, its
    done conditions, its needs, its tools, its token count and all three canvases. **This is the BLK-1
    regression check** and it is the reason the loader layers rather than replaces.

### Run B, Part 2 — the human acts, and the outcome is observed

14. Click **Approve** as the founder identity. **Expect:** the verdict controls disable and the chosen
    decision is shown — the page changes. Record what changed. *(Before T4b nothing changes — F47.)*
15. Return to the thread. **Expect:** the review now renders as a resolved Part — "Approved by <you>".
16. **Route B only:** confirm the agent resumed and finished, that the cleared action was performed
    **once**, and that attempting it again blocks (AC4/AC5).
17. Reload `/reviews/:reviewId`. **Expect:** resolved, same decision, artifacts still rendering. This
    distinguishes a real write from optimistic UI.

### Run B, Part 3 — the honest negatives

18. Submit a review whose artifact payload is deliberately malformed for its kind. **Expect:**
    `ReviewUnknownCanvas` saying the payload is **not the shape this kind takes** — not "No dedicated
    canvas", and **not** a fabricated PR or refund. This is AC9's last sentence and the whole of T4e.
19. Attach an `artifactRef` to an artifact belonging to a **different** task. **Expect:** `INVALID_INPUT`
    from `submit_review`.
20. Open a thread containing a **demo** review. **Expect:** it lists without error. This is the BLK-4
    check — the read arm must tolerate the pre-consolidation `artifactRef.kind` those rows carry, and a
    strict enum would throw here and take the whole thread list with it.

**Failure reporting.** Any step that does not produce the expected DOM is written down as observed — what
was on screen, quoted — **before** any fix. A skipped step is reported as skipped, never as passed.

## 6.2 The automated regression net

The manual test is one run by one person; it is the AC10 proof and it is not a net. The net is three
assertions plus a lane.

**The lane, and why the obvious one is not it.** The default Playwright lane runs **vite only with no API
server and mocks every `/api/*` route** (`playwright.config.ts:6-10`), so a green review spec there proves
a fixture; it also carries the 277-entry `grepInvert` exclusion list holding both verdict specs
(`known-pre-existing-failures.ts:198,341`). The repo already solved this three times: `ah1`, `ah5` and
`ah6` each boot the **real Hono API against a migrated per-boot PGlite dir**
(`__scripts__/ah1-test-server.ts:27-60`) with their own `testMatch` and **no `grepInvert`**. AC11's lane is
a fourth in that family, seeded through the **real `create_artifact` and `submit_review` handlers** — never
literal message JSON — and asserting steps 9–13 and 17 of §6.1 from the DOM.

**It is wired into `verify:release`, local-only, founder-confirmed.** That matters because
`test:e2e:ah1` / `:ah5` / `:ah6` are npm scripts **nothing calls** — `verify:release` runs
`test:e2e:full` (the default mocked config) and the only CI e2e job runs the same on version-bump PRs
(`release-guard.yml:158-159`). Three real-backend lanes protect nothing today; a fourth added the same
way would protect nothing either.

**Service lane** (per-merge CI) gains:

- a review carrying two canvas `artifacts` round-trips through `reviewPayloadSchema` and comes back from
  `GET /api/reviews/:id` with both, payloads intact — the `toolCalls`-stripping trap (§2.5) applied to a
  bigger object;
- a review carrying an `artifactRef` returns the resolved stored artifact; a ref to another task's
  artifact is refused at `submit_review` with `INVALID_INPUT`;
- an `artifactRef` written **before** this change (`kind: "text_diff"`) still parses and its review still
  lists — the r3 BLK-4 trap, second occurrence;
- **`create_artifact` → `submit_review` succeeds** for each of the six consolidated kinds. Red today for
  all six (F51), and the assertion that would have caught this break years earlier;
- **the write path, end to end, which is the assertion BLK-2 existed for.** `submit_review` with
  `artifacts` and **no** `artifactRef` produces a `type:"review"` message (not a plain one — gate ①), and
  `GET /api/reviews/:id` returns those artifacts. **Red today three times over**, and it fails *silently*
  today: the parse succeeds and drops the field (F65), so an assertion on the response is the only thing
  that can see it;
- **the read arm (BLK-4).** A row whose `artifactRef.kind` is `"text_diff"` — i.e. every seeded demo
  review — parses through `messageRowSchema` and **its thread lists**. Red if the respelled enum is put on
  the read arm, which is what revision 8 specified.

**Component lane** gains three sets:

- **The success path — the property, positively and negatively (NB-5).** For each of the eight canvases
  T4e-a covers, render a sentinel payload (every supplied string prefixed distinctly), **expand every
  disclosure**, and assert **both**: (a) *positive* — each payload-supplied value appears; and
  (b) *negative* — the DOM contains no other word-like token. **An absence-only assertion goes green on a
  canvas that renders nothing**, which is what revision 9's set would have done. The negative is written
  as a token diff against the payload, not as a list of banned strings, so it catches the next
  fabrication as well as the eighteen already known. Red today on all eight.
  - `outcome_summary` additionally: a payload with **no `tokens`** passes the guard (`:342-353` does not
    check it) and must render **no token chip** — not `0 tok`, not `undefined tok`.
  - `metrics_moved` additionally: the payload's `period` **appears**, and no month name it did not supply
    does.
  - `visual_diff` is **excluded** until §2.8.2 E is ruled.

- **The demo regression (BLK-1).** `GET /api/reviews/:id` on each of the three seeded demo reviews returns
  its `artifacts` array intact, its `resultKpis`, `intent`, `needs`, `tools` and `tokens` — and the page
  renders all three canvases. Red if the loader ever replaces rather than layers.

**What the harness lane still owns.** That a live model *decides* to call `submit_review` with artifacts
attached is T7's, on a real binary (§6 step 4). The browser lane cannot host a CLI harness sanely and
duplicating it would be a second flaky copy. Stated as a split, not left as an implied whole.

### Lanes that must be run before shipping

`npm run verify`, `npm run test:full`, `npm run test:integration:service`, and — because this changes
harness plumbing — `npm run test:integration:harness` locally, green, for all five lanes.

**Plus `npm run test:e2e:review`** — AC10's lane, now part of `verify:release` (§6). It needs no binary
and no model, so unlike the harness lane it is not gated on a local-only environment.

---

## 7. Design

**No design pass is needed. Founder ruling §8 settles it**, and the independent reviewer reached the
same conclusion.

**The settings surface** is a list of rows with an add form and a delete, scoped by a team id in the
query string. Every part is an approved, shipped pattern:

- **List + detail + inline edit in a `SplitView`:** `layers/core-ui/src/settings/SettingsAgentBehavior.tsx:61-379`.
- **"+ Add …" with a dialog, and per-row delete:** `layers/core-ui/src/settings/SettingsConnections.tsx:81-133,392,420`.
- **Team-scoped list fetched as `?teamId=<id>`:** `layers/core-ui/src/settings/SettingsFilesystems.tsx:4,94`.

Four fields (label, kind, pattern, and the rule id read-only so a human can recognise it in a review),
plus §2.7's "checked by …" line. Its first state is the existing `EmptyState`.

**The review entry point — the question revision 4 left open, now withdrawn.** Revision 4 said this was
the one place a designer might earn their time. It is not. Ruling §8: *"If there is already a thread
(i.e. for the task) it shows up in that thread; if not it creates a new thread and it pops up in your
conversation. We use what is there."* What T4b fixes is not a missing design but a **missing
conditional**: the "Open review" affordance already exists with an approved appearance
(`ReviewRequestPart.tsx:63-71`), and it is hidden today only because `canOpen` requires a resolvable bet
(`PartList.tsx:44-46`). Making it appear for a task-hosted review is a one-line rule, and the rendered
result is a button that already looks the way it should. AM1's decision that the decision UI lives on
the review page is untouched. No new layout, component or canvas anywhere in BA2.

**AC8 does not change that answer (revision 6).** The surface audit in §2.8.1 found the review page
crashing on every real review, a hardcoded checkout mock rendering inside every review, and a review
drawing as a blank row on the Task page — but every repair is a **deletion or a conditional**, not a
layout. Deleted: `CheckoutProof`/`CheckoutCard`, the `canOpen` gate, `ReviewTarget.betId`, and the bet
segment of the review URL. Added: a loader that fills fields the page already declares, a guard on
untrusted JSON, one separator condition, and a title where `null` was returned. No new component, no new
layout, no canvas change, and the plan's out-of-scope line on reworking the review product holds. Ruling
§8 is not stretched — §2.8.1 **D** lists what a design pass *would* have had to cover and leaves all of
it out.

**AC9/AC10 do not change it either (revision 8).** Ruling 13 settles the surface question a second time:
the canvases exist, are complete, and render. BA2 adds **one input field** to a tool so an agent can fill
the channel the demo world already fills, and swaps nine fixture fallbacks for a component that already
exists. **No canvas is designed, redesigned or deleted**; the ExaminePane, the SplitView, the anchored
commenting and every renderer are untouched. Revision 7's `ArtifactPreview` swap is void. The only visual
changes in the whole of AC8–AC11 are removals: a fabricated checkout receipt, two controls that did
nothing, and nine fixture fallbacks that would have lied about an agent's work.

## 8. Documentation made false by this change

- `docs/process-layer/staged-operation.md` — wrong in its central mechanism *and* about its own code
  (§1). Rewritten, not patched (T14).
- **The four pages that publish the five `ARTIFACT_VIEW_SHAPES`** — `docs/process-layer/artifact-primitive.md:57,60`
  (which specifies the shapes, the `text_diff → diff embed` mapping, and cites a
  `framework/conversation-parts/src/part.ts` path that no longer exists),
  `docs/human-interface-layer/content-examples-for-design-reference.md`,
  `docs/human-interface-layer/decisions.md`, `docs/information-architecture/conversations-view.md`. The
  five shapes are deleted (§2.11) and `ArtifactRef.kind` becomes the consolidated six, so a doc that
  specifies them describes nothing (T14).
- **`docs/human-interface-layer/review-primitive.md:92`** — states the loader "queries `proposed_calls
  LEFT JOIN operation_outcomes`" and that "a fixture remains only for the demo id `rev-1`". Both false
  after BA2. **Its description of the nine canvas families stays true** and must not be edited away —
  revision 7 wrongly listed this page as describing a model BA2 replaces (T14).
- **The seven pages that publish the review route** — it changes to `/reviews/:reviewId` (§2.8.1 B):
  `docs/human-interface-layer/open-contract.md:24`, `docs/human-interface-layer/review-primitive.md:23,92`,
  `docs/information-architecture/app-shell-always-present.md:57`,
  `docs/information-architecture/conversations-view.md:47`,
  `docs/information-architecture/cross-view-navigation-map.md:25`,
  `docs/information-architecture/work-view.md:18`. `review-primitive.md:92` also states the loader
  "queries `proposed_calls LEFT JOIN operation_outcomes`" and that "a fixture remains only for the demo
  id `rev-1`" — both false after BA2 (T14).
- `docs/human-interface-layer/review-primitive.md`, `docs/agent-layer/harness-capability-descriptor.md:150-153`,
  `docs/architecture/as-implemented-domain-architecture.md:127`, and the six other pages that repeat
  the capture mechanism (T14).

---

## 9. Open — the mechanism is settled; rulings 11–13 reopened the scope calls below

Three rulings (§8–§10) closed the three questions earlier revisions raised about the **mechanism**, and
nothing there is waiting on anyone. Rulings 11, 12 and 13 then widened the package and, in ruling
13's case, corrected a false premise I had supplied. What is left is a set of **scope** calls the
architecture has decided with a stated default but that the founder may want to take back; they are at
the end of this section. **Ruling 13 removed the one I said I would not take alone** — the canvases are
not deleted.

**Settled by ruling, no longer open.**

- **A decline resumes the agent and carries the reasoning back — CONFIRMED (ruling §9).** Previously
  an assumption the orchestrator took; revision 2 silently reversed it, revision 3 restored it and
  flagged it, and the founder has now confirmed it. Every verdict resumes the agent; a decline simply
  clears nothing. AC7 still holds. `requirements.md`'s former "Assumption taken, not confirmed" section
  is rewritten in place as **D12 — CONFIRMED**.
- **No design pass (ruling §8).** §7. The entry point is an existing affordance needing a conditional.
- **The heartbeat reports rather than alarms — ACCEPTED (ruling §10)**, on simplicity, and recorded
  by the founder as a **deferred** decision rather than an independently reasoned one. Which makes it
  more important, not less, to keep what it does not catch stated plainly — below.
- ~~Should BA2 fix the five-valued verdict enum?~~ **Withdrawn (r3 BLK-2).** The premise was false; the
  live route already accepts all five.

**Reopened by ruling 11 — five things the founder may want to decide rather than the architecture.**
Each has a stated default the build proceeds on if nothing is said; none blocks a builder.

1. **"Accessible" was read as reachable and usable, not assistive-technology accessibility.** Ruling 11
   states that reading itself, and nothing in the audit forced the other one. *Default: as read.* If the
   assistive reading was meant this is re-scoped, not stretched — it is a different and much larger
   piece of work across nine canvases.
2. ~~**The nine canvases stay unreachable.**~~ **WITHDRAWN — the premise was false (ruling 13, F60).**
   Five of nine render real data in the demo world today. Nothing about them is out of scope, nothing is
   deleted, and §2.8.2 wires an agent to them. Question 6 below is what is genuinely left.
3. **A review on the Task and Bet pages becomes a title line, not an actionable card (§2.8.1 C2).**
   Acting on it still means opening the conversation. Making it actionable in place means giving
   `HostThreadSection` rich slots or swapping it for `PartList` — a surface change, and the design pass
   ruling §8 declined. *Default: the title line.*
4. **An agent-raised review still raises no notification (§2.8.1 D3).** No bell, no popover row: the
   listener is driven off `items` and `submit_review` creates none. Reachability rests on the
   conversations list's unresolved-review badge. *Default: out* — adding a producer is a new mechanism
   on a feature BA2 does not own, and ruling §8 says use what is there.
5. **The review URL changes to `/reviews/:reviewId` (§2.8.1 B)**, with the old shape redirecting. It is
   user-visible, and it is what makes four conditions delete rather than widen. *Default: change it.*

**Reopened by ruling 13 — and questions 6 and 7 of the ruling-12 list are withdrawn with Path B.**
Ruling 12 put the canvases in scope; ruling 13 corrected the premise under my answer to it and settled the
shape. What is genuinely left for the founder:

6. ~~**Four canvas kinds are wired but unexercised.**~~ **ANSWERED by ruling 14 — seeding is data, so it
   is allowed, and T4d does it.** Four payload literals in `demo-world/conversations.ts` give
   `field_change_set`, `rendered_in_context`, `batch` and `action_operation` real data, so **all nine
   canvases render real content** and §6.1 Run A covers all nine. No code, no new task. The one thing this
   does *not* change: `action_operation` is still not producible by BA2's own flow (F68) — a command
   clearance has no monetary amount, and BA2's review carries `outcome_summary`.
7. **"Comment on this" is deleted rather than wired (§2.8.2 D).** It renders on every open artifact today
   and does nothing. Removing a control that lies is a repair; building the gesture is a feature, and
   ruling 8 declined the design pass. Anchored commenting itself **survives** — revision 7 was wrong to
   put it on a delete list. *Default: delete the dead control, keep the feature.*
8. **AC11's lane rides `verify:release`, local-only — confirmed, and here is the residual risk.** The
   review surface has had no green end-to-end proof at any level, and the three existing real-backend
   lanes (`ah1`, `ah5`, `ah6`) are run by **nothing** — not `verify:release`, not any CI job (F57). The
   new lane is wired into `verify:release`; the other three stay unwired and are not BA2's to fix.
   Recorded so nobody assumes they protect anything. *Default: as ruled.*
9. **The manual test of §6.1 is the AC10 proof, and it is a person's run.** It is not repeatable by CI and
   it will not catch a regression next month; §6.2 is what does. Named so the pairing is a choice on the
   record rather than a gap. *Default: as ruled.*

10. **`visual_diff`: ruling 14 and the no-design-pass scope cannot both survive on this one canvas
    (§2.8.2 E). This is the decision I am not taking.** `MockScreen` renders a fabricated signup screen —
    "Create your account", "Start your 14-day trial — no card required.", `you@company.com` — as **both**
    evidence panes for every payload, and `VisualDiffPayload` carries labels only, so there is nothing
    real to put there. Confirmed in the DOM (F71). Three options, all outside what §7 currently claims:
    - **(a) Render the honest absence** in place of the two panes — "no rendered image available" —
      keeping the region labels and the diff-region list, which *are* payload-supplied. **My
      recommendation:** the only option that satisfies ruling 14 without a design pass. It leaves the
      canvas visibly thin, which is the honest state of a comparison nobody attached images to.
    - **(b) Exclude `visual_diff` from the reachable set**, canvas untouched, until a package can give it
      real images. Honest, but it removes one of the five demo-proven kinds from the surface the founder
      asked to work.
    - **(c) Accept a canvas rework** — an image-carrying payload and real before/after rendering. A
      design pass and a payload change; a separate package at this tier.
    *No default. T4e-b is unscheduled until this is ruled; nothing else waits on it.*

**What the accepted heartbeat does not catch.** Stated plainly because ruling §10 was a deferral, so
this is the part a future reader most needs.

1. **Not per-session.** `FINDINGS.md` §5 asked for a per-session proof; this is per-team-per-harness.
   One healthy claude session keeps the row fresh while another claude session's gate is dead.
2. **Not mid-session.** Anything that breaks *after* the session-start heartbeat lands — a bridge
   outage, cursor's crashed hook — fails open under a row that reads fresh.
3. **Not adjudication correctness.** The row advances on allow, so a rule whose pattern never matches
   looks perfectly healthy. It proves the transport, not the matching.
4. **It is a pull, not a push**, and it has no freshness threshold: it works when a human opens the
   permission list and knows which harnesses their agents run on.

**The escalation, named and not foreclosed.** An active per-session alarm needs `run-orchestration` to
carry which harness ran on `session_ended` — the one thing core-api cannot derive, since `agentRunConfig`
is orchestration's. That was raised as a founder question in revision 2 and is **not** answered; ruling
§10 makes it moot for now by accepting the simpler design, and **nothing here forecloses it.** The
heartbeat table is the substrate it would use.

**Recorded limits, no decision pending.**

- **cursor-agent's dead-gate case is proven by the blocked action, not by the heartbeat** — a shim that
  crashes after session start has already heartbeated. §6's red table says so.
- **A session that never emits `session_ended` never runs the §2.10 net.** `transitionRun` emits on
  both the completed and crashed paths (`transition-run.ts:199,272`) and `runtime-reapers.ts:196-208`
  covers stale routine sessions, but a process death mid-session emits nothing. No AC requires it.
- **r4 N-2 — there is a second approval door, and BA2 does not close it.**
  `layers/core-api/policy/src/policy-engine.ts:148-175` (`auto_resolve`) writes a `verdict` message with
  `deps.conversation.insertMessage` **directly**, targeting the most recent review-typed message in the
  thread, and never touches `POST /threads/:id/messages`. It would resolve a BA2 review with no
  clearance transition and no resumption. Reachability is narrow today — `handoff-protocol.ts:165-169`
  mints a fresh thread per review item, so its target is an empty thread — and closing it is a policy
  question, not BA2's. Named so it is not discovered later as a surprise.
- **The cost of the gate is real** and is priced in §4 (r4 N-6): a round trip, a query and an upsert per
  gated action, including on an empty rule list.
- **Evasion.** Named in §4. Not closed, by design.
- **Inherited, not BA2's:** `resolveOrCreateHostCallingThread` seeds participants from
  `findUser(db,{kind:"human"})` (`calling-thread-bindings.ts:55-56`) — the sole-human assumption every
  thread this feature creates inherits. BA7's row.
