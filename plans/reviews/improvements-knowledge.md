# Knowledge — Improvements (Final, post-alignment)

## Method

Merged the three Phase 1 drafts (designer, architect, adversary) into a single master list (~36 raw candidates), clustered duplicates, then applied two hard cuts:

1. **Founder priority filter.** PROMOTE [CORE] = Notion blocks-in-markdown, drag/comments, linking; Slack threads as cross-cutting primitive; Linear fixed flows + automatism. CUT [DEMOTE] = keyboard idioms, search-as-tier-1, never-blank onboarding, Cmd+K. CUT [AVOID] = over-flexibility, customizable dashboards, kit-of-parts views.
2. **Journey filter.** Items must serve a v3 basic (1 surface relevant / 2 trusted vs moving / 3 open and read) or a named value-add. Items must respect: long-lived continuity (no urgency framing), three-axis relevance (recency × frequency × impact, not invented axes), six differentiated shapes, blocks-inside-markdown (not blocks-as-database).

Verified the adversary's load-bearing claim against source: `packages/fabric/src/attention-scoring.ts:110` confirms `computeUsage` returns 0 — the v3 frequency signal genuinely doesn't exist as data. This promotes adversary findings above pure design polish.

## Journey gaps surfaced by adversary (3 items)

- **[GAP-K1] Frequency / impact signals are computed as zero or static constants.** `attention-scoring.ts:110` returns 0 for usage; impact is a per-kind constant table, not measured value generated. The journey's load-bearing axis (recency × frequency × impact) is data-aspirational. Any UI promising it lies until the join table exists.
- **[GAP-K2] Triage tab is the default landing on `/knowledge`.** v3 explicitly removes "right now" framing. `KnowledgeList.tsx:83-88` lands users on a queue whenever any item is `needs_human` — which is true today. Default contradicts the journey.
- **[GAP-K3] Continuity loop has no UI surface.** Server has merge/split/promote/deprecate endpoints and a `promote_knowledge` skill tool. The detail page shows only Edit (with Save that doesn't even hit the API — `KnowledgeDetail.tsx:229-232`). The loop named in PROCESS_LAYER and v3 is server-side plumbing with no door.

## Top 10 improvements (ranked by leverage × consensus)

### #1 Three relevance signals as first-class data — (All three agreed)
**Shape coverage:** all-shapes
**Type:** relevance-signal
**The problem:** v3 names recency × frequency × impact as the load-bearing rank, but the data layer carries one opaque `attentionScore` and a hand-templated `whyNow` string. `computeUsage` in `packages/fabric/src/attention-scoring.ts:110` returns literal 0; impact is a `IMPACT_BY_KIND` constant. The signal is aspiration, not data.
**Proposed change:** Add `lastAccessedAt`, `lastValidatedAt`, `accessCount`, `citationCount`, `impactScore` columns; derive `attentionScore` as a view. Render the three signals as a row-level signal block (recency / freq / impact cells), with `—` + tooltip when null. No UI lies before data exists.
**Anchors:** v3 basic 1 + basic 2 + HyperIdle-specific
**Effort hint:** L
>> impact score is probably citation core I would argue if we force agents to cite when the use a certain knowledge piece. we have to figure out how this is measureable but this is powerful

**Spec / implementation:** TRACK-L story L5 (`plans/L5/architecture.md`) rewrites the "Relevance / Attention" section as `docs/knowledge-architecture/relevance-and-attention.md`. TRACK-L story L22 implements the data contract. Citation is staged with absent values rendering `—` (architect's call, recorded in `plans/L5/architecture.md` § Decision D1).

### #2 Blocks-in-markdown body renderer — (designer + architect)
**Shape coverage:** belief, decision, skill, doc-tree
**Type:** block-primitive
**The problem:** `KnowledgeDetail.tsx:301-307` renders every body inside a single `<pre>` (mono, sanitised string). Founder's #1 Notion [CORE] borrow — blocks living inside markdown — has zero surface. A 3-sentence belief and a multi-section playbook share one grey rectangle.
**Proposed change:** Parse markdown into a `Block[]` stream with `{id, type: paragraph | heading | list | code | quote | callout, text, children?}`. Round-trip through Markdown-AST so agents' writeback stays text-native. `<pre>` reserved for `kind=code` blocks only. Each block carries an addressable id (prerequisite for #4 and #5).
**Anchors:** v3 basic 3 + Notion-CORE
**Effort hint:** M

### #3 Linking primitive: `[[wiki-link]]` + backlinks — (All three agreed)
**Shape coverage:** all-shapes (load-bearing for graph + doc-tree)
**Type:** linking
**The problem:** Body is opaque text; `relatedItems[]` is fixture-managed strings. No `[[id]]` resolution, no `@title` autocomplete, no backlinks. The graph shape v3 promises has no edges; the "Related" sidebar (`KnowledgeDetail.tsx:172-186`) holds 2 stub links that no one wired through prose.
**Proposed change:** New `knowledge_links` table `{from_id, to_id, kind: cites | contradicts | supersedes | evidence}`. Parse `[[id]]` in block content; resolve to inline KnowledgeChip with hover preview. Backlinks computed by reverse query and rendered under the body as `Cited by N items`, replacing the right-rail "Related".
**Anchors:** v3 basic 3 + Notion-CORE
**Effort hint:** L

### #4 Continuity-loop verbs as typed actions — (designer + architect + adversary)
**Shape coverage:** all-shapes
**Type:** continuity-loop
**The problem:** Detail page has only `Edit` (which doesn't even hit the API — `KnowledgeDetail.tsx:229-232`). Server has merge/split/promote/deprecate endpoints; the UI affordance to run them from an item does not exist. CurationSuggestionCard's `onAccept`/`onDismiss` are `undefined` in production (`KnowledgeList.tsx:166`). Loop is named in docs, missing in code.
**Proposed change:** Typed `KnowledgeAction = validate | refine | merge | split | promote | deprecate`. Right-aligned verdict bar on detail pages. Wire the suggestion card's Review button to inline merge confirmation. Save button must call `PATCH /:layer/:id` with optimistic-locking — current Save is theatre.
**Anchors:** v3 continuity loop + Linear-CORE (fixed flows / automatism)
**Effort hint:** M

### #5 Per-block thread + comment affordance — (designer + architect)
**Shape coverage:** belief, decision, skill, doc-tree
**Type:** thread + block-primitive
**The problem:** No way to leave a note for the practice lead anywhere in `/knowledge`. Founder's #1 Slack borrow ("threads as cross-cutting primitive") and #1 Notion borrow ("comments on blocks") collapse to the same affordance — and we have neither. Observation Log is read-only `agent | text | timestamp`.
**Proposed change:** Hover-revealed left gutter per block with drag handle (top) + comment count (bottom). Click opens a ThreadRow stack pinned to that block. Knowledge item carries `thread_ref?: ThreadId`; threads live in Conversations, render inline-collapsed on knowledge. Replace the read-only Observation Log with this stack at item-level. Reuse existing ThreadRow primitive — no new component.
**Anchors:** v3 basic 3 + Notion-CORE (drag, comments) + Slack-CORE (threads cross-cutting)
**Effort hint:** L

### #6 Knowledge-lifecycle status, not Work-status chips — (designer + adversary)
**Shape coverage:** all-shapes
**Type:** trust-leakage
**The problem:** `knowledgeStatusToStatus()` maps `stale`/`needs_human`/`provisional`/`archived` onto `HEALTHY/BEHIND/BLOCKED/ERROR`. Live screenshot shows a `pattern` chipped `ERROR` and an `archived` item showing `DONE`. v3 explicitly forbids urgency framing on Knowledge — "right now" belongs to Work and Conversations. The chip lies.
**Proposed change:** Drop the shared Status mapping for KnowledgeRow. Render lifecycle as a monochrome dot + text (`captured`, `provisional`, `validated`, `active`, `stale`, `archived`). Stale earns the only colored dot (warning). Knowledge isn't broken; it's contradicted, which is its own state.
**Anchors:** v3 basic 2 + HyperIdle-specific (continuity loop visibility)
**Effort hint:** S

### #7 Six shapes differentiated in row + detail — (designer + architect + adversary)
**Shape coverage:** belief, decision, skill, doc-tree, graph, table
**Type:** structural
**The problem:** v3 enumerates six shapes; code has one row primitive and one detail body. A `decision` and a `brief` and an `anti_pattern` look pixel-identical except for a tag. CTO scanning decisions ≠ grandma reading a belief. `MockKnowledgeItem` collapses to one shape.
**Proposed change:** Discriminated union on `kind` with shape-specific payloads (decision: `{statement, rationale, alternatives, ratifiedAt}`; skill: `{steps[], antiPatterns[]}`; table: `{rows, schema}`). Same row primitive, type-driven secondary line: decision shows date+author+ratification; pattern shows `applies-when`; brief shows lede. Detail page becomes a `<ShapeRenderer>` that dispatches by kind, all rendering inside the block stream from #2.
**Anchors:** v3 "Shapes Knowledge takes" + Notion-CORE (typed presentation, not typed databases)
**Effort hint:** M

--- from here on do not implement save for later ---

### #8 Server-side ranking and topic-filter routing — (architect + designer)
**Shape coverage:** all-shapes
**Type:** structural + relevance-signal
**The problem:** `GET /:layer` returns items grouped by topic with no ordering (`packages/server/src/routes/knowledge.ts:182-200`). Triage sorts client-side; Curated falls back to fixture iteration order. AppShell's `topicsForScope` and KnowledgeList's `groupItemsByTopic` recompute the same thing twice (`AppShell.tsx:388`, `KnowledgeList.tsx:90`). Topic isn't a real navigation axis.
**Proposed change:** `GET /knowledge?sort=recency|frequency|impact|relevance&filter[stale]&filter[rising]&topic=` server-side. Single `useKnowledgeView({scope, topic?, sort, filter})` selector replaces both call sites. Topic NavItems wire to `?topic=` URL param. Add a 3-way segmented sort control (recent / cited / impact) above the list, default `cited` — refusing to make it customizable.
**Anchors:** v3 basic 1 + value-add "Filter to a single topic" + Linear-CORE (fixed flows)
**Effort hint:** M

### #9 Flip default tab to Curated — (adversary)
**Shape coverage:** all-shapes
**Type:** structural
**The problem:** `KnowledgeList.tsx:83-88` lands the user on Triage whenever any practice-scope item is `needs_human` — which is true today. v3 explicitly removes "right now" framing from Knowledge. The doorway contradicts the journey.
**Proposed change:** Default tab = `curated`. Surface a small "N need review" pill at the top that opens Triage. Attention becomes opt-in, not the front door. Drop the Suggest CTA card chrome; render suggestions as KnowledgeRow variants with a leading `SUGGEST` tag and Approve/Reject row-level verdicts.
**Anchors:** v3 long-lived framing (basic 1)
**Effort hint:** S

### #10 Promote-from-Conversations origin trail — (adversary)
**Shape coverage:** all-shapes
**Type:** linking + cross-area
**The problem:** Slack-CORE lesson is "Conversations are ephemeral; promote answers into Knowledge." The server has `promote_knowledge` skill tool (`packages/server/src/skill-tools/promote-knowledge.ts`); it's restricted to facilitator agents (correct). But there's no UI to mark a conversation outcome as Knowledge, no `originRef` rendered when an item came from a thread. Today: silos.
**Proposed change:** Render `originRef` (already implied by `originAgent`) in the metadata bar as `promoted from <conversation-id>`, linked. Add a "Promote to Knowledge" verdict on resolved Conversations review threads. Closes the capture leg of the continuity loop with no new primitives.
**Anchors:** Slack-CORE (threads cross-cutting) + v3 continuity loop "capture"
**Effort hint:** M

## Didn't make it — short mentions

- **Right rail swap to topic-health on `/knowledge`** — adversary item. Cut: leverage is real but smaller than #1 (signals data) and #6 (chip framing). Re-evaluate after #1 lands. Origin: adversary #3. Tag: better-fit-elsewhere (cross-area shell concern).
- **Health dot from weighted recency × frequency × impact** — designer #12. Cut: depends on #1 data landing first; downstream of master signal work. Tag: duplicate-of-#1.
- **Replace Suggest CTA chrome with row variant** — designer #10. Folded into #9. Tag: duplicate-of-#9.
- **Backlinks panel beneath body** — designer #7. Folded into #3 (linking primitive). Tag: duplicate-of-#3.
- **Promote whyNow to title row, demote layer/kind chips** — designer #3. Cut: presentation polish on top of #1's typed `whyNow`. Worth doing once data lands; not a top-10 lever. Tag: duplicate-of-#1.
- **`whyNow` as typed signal struct** — architect #8. Folded into #1. Tag: duplicate-of-#1.
- **Pull `LEGACY_DETAILS` out of `KnowledgeDetail.tsx`** — architect #9. Cut: type-hygiene prerequisite for #7, but a refactor task, not user-visible improvement. Track inside #7 work. Tag: better-fit-elsewhere (implementation detail).
- **Pull `KnowledgeSubmenu` out of `AppShell` into Tier-3** — architect #12. Cut: structural debt, not journey-bearing. Track in shell work. Tag: better-fit-elsewhere.
- **Hardcoded `count: 12` in submenu** — adversary #9. Cut: real bug, but a one-line fix wrapped inside #8's selector work. Tag: duplicate-of-#8.
- **Per-shape edit affordances (cell edit, edge tweak, etc.)** — architect #11. Cut: depends on #7 (shape differentiation). Premature until shapes are typed. Tag: duplicate-of-#7.
- **Render `whyNow` on Curated tab not just Triage** — adversary #12. Cut: trivially fixed alongside #1's row signal block. Tag: duplicate-of-#1.
- **Cmd+K palette / slash command for Knowledge** — all three drafts rejected. Tag: DEMOTE (keyboard idioms).
- **Customizable saved-views builder** — all three drafts rejected. Tag: AVOID (over-flexibility / kit-of-parts).
- **Vector / FTS embeddings for relevance** — architect rejection. Tag: DEMOTE (search-as-tier-1).
- **Real-time co-editing (Yjs/CRDT) for body** — architect rejection. Tag: DEMOTE (premature; KNOWLEDGE_ARCHITECTURE.md §8 defers this).
- **Cycles / sprint workflow on Knowledge items** — architect rejection. Tag: AVOID (knowledge is long-lived, not project-style).
- **Reactions / emoji on knowledge items** — adversary + architect rejection. Tag: DEMOTE (founder filter: agents need typed verbs, not emoji).
- **Graph visualization view** — designer + adversary rejection. Tag: AVOID + premature (no edges in data until #3 lands; visualizing zero edges is theatre).
- **Confidence scoring per paragraph** — adversary rejection. Tag: vague (over-engineering; item-level confidence is enough).
- **Flag-for-facilitator button** — adversary #5. Cut: subsumed by #5 (block-level threads) — flagging is a thread message with a verdict chip. Tag: duplicate-of-#5.
- **Notification preference panel for knowledge updates** — designer rejection. Tag: AVOID (knowledge promotes out of conversations, doesn't generate pings — urgency-flavored).
- **Never-blank onboarding template** — designer rejection. Tag: DEMOTE (Notion explicit demote).

## Cross-area implications

- **Threads as a Conversations-owned, cross-attached primitive (#5, #10).** A `thread_ref` foreign key needs to land on Knowledge items, Work bets, and Conversations review threads simultaneously. Conversations area must own the thread primitive design before Knowledge can render inline-collapsed threads. Sequence: design Threads in Conversations Phase 2 → Knowledge consumes via `thread_ref`.
- **`attentionScore` is overloaded across Knowledge and Conversations.** `packages/server/src/routes/conversations.ts:63-86` already sorts threads by `attention_score`. The v3 reframing (recency × frequency × impact) is Knowledge-specific. Naming split needed: `relevanceSignals` for Knowledge, `attentionScore` for Conversations. Decide once before #1 lands or risk silently changing Conversations ranking semantics.
- **Block primitive as a candidate for Work artifacts (#2).** If blocks land in Knowledge, Work briefs / decisions / retrospectives gain the same primitive for free. Founder [DEMOTE]'d "one block primitive across surfaces" for Notion, so don't force it — but the option is paid for once #2 ships and should be revisited deliberately.
- **`factory` scope's "review queue" routing is implicit.** `KnowledgeDetail.tsx:236-251` hides Edit behind a banner string. There is no actual review-queue path. Conversations Review should own the routing; Knowledge displays the banner only when an open review exists in the other system. Cross-area with Conversations Review.
- **Promote-from-Conversations action (#10) requires verdict grammar in Conversations.** The "Promote to Knowledge" verdict on resolved review threads needs the universal verdict bar in Conversations to exist first. Sequence: Conversations verdict grammar → Knowledge consumes outcome.
