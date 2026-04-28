# Work — Improvements (Final, post-alignment)

## Method
38 raw candidates across 3 drafts (designer 12 + architect 14 + adversary 12). Merged 18 duplicates into 10 finalists; cut 8 for [DEMOTE]/[AVOID] alignment, vague, cosmetic, or better-fit-for-Conversations/Knowledge. Verified disputed claims against `router.tsx`, `Canvas.tsx`, `WorkBet.tsx`, `ArtifactView.tsx`.

## Journey gaps surfaced by adversary (real, founder should know)
- **[GAP-1] Output-kind → render-shape map is undefined.** v3 catalogues 11 function-agnostic output kinds (deck, contract, forecast, JD, refund decision, …); `ArtifactView` knows 5 shapes. No spec says which kinds collapse onto which shape. Until that map exists, every "function-agnostic" promise downstream is wishful. Adversary J-1.
- **[GAP-2] "What happens when stopped" has no model anywhere.** v3 makes the consequence preview an explicit basic. `BetStatus` includes `paused`/`killed` but there is no transition affordance, no consequence shape, and no relationship to running sessions (sessions don't exist in Work data). Server has no `stop-preview` endpoint. This is an unmodelled lifecycle, not a UI gap. Adversary J-2 + architect #3.
- **[GAP-3] Sessions are missing from Work entirely.** v3 names session-as-jumpout as a basic. `SessionState` exists in `types.ts` but no Work UI consumes it; tasks have no `latestSession`, no harness URL, no run-cost tied to a session. Without sessions, "see what it's costing" at story level and the harness jump-out are both unbuildable. Adversary #8 + architect #5.

## Top 10 improvements (ranked by leverage × consensus)

### #1 Mount artifact stack on every Work level — (All three agreed)
**Level:** cross (portfolio + product + bet + story)
**Type:** missing-output
**The problem:** v3's load-bearing basic ("see what the team has made") is broken at every level. `ArtifactView` exists with 5 shapes but is imported only by Conversations — `grep ArtifactView packages/web/src/pages/Work*.tsx` returns zero. `WorkBet.tsx:222-359` shows a task table and pitch but no diff, no preview, no thumbnail.
**Proposed change:** Mount an Artifacts band on Bet detail (latest N per task, cost-per-artifact inline), a team artifact stack on the new Product page, and a "what shipped this week" gallery on Portfolio. Reuse `ArtifactView`; do not invent new render shapes yet (defer to GAP-1 resolution).
**Anchors:** v3 basic 1 + value-add "what shipped this week" + Vercel/GitHub borrow + Notion-CORE blocks.
**Effort hint:** M

### #2 Add Product level (route + page + IA) — (All three agreed)
**Level:** product
**Type:** structural
**The problem:** v3 demands five levels; `router.tsx:31-33` has only Portfolio → Team Board → Bet. `WorkPortfolio.tsx` product cards have no `onClick` and link nowhere. "Team Board" is a denormalised Product+Bet smear. `WorkTeam.tsx:14-30` hard-codes a single team without a product binding.
**Proposed change:** Add `/work/product/:productId` with team roster + load, active bets, team burn vs cap, team artifact stack. Link product cards on Portfolio to it. Move the Canvas/Kanban under it. Submenu grows a scope chip (Knowledge precedent at `AppShell.tsx:142-192`), not a tree.
**Anchors:** v3 hierarchy + product-level value-adds (roster, burn-vs-cap, drill-troubled).
**Effort hint:** L
>> just to clearify Team and Product are 1:1 thats the same its a product team. But the rest applies it should be a drill down not a side navigation.

### #3 Bet-level human actions with consequence preview — (All three agreed)
**Level:** bet
**Type:** bet-action
**The problem:** v3 lists six bet-level affordances; `BetCard.tsx:28-39` exposes only an `actions?: ReactNode` escape hatch and `WorkBet.tsx:248-254` passes none. There is no Pause, no Force-stop, no Adjust-appetite, and critically no "what stops / what continues / what's saved" preview. GAP-2 above.
**Proposed change:** First-class `BetActions` props on Bet detail header (pause, force-stop, adjust-appetite, comment-to-unblock, downvote). A `StopConsequencePreview` modal shape `{ sessionsTerminating, sessionsDraining, artifactsFrozen, artifactsDiscarded, agentsReturning }` computed by `POST /api/bets/:id/stop-preview` and shown before any pause/force-stop commits.
**Anchors:** v3 basic 2 + bet-level affordances + Linear-CORE fixed flows + automatism (pause cleanly drains).
**Effort hint:** L

### #4 Strip drag/drop from Kanban — agents own task ordering — (All three agreed)
**Level:** story
**Type:** structural
**The problem:** v3 forbids humans moving tasks; `Kanban.tsx:138-157` exposes drag handles + `KeyboardSensor` on every TaskCard, `WorkTeam.tsx:116-120` mutates state on drop. The UI teaches the opposite of the spec, and binds a [DEMOTE]'d keyboard idiom on top.
**Proposed change:** Demote Kanban to read-only; remove `PointerSensor`/`KeyboardSensor`, the `COLUMN_TO_STATE` inverse map, and `handleMoveTask`. Replace with the four allowed task-level verbs: comment, downvote, open thread, jump-into-session. Drag survives only between Shaped→Committed in Canvas.
**Anchors:** v3 task constraint ("tasks are agent-owned") + Linear-CORE fixed flows.
**Effort hint:** S
>> there should still be a way for a user to request the item to change state or start a thread with the agent working on the item to unblock or stop or whatever is necessary

### #5 Render bet pitch as blocks-in-markdown (with addressable block ids) — (All three agreed)
**Level:** bet
**Type:** structural
**The problem:** `WorkBet.tsx:262-267` renders the pitch inside `<pre className="whitespace-pre-wrap">` because `react-markdown` isn't a dep. Users see literal `#`/`##` characters. The @lore comment concedes the fallback. Notion-CORE blocks-in-markdown is impossible while the source renders as preformatted text.
**Proposed change:** Adopt `react-markdown` + `remark-gfm`. Each top-level block gets an addressable id (`<section id="bet-b1#problem">`) so comments can anchor to a block (#7) and `@bet/<id>`/`@decision/<id>` resolve through one backlink primitive. Body stays valid markdown on disk — no escape into proprietary blocks.
**Anchors:** v3 value-add "read the pitch" + Notion-CORE blocks-in-markdown + linking.
**Effort hint:** S

### #6 Structured Money + Duration + cost-per-artifact wiring — (Designer + Architect)
**Level:** cross (portfolio + product + bet + story + session)
**Type:** structural (data model)
**The problem:** Cost is stringly-typed everywhere. `MOCK_RAIL_COST.todaySpend = "$12.40"`, `Bet.appetite = "2 weeks"`, `Task.cost = "$4.20"`. Bet has no `costCap`/`spend`. `bets` table has no `cost_cap`. v3 basic 3 ("see what it's costing") and the "appetite vs spend" value-add are unimplementable on strings; cost-per-artifact ($0.80 contract, $4 landing page) cannot be computed.
**Proposed change:** Define `Money { amountMinor; currency }` and `Duration { weeks?; days? }` in shared types. Bet gains `appetite: Duration; budget: Money; spend: Money`. Task gains `costCap: Money; costActual: Money`. Artifacts inherit cost from producing session. Render via KeyValue with tabular numerals (AQ-006). Bet header shows two-axis appetite line: time used/cap and money spent/cap.
**Anchors:** v3 basic 3 at every level + delighter "cost-per-artifact call-out".
**Effort hint:** M
>> does duration really matter in an AI world? what does that duration represent agents cannot work for days rarely even hours. Costs as the measure of counting & complexity makes sense though. Maybe tokens as well tokens and cost which kind of indicates the complexity of the model that must be used.

### #7 Thread primitive attached to bets, tasks, artifacts — (All three agreed)
**Level:** cross
**Type:** cross-area-primitive
**The problem:** Slack-CORE flags threads as a theme across the app. Today only `WorkBet.tsx:331-357` has a flat bespoke `MockBetComment[]` (interface lines 24-28). TaskCard and ArtifactView have no thread surface. The db already has `threads`/`messages` tables (`schema.ts:167-194`) and `tasks.threadId` (`schema.ts:99`); the UI doesn't lift them.
**Proposed change:** Tier-2 `<ThreadAttached subjectKind="bet"|"task"|"artifact" subjectId>` backed by the existing schema. Side pane on Bet/Task detail (Slack two-pane). Replace `MockBetComment` with a thread reference. Comments-on-blocks (Notion-CORE) anchor to the block ids from #5. Knowledge promotion is a follow-on (cross-area).
**Anchors:** Slack-CORE threads + Notion-CORE comments-on-blocks + v3 value-add "open the task's thread".
**Effort hint:** M

### #8 Harness jump-out from session metadata — (Architect + Adversary)
**Level:** session-jumpout
**Type:** missing-output
**The problem:** v3: "Work view links out — it does not render the interior." TaskCard exposes only title/owner/state/cost (`TaskCard.tsx:10-18`); no `sessionRef`, no `harnessUrl`. `WorkBet.tsx:316-326` shows cost as a string with no link. `SessionState` is defined in shared types but unused in Work. The story-level basic is impossible to perform.
**Proposed change:** Extend TaskCard with `latestSession?: { id; agent; cost: Money; durationMs; outcome; harnessKind: "opencode"|"hermes"|"pi-agent"|"openclaw"|"claude-code"; harnessUrl }`. Server: `GET /api/tasks/:id/sessions?latest=1`. Render outcome chip + "Open in <harness>" button (new tab). Harness URL is opaque to HyperIdle.
**Anchors:** v3 basic 1 at session level + value-add "jump into session in its harness".
**Effort hint:** S

### #9 Auto-rollover / auto-carry primitive at cycle boundary — (Designer + Architect)
**Level:** portfolio (cross-cycle)
**Type:** structural
**The problem:** Linear-CORE explicitly names automatism as the biggest invisible win. `MOCK_CYCLE` in `portfolio-data.ts:70-73` is a `{ label, daysRemaining }` literal — no boundary model, no carry. `BET_STATUSES` has `shipped`/`killed` but no `rolled_over`/`carried_forward`. Bet→task has no parent/sub model so "auto-close parent when subs done" is unbuildable.
**Proposed change:** Introduce `Cycle { id, label, startsAt, endsAt, status }` and a `BetCycle` join with `carry_from_cycle_id?`. Server job at cycle close: surface unfinished bets/tasks as "auto-carried" rail on Portfolio, no human gesture required. On bet appetite line: "If still open at appetite end: carry / stop and review." Reject cycle UI patterns ([AVOID]) — this is auto-carry only, not sprint planning.
**Anchors:** Linear-CORE automatism + auto-rollover + v3 basic 2 "spot what's on fire".
**Effort hint:** M

### #10 CoC create-on-the-fly affordance (no keyboard binding) — (All three agreed)
**Level:** cross
**Type:** cross-area-primitive
**The problem:** Linear-CORE flags "create-anywhere-on-the-fly" as the explicit shape of the Chief of Staff: an access-anywhere assistant that does NOT pull product agents off work. `chief_of_staff` is in `AgentRole` (`types.ts:128`). No surface invokes CoC from any Work level. `Cmd+K` is search and the founder filter [DEMOTE]s keyboard verbs — the trigger must be a button, not a chord.
**Proposed change:** Tier-2 `CoCTrigger` button reachable from every Work view (Rail header, Bet header, Product page). Opens a modal-overlay thread (reuse #7) attached to user identity, never to a bet/task — that's the "doesn't pull agents off work" part. Server: `POST /api/coc/sessions`. Result lands in Conversations as a "for-the-record" thread the human can promote.
**Anchors:** Linear-CORE create-on-the-fly → CoC + v3 cross-cutting affordance + Slack-CORE thread reuse.
**Effort hint:** M
>> the button to start a thread with the COC could just be bottom right in the real and it overlays a thread and somehow we can add anything as context to that thread. that would really be your assistant in the company. this one needs thinking though. 

--- from here on do not implement save for later ---

## Didn't make it — short mentions
- **C key / `C` chord for CoC** — cut as [DEMOTE] keyboard verb. Origin: designer #9 (rejected within draft), architect #14 (already self-rejected), adversary #5. Tag: DEMOTE. CoC survives as a button in #10.
- **J/K row navigation on Kanban** — cut as [DEMOTE] keyboard + compounds the Kanban lie. Origin: adversary pre-emptive. Tag: DEMOTE.
- **Cycle 12 stripe upgrade with capacity dial / sprint forecast** — cut as [AVOID] cycles. Origin: designer self-rejected. Tag: AVOID.
- **Optimistic UI / sub-100ms commits** — cut as [DEMOTE]. Origin: designer self-rejected, adversary pre-emptive. Tag: DEMOTE.
- **Sidebar of bolded unreads on Work** — cut as [DEMOTE] sidebar reorder + duplicates Submenu. Origin: adversary pre-emptive. Tag: DEMOTE.
- **Per-bet pinning / favorite** — cut as [DEMOTE] sidebar reorder + no journey job. Origin: adversary self-rejected. Tag: DEMOTE.
- **In-app harness panel / iframe the session interior** — cut as direct contradiction of v3 ("Work view links out — it does not render the interior"). Origin: architect self-rejected. Tag: AVOID.
- **Capacity badge counting lie ("3/3" while 2 bets shown; statuses 3-9 silently dropped)** — real bug worth fixing, but cut from top 10 as cosmetic relative to the structural fixes; folds into #2 (Product level reframes Canvas semantics) and #4 (Kanban demotion). Origin: adversary #10. Tag: edge-state, fix-as-part-of-#2.
- **Pitch selector two-pane (preview + history)** — cut as fold-in to #5 (block-render the pitch) + #2 (Product page hosts shaped pitches). Origin: designer #12. Tag: duplicate-of-#5+#2.
- **Function-agnostic owner column / per-kind icon on TaskCard** — cut as premature; depends on GAP-1 resolution (output-kind → shape map) before TaskCard can carry an `outputKind`. Re-open after #1 lands. Origin: adversary #7. Tag: blocked-by-GAP-1.
- **Founder priority chip (`core`/`avoid`/`demote`/`later`)** — cut as out-of-area; this is a Meta Layer / scheduler concern more than a Work-surface concern, and risks bolting product chrome onto a process question. Origin: architect #13. Tag: better-fit-for-process-layer.
- **Routine primitive on Product page** — cut as not-yet-load-bearing; v3 mentions "GPF runs weekly metrics review" but routines have no journey-critical action surface in Work today. Defer until the routine has a verb the human invokes here. Origin: architect #11. Tag: vague.
- **Tabs for active vs archived bets on Bet detail** — cut as Notion multi-view configuration creep. Origin: adversary self-rejected. Tag: vague.
- **Real-time presence avatars on BetCard ("who's editing now")** — cut as delighter, below cut. Origin: adversary self-rejected. Tag: cosmetic.
- **BetCard gradient / aesthetic polish** — cut as AQ-102 violation + premature before basics 1/2/3 work. Origin: adversary pre-emptive. Tag: cosmetic.
- **Cmd+K palette command for "Ship this bet"** — cut as premature mutating verb in search palette. Origin: adversary self-rejected. Tag: DEMOTE-adjacent.
- **Per-product Submenu rebuild (per-product trees)** — cut in favour of scope-chip precedent (Knowledge pattern) + folded into #2. Origin: architect self-rejected. Tag: duplicate-of-#2.
- **Bespoke `Comment` table for bet/task comments** — cut as duplicate of `threads`/`messages` schema; folds into #7. Origin: architect self-rejected. Tag: duplicate-of-#7.
- **Sortable columns on tasks table** — cut as already shipped + display ≠ queue reorder. Origin: designer self-rejected. Tag: cosmetic.
- **Per-product Cost Rail-section** — cut as fold-in to #6 (cost-on-bet-header) + Rail is notification surface. Origin: designer self-rejected. Tag: duplicate-of-#6.
- **Rendering 9-shape ArtifactView union (running_endpoint, communication_thread, test_result, decision_with_rationale)** — cut as GAP-1 must be resolved first; expanding the union before deciding the kind→shape map is premature. Origin: architect #6/#7. Tag: blocked-by-GAP-1.
- **Two orthogonal axes ArtifactFunction × ArtifactShape** — cut for same reason; bundle with GAP-1. Origin: architect #7. Tag: blocked-by-GAP-1.
- **"Agent of the day / artifact highlight"** — cut as journey delighter only. Origin: implicit. Tag: cosmetic.

## Cross-area implications
- **Threads (#7) require Conversations design first.** A shared `<ThreadAttached>` primitive can't be specified until Conversations defines the thread shape it owns; Work consumes whatever Conversations exports. Sequence Conversations Phase 2 before Work threads land.
- **CoC trigger (#10) needs a Conversations "for-the-record" tier.** The CoC result has to land somewhere quiet that the user can promote — Slack itself failed at this fourth-tier notification model. Conversations must add the channel before Work adds the trigger.
- **Comments-on-blocks (#5 + #7) need a Knowledge promotion path.** Slack-CORE warns conversations should never *be* the institutional memory; a "promote to Knowledge" action on any thread message must exist when threads ship. Knowledge owns the destination shape.
- **Cost-per-artifact (#6) needs a single Money formatter shared with Conversations review verdicts ("approve this $4 landing page") and Knowledge ("this decision cost $11 to ship").** Define it once in `packages/shared`, consume from all three areas.
- **Linking (`@bet/<id>`, `@decision/<id>`) is a cross-area primitive.** #5's block ids and #7's thread anchors both rely on it. Knowledge needs the same backlink resolver. Build the resolver in `shared`, not in Work.
