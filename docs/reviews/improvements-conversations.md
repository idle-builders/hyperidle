/eff# Conversations — Improvements (Final, post-alignment)

## Method
Merged 36 candidates from designer (12) + architect (13) + adversary (12 + 3 journey gaps) into 24 unique clusters; cut 14 to top 10 after applying the founder's [CORE]/[DEMOTE]/[AVOID] filter and the v3 journey filter. All disputed claims verified against source (`ConversationsReview.tsx`, `ConversationsChat.tsx`, `ThreadSections.tsx`, `AppShell.tsx`, `shared/types.ts`).

## Journey gaps surfaced by adversary (3 — all real)
- **[GAP-A] Basic 3 ("move on with prior context") is structurally absent.** `commitVerdict` is a no-op (`ConversationsReview.tsx:132`), `setSelectedId` is explicitly voided (`:130`), Submenu wires NavItems not threads (`AppShell.tsx:39-44`). There is no "next" anywhere in the data flow; the v3 basic collapses on contact with the implementation.
- **[GAP-B] "Initiator decides the shape" is not in the data model.** `ThreadItem.kind = "review" | "chat"` (`ThreadSections.tsx:16`); 4 of 6 declared shapes (survey/feed/dm/coach) have no representation. `MockReviewItem` and `MockThread` are sibling page-local types with zero shared shape (`ConversationsReview.tsx:22-33`, `ConversationsChat.tsx:14-32`).
- **[GAP-C] "Prior context carries forward" is faked.** `relatedHistory` is a hand-authored `string[]`-ish array per mock review (`ConversationsReview.tsx:55-58`) rendered as static `<li>` text in `ArtifactView.tsx:306-325`. No link primitive between threads, no "previous decision on this artifact" lookup.

## Top 10 improvements (ranked by leverage x consensus)

### #1 Wire verdict commit + auto-advance — (All three agreed)
**Shape coverage:** review (extends to survey/dm)
**Type:** trust-leakage + missing-handler
**The problem:** `commitVerdict` is empty (`ConversationsReview.tsx:132-143`); button "completes" with no API call, no state change, no advance. Server endpoint already exists (`packages/server/src/routes/conversations.ts`). Basic 2 + Basic 3 are both structurally absent.
**Proposed change:** Wire to `POST /api/conversations/responses`; on success advance `selectedThreadId` to next non-resolved item in current section; show 5s undo toast.
**Anchors:** Basic 2 + Basic 3 + Linear-CORE automatism (auto-rollover, action-then-next)
**Effort hint:** M

### #2 Promote `Thread` primitive with 6-shape discriminant — (All three agreed)
**Shape coverage:** all-shapes
**Type:** missing-primitive + cross-area-primitive
**The problem:** `MockReviewItem` (`ConversationsReview.tsx:22-33`) and `MockThread` (`ConversationsChat.tsx:14-32`) are sibling page-local types. `ThreadKind` accepts only `review | chat`. `Thread` does not exist in `@hyperidle/shared/types.ts`. Survey/feed/dm/coach are unrepresentable; Work and Knowledge cannot attach threads.
**Proposed change:** Promote `Thread` to `@hyperidle/shared` with `kind: "review" | "survey" | "chat" | "feed" | "dm" | "coach"` discriminant, common fields (id, sender, snippet, timestamp, blocking, pinned, resolvedAt) + per-kind payload, and `attachedTo: { kind: "bet" | "task" | "knowledge" | "agent"; id }` for cross-area reuse.
**Anchors:** Basic 1 + Basic 2 + Slack-CORE threads-as-theme + Notion-CORE comments-on-blocks
**Effort hint:** L

### #3 Render `ThreadSections` in Submenu (kill the 2-NavItem dead-end) — (All three agreed)
**Shape coverage:** all-shapes
**Type:** missing-primitive + structural
**The problem:** `ThreadSections` (`components/ThreadSections.tsx`) — pinned/blocking/reviews/chats/resolved with the "blocking outranks kind" rule — is built and storybooked but never imported by `AppShell` or the pages. Submenu renders two static NavItems ("Review Queue 3 / Chat 1") with hardcoded counts (`AppShell.tsx:40-41`). User cannot pick thread #2.
**Proposed change:** Replace the 2 NavItems with `<ThreadSections>` fed from a real list. Selection drives main pane via state (`selectedThreadId` lifted to AppShell), not navigation. Counts derive from the list.
**Anchors:** Basic 3 + Slack-CORE topic-grouping + Linear-CORE Triage-as-place
**Effort hint:** M

### #4 Collapse `/conversations/review` + `/chat` to one detail route — (Architect + adversary)
**Shape coverage:** all-shapes
**Type:** structural (IA)
**The problem:** Two sibling routes (`router.tsx:29-30`) split the same queue by URL. v3 says the initiator picks the shape; the human walks into ONE thread and the page adapts. Today the user must pick the right tab before they can even see what the agent wants. Filter chip "Chats" duplicates the Chat NavItem.
**Proposed change:** Collapse to `/conversations` (queue) + `/conversations/:threadId` (detail). One detail page switches renderer by `thread.kind`. Drop the "Chat" NavItem; filter chips become real list filters once #5 lands.
**Anchors:** Basic 2 + Linear-CORE fixed-flows (one opinionated workflow, no per-shape route zoo)
**Effort hint:** M

### #5 Submenu filter chips must actually filter — (All three agreed)
**Shape coverage:** all-shapes
**Type:** trust-leakage
**The problem:** `submenuFilter` state exists in AppShell (`:367-374`) and is piped into Submenu, but no consumer reads it (comment at `:60-63` admits "J4/J5 wire the filter into the list rendering — never landed"). Chips toggle visibly, lists don't change. Counts ("3", "1") are hardcoded literals.
**Proposed change:** After #3 lands, apply `submenuFilter` to the threads array fed into ThreadSections. Derive counts from the filtered list. Add `survey/feed/dm/coach` filters once #2 expands the union.
**Anchors:** Value-add "filter or jump-search the list" + Basic 1 (counts must not lie)
**Effort hint:** S

### #6 Replace `ReviewHeader` god-toolbar with shape-driven `ThreadActionBar` — (Designer + architect)
**Shape coverage:** all-shapes
**Type:** structural / abstraction
**The problem:** `ReviewHeader` hard-codes 4 primary + 6 secondary verbs (`:55-87`) and binds 7 single-key shortcuts (`:153-178`). Survey needs constrained-choice buttons. Feed needs only "mark read". DM needs reply. Coach needs nothing. Today every non-review shape ships the wrong toolbar or hides it (`ConversationsChat.tsx:188-216`).
**Proposed change:** Replace with `<ThreadActionBar kind={...} actions={...}>`; per-kind defaults in `THREAD_ACTIONS_BY_KIND`; survey passes its options as actions; coach passes none.
>> Yeah and make that threadActionbar inline with the messages. and not on top its part of the thread.
**Anchors:** Basic 2 across all 6 shapes + HyperIdle-specific (initiator-shaped responses)
**Effort hint:** M

--- from here on do not implement save for later ---

### #7 Preformatted quick-reply chips above the input — (Designer + architect)
**Shape coverage:** review, survey, chat, feed, dm
**Type:** missing-primitive
**The problem:** v3 explicitly names "tap a preformatted quick-reply" as the value-add that REPLACES emoji reactions — initiator-supplied, structured, machine-readable. Today: chat has only textarea + Send (`ConversationsChat.tsx:188-216`); review has only the verdict toolbar. No data field, no component.
**Proposed change:** Add `quickReplies?: Array<{ label: string; action: string }>` on `Thread` (and per-message for survey/feed). Render as a chip-row above input / below verdict toolbar. Tap commits the action.
**Anchors:** Basic 2 value-add + Slack-CORE notification-philosophy (structured > emoji)
**Effort hint:** S

### #8 IconRail dot must reflect "needs your action", not raw count — (Adversary only — others missed)
**Shape coverage:** all-shapes
**Type:** trust-leakage
**The problem:** `IconRail` shows a red dot when `badgeCountByView > 0` (`IconRail.tsx:69-78`), and that count is the literal "3"/"1" hardcoded in `SUBMENU_CONFIG`. The dot is permanently on with no honest meaning. Slack proved a one-glance unread signal is the entry-point loop — but only if the signal is honest. The lore at `IconRail.tsx:21-31` admits it and defers; designer + architect never noticed.
**Proposed change:** Tie dot to "needs your action" derived from queue (review pending / blocking / @mention). When zero, no dot. Until backed by data, hide the dot rather than placeholder it.
**Anchors:** Basic 1 + Slack-CORE notification-philosophy (default-quiet)
**Effort hint:** S

### #9 Linkable prior-context (related history + reasoning citations) — (All three agreed)
**Shape coverage:** review, coach, dm
**Type:** locality + missing-primitive
**The problem:** "Previous login spike" + "Auth design doc" render as static `<li>`/`<span>` text (`ArtifactView.tsx:306-325`); no click, no navigation. v3 Basic 3 explicitly requires "the thread carries forward prior context — previous thread, previous session, prior decision." Reasoning steps are flat `string[]` with no link to diff line / knowledge entry / prior thread (Notion-CORE linking is dead).
**Proposed change:** `RelatedHistoryEntry` becomes a thread reference `{ id, label, timestamp, kind }`; clicking opens the prior thread (queue context preserved via "back to queue"). Reasoning steps gain optional `linksTo: ArtifactRange | KnowledgeId | ThreadId`; click jumps to citation.
**Anchors:** Basic 3 (prior context is the basic itself) + Notion-CORE linking + delivers GAP-C
**Effort hint:** M

### #10 Plain-English summary + shape/origin meta-line in every header — (Designer only — but high leverage)
**Shape coverage:** all-shapes
**Type:** wrong-displayed-info
**The problem:** Review header shows "Developer Agent · 2m ago" with no thread title (`MockReviewItem.title` exists at `:38` but is unrendered) and no link back to the bet. Chat header shows only "Sprint planning" (`ConversationsChat.tsx:144-146`) — no shape badge, no bet/product, no participants. Grandma can't tell DM from feed; business can't triage "is this even mine?"; v3 names plain-English summary as "stops grandma fearing the page".
**Proposed change:** Single `<ThreadHeader>` shell component shared across kinds: row 1 = `title` + agent-authored one-line summary; row 2 = shape badge + bet/product chips (clickable) + sender + timestamp + SLA (right-aligned for review). Chat reuses the same grammar.
**Anchors:** Basic 1 + Delighter "one-line summary" + Value-add "see which product / bet / agent this is from" + Linear-CORE fixed-flows
**Effort hint:** M

## Didn't make it — short mentions
- **Reasoning default-open for review** — cut as locality polish; subsumed by #10 (header + summary make rubber-stamp risk less acute). Origin: designer. Tag: cosmetic.
- **Promote SLA into ReviewHeader right-aligned** — cut as folded into #10 (ThreadHeader). Origin: designer. Tag: duplicate-of-#10.
- **Filter chips and NavItem segment same axis twice** — cut as resolved by #3 + #4 (NavItems gone, chips become real filters via #5). Origin: designer. Tag: duplicate-of-#3.
- **Reasoning shipped as numbered list, not citation** — cut as folded into #9 (links/citations). Origin: adversary. Tag: duplicate-of-#9.
- **Snooze without timer is empty gesture** — cut as Linear-CORE automatism delighter, not a basic. Earned a slot if budget; below #10. Origin: designer. Tag: better-fit-elsewhere.
- **"Approve similar from this agent" bulk action** — cut as v3 explicit delighter, not basic. Origin: designer. Tag: cosmetic.
- **Pre-fill verdict needs Esc + reject confirm** — cut as polish on #1 wiring; revisit after commit lands. Origin: adversary. Tag: edge-state.
- **Promote-to-Knowledge action from a thread** — cut as cross-area; belongs in Knowledge area review, flagged below. Origin: architect. Tag: better-fit-elsewhere.
- **Naming collision (Conversations/Chat/Chats)** — cut as resolved by #4 IA collapse + #2 kind enum. Origin: architect. Tag: duplicate-of-#4.
- **Coach + Pinned-thread are not a thing** — cut as subsumed by #2 (kind = coach) + #3 (Pinned bucket already exists in `ThreadSections.tsx:34-40`); coach needs `C` shortcut later. Origin: adversary. Tag: duplicate-of-#2.
- **Same agent in 5 threads = 5 disconnected pings** — cut as Slack-DEMOTE topic-grouping is already partly served by #3 ThreadSections sections; secondary axis (by agent/artifact) is post-#2 polish. Origin: adversary. Tag: better-fit-elsewhere.
- **Notification budget per agent** — cut as cross-area Settings + shell concern, not Conversations. Origin: adversary. Tag: better-fit-elsewhere.
- **Mock data lives in page files, not fixtures** — cut as code hygiene, not a v3 basic gap. Origin: architect. Tag: cosmetic.
- **Cmd+K thread switcher / J-K vim nav / verdict shortcuts** — cut. Slack-DEMOTE + Linear-DEMOTE keyboard. Origin: designer. Tag: DEMOTE.
- **Emoji reactions on chat messages** — cut. Slack-DEMOTE; v3 explicitly replaced with #7 quick-replies. Origin: designer. Tag: DEMOTE.
- **Optimistic UI on verdict commit** — cut. Linear-DEMOTE; the bug is no commit at all (#1), not latency. Origin: adversary. Tag: DEMOTE.
- **Search modifier mini-language** — cut. Slack-DEMOTE; address only after #3. Origin: adversary. Tag: DEMOTE.
- **Drag-to-reorder threads / custom Submenu sections** — cut. Slack-DEMOTE + Notion-AVOID over-flexibility. Origin: adversary. Tag: AVOID.
- **Streaming agent responses** — cut. v3 explicitly removed streaming as delighter ("table stakes"). Origin: adversary/architect. Tag: AVOID.
- **Density-aware verdict button sizing** — cut. Already density-locked by design (lore at `ReviewHeader.tsx:184-194`). Origin: adversary. Tag: cosmetic.
- **Customizable filter sets for Submenu** — cut. Notion-AVOID over-flexibility. Origin: designer. Tag: AVOID.
- **Inline diff comments anchored to lines** — cut. TRACK-J.md:122 explicitly defers; CTO-only value-add. Origin: architect. Tag: better-fit-elsewhere.
- **Rail COST block is unused on review screen** — cut. v3 explicit "cost is NOT here — Work owns it" boundary issue, but cosmetic at this stage. Origin: designer. Tag: cosmetic.
- **`text-mid` color may fail AA on metadata strip** — cut. AQ-010 contrast lint catches it. Origin: designer. Tag: cosmetic.

## Cross-area implications
- **Thread is a primitive, not a Conversations object.** #2 promotes `Thread` to `@hyperidle/shared` with `attachedTo`. Work bets, tasks, and Knowledge entries each carry their own threads; Conversations becomes a *view* over all threads, not the *home* of threads. This is the founder's [CORE] Slack borrow — threads as a theme across the entire app — and is the highest-leverage cross-area move.
- **Conversation -> Knowledge promotion path is null.** Slack's biggest failure mode (decisions vanishing into chronological scroll) is unaddressed. `Save to Knowledge` action on every kind, posting to `POST /api/knowledge/from-thread/:id` as a draft `KnowledgeItem` with `status: "captured"`. Belongs in the Knowledge area review, but conversation hooks into it.
- **Notification tier model is a shell-level concern, not Conversations-only.** Per-agent autonomy/attention budget ("Developer may interrupt me 3x/day; otherwise post to feed for-the-record"), mute-by-shape, "for-the-record" tier — these belong in Settings + Rail, surfaced from Conversations data. Park for the cross-cutting shell review.
- **`SubmenuFilter` union bakes Conversations vocabulary into shell types.** `Submenu.tsx:9` defines `"all" | "needs-review" | "chats" | "resolved"` at shell level; Knowledge already needs different filters. Generalize to per-view filter ids (string) or `SubmenuFilter<View>`.
- **`ArtifactView` mixes thread chrome (metadata strip + related history) with artifact body.** When a chat or DM needs status/SLA/routing, it would have to render a fake artifact. Hoist the chrome to a `ThreadHeader` shell component (see #10) so all 6 shapes share the same chrome contract. Cross-area because `ArtifactView` is also reused in Knowledge.
