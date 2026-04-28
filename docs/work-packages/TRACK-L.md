# Track L: Journey-Aligned Improvements

This track implements the founder-accepted improvements from the post-journey-v3 alignment review (`docs/reviews/improvements-conversations.md`, `improvements-work.md`, `improvements-knowledge.md`). Three cross-cutting concept-doc updates land first (Thread primitive, Block primitive, Cost & Tokens model, Knowledge relevance signals) so that downstream implementation stories build against one shared spec. A hardcoded-data inventory runs in parallel and feeds a final sweep that closes data-layer + test-coverage gaps.

**Scope rules (apply to every story in this track):**
- **Spec stories first, code second.** L1–L4 are concept-doc updates. They ship no code; they ship the contract. Implementation stories (L7+) reference the contract and stay narrow.
- **Real data, not fixtures.** Every implementation story replaces hardcoded data with real DB tables + APIs. The only acceptable hardcoded data lives in `*.test.ts*`, `*.stories.tsx`, and explicit `fixtures/` files imported only by tests or stories. Page and component runtime imports of `MOCK_*` / `FALLBACK_*` are not acceptable.
- **Acceptance criteria include test coverage.** Every story includes at least one Vitest test for new logic and at least one Playwright e2e for any user-visible change. Existing e2e specs that cover the touched surface are re-run; if a regression escaped the suite, the story adds a coverage gate.
- **Concept docs stay in sync.** Stories that change a fundamental shape (Thread, Block, Cost+Tokens, relevance signals, level hierarchy) update `docs/concept/` in the same commit so the documentation stays accurate.
- **No founder-filter regressions.** Cargo-cult patterns explicitly demoted by the founder (keyboard idioms, optimistic-UI bragging, sidebar drag-reorder, emoji reactions, cycles, search-modifier mini-language, customizable dashboards) are not introduced in any story.

**Reference docs:** `docs/reviews/journeys-conversations.md` (v3), `docs/reviews/journeys-work.md` (v3), `docs/reviews/journeys-knowledge.md` (v3), `docs/reviews/improvements-*.md` (the three Phase 2 alignment outputs), `docs/reviews/reference-{notion,linear,slack}.md` (with the founder priority filter at the top of each), `docs/concept/HUMAN_INTERFACE_LAYER.md`, `docs/concept/KNOWLEDGE_ARCHITECTURE.md`, `docs/concept/PROCESS_LAYER.md`, `docs/concept/AGENT_LAYER.md`.

See `docs/work-packages/SHARED.md` for tech stack and the cross-track dependency graph.

---

### L1 — Concept: Thread primitive across all areas

**Story.** As an architect, I want the Thread primitive — its 6 shapes (`review` / `survey` / `chat` / `feed` / `dm` / `coach`), its discriminated payload, and its `attachedTo` cross-area attachment surface — captured in `docs/concept/HUMAN_INTERFACE_LAYER.md` and `docs/work-packages/SHARED.md`, so that downstream Conversations / Work / Knowledge stories that consume the primitive build against one shared spec instead of inventing variants.

**Depends on.** None.

**Acceptance criteria.**
- New section "Thread primitive" added to `docs/concept/HUMAN_INTERFACE_LAYER.md` (after the existing Conversations surface description). Section defines, with worked examples for each:
  - The 6 shapes discriminated by `kind`. For each shape: who initiates, what response is expected, default chrome (header / quick-replies / input).
  - Common Thread fields: `id`, `kind`, `subject`, `senders[]`, `lastMessageAt`, `blocking`, `pinned`, `resolvedAt`, `messages[]`, `quickReplies?[]`, `attachedTo`.
  - The `attachedTo` cross-area attachment shape: `{ kind: "bet" | "task" | "artifact" | "knowledge" | "agent" | "user"; id: string }`. Threads attach to anything; the Conversations area is a *view* over all threads, not their owner.
  - The "initiator decides the shape" rule (per founder's v3 reframing of Conversations Basic 2). Examples of each initiator pattern.
  - Where threads live in the IA: per-attached-entity inline panel + a Conversations queue view.
- New `Thread`, `Message`, `QuickReply` type contracts in `docs/work-packages/SHARED.md` "Shared Contracts" section (TypeScript-style, formal, copy-pastable).
- `docs/concept/ARCHITECTURE.md` updated where the Human Interface Layer is described to reference the Thread primitive as a cross-area surface.
- `docs/concept/AGENT_LAYER.md` updated where threads are mentioned: agents are initiators; the agent harness emits messages with a `kind` matching one of the 6 shapes.
- Existing `threads` / `messages` schema in `packages/db/src/schema.ts` is reviewed against this spec; gaps documented inline (fix lives in L7).
- Cross-link: `improvements-conversations.md` #2, `improvements-work.md` #7, `improvements-knowledge.md` #5 each reference this spec by section anchor.
- No code changes; no schema changes. `bun run check` + `bun run lint` + `bun run test` all green (docs only).

**Validation scenarios.**
- Given an architect reads the new HUMAN_INTERFACE_LAYER section, when they later open L7, they can answer "what fields does Thread carry?" without asking and without re-reading the journey docs.
- Given the spec, when scanned, every shape has at least one example of an initiator and an expected response.
- Given the contract is in SHARED.md, every implementation story (L7, L18, L26) references it by section anchor.
- Given the schema gap inventory at the bottom of the spec, L7 has a clear scope.

**Contracts / constraints.**
- Spec-only. No TypeScript additions outside docs.
- The 6 shapes come from `journeys-conversations.md` v3 — do not invent a 7th.
- `attachedTo` is mandatory on every Thread, even if the value is `{ kind: "user", id: <self> }` for un-attached coach threads.
- No emojis in the spec.

**Effort.** S (~1d)

---

### L2 — Concept: Block primitive in markdown

**Story.** As an architect, I want the Block primitive — markdown-AST-rooted blocks with stable addressable ids, drag-handles, comment anchors, and link targets — captured in `docs/concept/HUMAN_INTERFACE_LAYER.md` and a new `docs/concept/BLOCKS.md`, so that Work pitch (L16) and Knowledge body (L23) build against one spec and inherit the same comment / link / drag affordances. Critically: blocks live INSIDE markdown — the on-disk format remains valid markdown, never a proprietary database.

**Depends on.** None.

**Acceptance criteria.**
- New section "Block primitive" in `docs/concept/HUMAN_INTERFACE_LAYER.md` defining:
  - Block types: `paragraph`, `heading`, `list`, `quote`, `code`, `callout`, `embed`. Discriminated union shape: `{ id: string; type: BlockType; text?: string; children?: Block[]; meta?: Record<string, unknown> }`.
  - **The on-disk-markdown invariant** as a hard rule: text → AST → blocks → AST → text round-trips losslessly for supported types.
  - Block ids are stable across edits — computed from `path + content_hash + position`, NOT random UUIDs that change on every save.
  - Block-level affordances: drag-handle (re-order, persists by re-emitting markdown), comment-thread anchor (uses Thread primitive from L1), per-block link target (`#block-id` URL fragment).
  - Anti-patterns called out: blocks-as-database (Notion's escape into proprietary land — explicitly forbidden), customizable view kits (founder cut over-flexibility).
- New file `docs/concept/BLOCKS.md`: long-form treatment — block lifecycle, parsing/serialization (`remark` / `unified` recommended), comment-anchor model, link-resolution rules.
- Cross-link: `improvements-work.md` #5 and `improvements-knowledge.md` #2 cite this spec.
- Decision recorded: `react-markdown` + `remark-gfm` is the recommended renderer; the spec says why and lists the alternatives that were rejected.
- `bun run check` + `bun run lint` + `bun run test` all green.

**Validation scenarios.**
- Given a developer planning L16 (Work pitch blocks), when they read BLOCKS.md, they know to use `react-markdown` + `remark-gfm` and to attach stable ids at the AST level.
- Given the spec, when scanned, the on-disk-markdown invariant is stated as a hard rule with an example.
- Given the comment-anchor section, it explicitly references the Thread primitive from L1 by section anchor.
- Given a contributor proposes "let's store blocks in JSON in the DB", the spec's anti-pattern section is the authority that rejects it.

**Contracts / constraints.**
- Spec-only.
- Block ids must round-trip: `parseToBlocks(serializeFromBlocks(blocks)) === blocks` for the supported types.
- Blocks are shared between Work (pitches, briefs) and Knowledge (entries). Conversations does not use them — chat messages are not blocks.
- No emojis.

**Effort.** S (~1d)

---

### L3 — Concept: Cost & Tokens (no Duration) appetite model

**Story.** As an architect, I want the appetite/budget/spend model rewritten as **Cost (money) + Tokens** — explicitly NOT Duration — captured in `docs/concept/PROCESS_LAYER.md`, so that Work bet appetites, story caps, and session costs share one money+token grammar and so "duration" never leaks into the agent-driven world where wall-clock time is a poor proxy for complexity.

**Depends on.** None.

**Acceptance criteria.**
- Rewrite the "Appetite / Budget / Cost" section of `docs/concept/PROCESS_LAYER.md` to define:
  - `Money { amountMinor: number; currency: "USD" | "EUR" | "GBP" }` — currency-aware money type. Default currency is `"USD"` for v1.
  - `TokenUsage { promptTokens: number; completionTokens: number; modelTier: "frontier" | "mid" | "small" }` — model-tier-aware. Tier is a coarse complexity signal: frontier-tier tokens cost more and signal harder problems.
  - **Bet appetite**: `{ moneyCap: Money; tokenCap?: TokenUsage }`. No `Duration` field. Bets are bounded by spend and complexity, not wall-clock.
  - **Story (task) cap**: same shape as appetite, scoped to one task.
  - **Session cost**: `{ moneySpent: Money; tokensUsed: TokenUsage; durationMs: number }` — wall-clock duration is recorded INFORMATIONALLY only, never as a budget axis.
- New "Rationale" subsection explains why duration is not the budget: agents work in bursts; complexity is the signal; a frontier-tier token-heavy session signals harder work than a long, small-tier one. Cites founder's reasoning: "Does duration really matter in an AI world?".
- New "Money / TokenUsage" subsection added to `docs/work-packages/SHARED.md` "Shared Contracts".
- `docs/concept/AGENT_LAYER.md` updated where session cost is mentioned to reference the new shape.
- Existing `bets` / `tasks` / `sessions` tables in `packages/db/src/schema.ts` reviewed against this model; gaps documented inline (fix lives in L17).
- Cross-link: `improvements-work.md` #6 cites this spec.
- `bun run check` + `bun run lint` + `bun run test` all green.

**Validation scenarios.**
- Given an architect plans L14 (bet actions), when they read PROCESS_LAYER, they know consequence preview shows cost-spent vs cost-cap and tokens-used vs token-cap, NOT duration.
- Given the rationale section, when an agent later suggests "let's add a duration cap on bets", the spec rejects it with a citation.
- Given the schema gap inventory, L17 has a clear scope.
- Given a downstream story uses `Money`, it imports from `packages/shared`, never re-defines it.

**Contracts / constraints.**
- Spec-only. Type definitions land in L17.
- Currency: pick ONE default (USD) for v1; spec leaves the door open for multi-currency.
- Tier values: `frontier` / `mid` / `small`. Three tiers, no more, no less.
- Cost is `amountMinor` (cents), never floats.
- No emojis.

**Effort.** S (~1d)

---

### L4 — Concept: Knowledge relevance signals (citation-driven impact)

**Story.** As an architect, I want the recency × frequency × impact relevance model captured in `docs/concept/KNOWLEDGE_ARCHITECTURE.md`, with **impact computed as citation score** (agents are required to cite the knowledge they used in producing artifacts), so that L22 implements a measurable signal — not aspiration — and so the data layer earns the v3 Knowledge journey's load-bearing rank.

**Depends on.** None.

**Acceptance criteria.**
- Rewrite the "Relevance / Attention" section of `docs/concept/KNOWLEDGE_ARCHITECTURE.md` to define three first-class signals:
  - **Recency**: `lastValidatedAt`, `lastEditedAt`, `lastAccessedAt`. Decay function specified — exponential half-life of 30 days for "active" status, 90 days for "stale".
  - **Frequency**: `accessCount` over last 30 days, sourced from a server-side access log (not client analytics).
  - **Impact = citation score**: agents are REQUIRED to cite knowledge items they used in producing an artifact (skill, decision, pattern, etc.). The cited knowledge gets impact +1; a recursive cite-of-cite gets fractional contribution. The founder noted: "we have to figure out how this is measurable but this is powerful" — the spec resolves this by requiring agents to emit `cited_knowledge_ids` on session completion.
- New `knowledge_citations` table contract documented (schema lands in L22): `{ from_artifact_id, from_artifact_kind, to_knowledge_id, weight, created_at }`. Default weight 1; can be downweighted later.
- New section "Citation discipline for agent harnesses": every artifact-producing session emits `cited_knowledge_ids: string[]`; HyperIdle records citations on session completion. This is a harness-side obligation, not a UI nag.
- Define the relevance composite: `relevance = w1 * recencyScore + w2 * log(1 + frequency) + w3 * log(1 + impact)`. Weights tunable; defaults specified (`w1=0.4, w2=0.3, w3=0.3`).
- Anti-pattern explicitly forbidden: do NOT fall back to per-kind constants for impact. Today's `IMPACT_BY_KIND` table at `packages/fabric/src/attention-scoring.ts` is a placeholder that lies. Spec rule: "until citation data exists, render impact as `—`, not as a fake number".
- Cross-link: `improvements-knowledge.md` #1 cites this spec.
- `bun run check` + `bun run lint` + `bun run test` all green.

**Validation scenarios.**
- Given a developer reads the spec before L22, they know `accessCount` reads from a server-side log table, not client-side analytics events.
- Given the impact-as-citation section, when an agent harness author reads it, they know they MUST emit `cited_knowledge_ids` on every session.
- Given a row that has zero citations and zero accesses, the spec says the row renders impact as `—`, not `0` or a fake constant.
- Given the composite formula, the weights are explicit and tunable via a config table or env, not hardcoded.

**Contracts / constraints.**
- Spec-only. Schema lands in L22.
- The citation discipline applies to ALL agents (not just facilitators) — harness contract.
- Tunable weights live in a config table or env, not hardcoded constants.
- No emojis.

**Effort.** S (~1d)

---

### L5 — Hardcoded-data inventory (research)

**Story.** As an engineer about to remove every hardcoded fixture from the running app, I want a complete inventory — every `MOCK_*` / `FALLBACK_*` constant, every fixture file imported into a runtime page or component (not into a test or story), every hardcoded count / chip / number / list / status — saved as a structured doc, so that downstream implementation stories know what they own and the final sweep (L29) has a shopping list.

**Depends on.** None.

**Acceptance criteria.**
- New file `docs/reviews/hardcoded-data-inventory.md` lists every hardcoded data source in `packages/web/src/` (and supporting packages) consumed at runtime — explicitly NOT in test or story files. For each finding, columns:
  - `Source path:line | Shape | Consumer | Real source (API / table) | Owner story | Notes`.
- Inventory is grouped by area: Conversations, Work, Knowledge, Shell, Cross-cutting.
- Inventory must cover at minimum:
  - `packages/web/src/fixtures/*.ts` — every named export, classified as runtime-consumed vs story-only.
  - Every `MOCK_*` and `FALLBACK_*` constant in `packages/web/src/pages/*.tsx`, `shell/*.tsx`, `components/*.tsx`.
  - Hardcoded counts / chips / status mappings in shell (`AppShell.tsx`, `IconRail.tsx`, `Submenu.tsx`, `Rail.tsx`).
  - Page-local types like `MockReviewItem`, `MockThread`, `MockBetComment` arrays.
  - Status mappings that borrow Work statuses for non-Work data (e.g., `KnowledgeRow` mapping knowledge lifecycle to `HEALTHY/BEHIND/BLOCKED`).
- Each row's "Owner story" matches the right L-story (L7, L11, L13, …); rows with no obvious owner get tagged `unassigned` and surfaced for L29.
- Inventory does NOT propose fixes — that is the impl stories' job. It is a survey.
- "Hardcoded fallback acceptable in" column distinguishes `tests/`, `*.stories.tsx`, `fixtures/` (story-only), from forbidden runtime use.
- `bun run check` + `bun run lint` + `bun run test` all green (docs only).

**Validation scenarios.**
- Given the inventory, when L14 starts, the developer knows exactly which BetCard fixtures to replace and where the real API lives (or whether the API needs to be added).
- Given a row tagged `unassigned`, L29 picks it up and either schedules a follow-up or fixes it inline.
- Given a fixture in `packages/web/src/fixtures/` that is consumed by both a page AND a storybook, the inventory clarifies which use is OK to keep and which must be replaced.
- Given the inventory is structured (markdown tables), a script or agent can grep `Owner story = L14` and produce a shopping list.

**Contracts / constraints.**
- Research-only. No code or schema changes.
- Use absolute paths (`packages/web/src/...`) so other agents can grep.
- Be exhaustive — false negatives are worse than false positives.
- No emojis.

**Effort.** M (~2d)

---

### L6 — Wire verdict commit + auto-advance

**Story.** As a reviewer in `/conversations/review`, I want my Approve / Request Changes / Reject / Snooze verdict to actually commit to the server and the queue to advance to the next non-resolved item, so that v3 Basic 2 ("play your part in the shape the initiator chose") and Basic 3 ("move on with prior context") are not silently broken.

**Depends on.** None.

**Acceptance criteria.**
- `commitVerdict` in `packages/web/src/pages/ConversationsReview.tsx` (currently empty at `:132`) calls `POST /api/conversations/responses` with the verdict + optional comment + thread id. On success, the server endpoint marks the thread resolved and emits an event.
- `setSelectedId` (currently voided at `:130`) is replaced with a real selection state lifted into the page and AppShell. After a successful commit, selection advances to the next non-resolved thread in the active section. Section ordering is server-supplied, not client-fabricated.
- 5-second undo toast appears after every commit; clicking undo reverses the verdict (server endpoint: `DELETE /api/conversations/responses/:id`). After 5 seconds the verdict is final.
- Auto-advance is a setting (default: ON for power-user behavior, OFF for grandma-friendly confirm — per v3 delighter); honors the user's `autoAdvance` preference in `SettingsPanel`.
- New Vitest tests cover: verdict commit success, commit failure (network error), undo within window, undo after expiry, auto-advance respecting setting.
- New Playwright spec covers the full loop: load review → commit verdict → next thread loads → undo → original thread restored.
- All hardcoded `MOCK_REVIEWS[0]` access in this page is replaced with a `useQuery` against the real conversations endpoint. Inventory row from L5 closed.
- `bun run check` + `bun run lint` + `bun run test` all green; full Playwright e2e suite green.

**Validation scenarios.**
- Given the user clicks Approve, when the request succeeds, then the thread resolves on the server, the local list updates, and the next thread loads automatically (if auto-advance is on).
- Given the user clicks Approve and immediately undo, when the undo arrives within 5 seconds, then the server reverses the verdict and the original thread is restored as selected.
- Given auto-advance is OFF, when the user commits, then the same thread stays selected with a "Resolved — pick next" affordance.
- Given the network is down, when the user commits, then a clear error is shown and the verdict is not recorded locally as committed.

**Contracts / constraints.**
- The verdict endpoint already exists in `packages/server/src/routes/conversations.ts` — wire to it; do not re-spec.
- Undo within 5s is non-negotiable for the grandma-tier persona (v3).
- No optimistic UI bragging — the founder filter [DEMOTE]s "perceived speed" as a primary feature; correctness first.
- No emojis.

**Effort.** M (~2-3d)

---

### L7 — Promote Thread primitive into shared

**Story.** As a developer wiring Conversations / Work / Knowledge threads, I want a single `Thread` type with the 6-shape discriminant + `attachedTo` cross-area attachment, exported from `@hyperidle/shared`, so that the three areas attach threads to anything and Conversations becomes a *view* over all threads, not the owner.

**Depends on.** L1 (concept doc).

**Acceptance criteria.**
- New types in `packages/shared/src/types.ts`: `Thread`, `Message`, `QuickReply`, `ThreadKind`, `ThreadAttachment` — exactly matching the contract in `docs/work-packages/SHARED.md` updated by L1.
- Existing page-local `MockReviewItem` (`ConversationsReview.tsx:22-33`), `MockThread` (`ConversationsChat.tsx:14-32`), `MockBetComment[]` (`WorkBet.tsx:24-28`) deleted; consumers refactored to use `Thread`.
- Database schema migration: `threads` table gains a `kind` column (enum: 6 shapes), an `attached_to_kind` + `attached_to_id` pair, an `initiator_id`, an optional `quick_replies` JSON column. Existing rows backfilled to `kind = "review"` (the historic default).
- Server endpoints: `GET /api/threads?attachedToKind=...&attachedToId=...` returns threads attached to a given entity; `GET /api/threads/:id` returns one with messages; `POST /api/threads` creates with explicit `kind` + `attachedTo`.
- `packages/server/src/routes/conversations.ts` is rewritten to read/write through the new Thread shape.
- Vitest unit tests cover the new types' discriminant exhaustiveness (TypeScript exhaustive switch test). Server tests cover all 6 kinds round-tripping through create + read.
- Playwright e2e: review thread, chat thread, and (a stub of) survey thread each render with the right chrome based on `kind` alone.
- All page-local Mock types removed; inventory rows from L5 closed.
- `bun run check` + `bun run lint` + `bun run test` all green; e2e suite green.

**Validation scenarios.**
- Given a developer creates a survey thread via `POST /api/threads` with `kind: "survey"`, when the response is read back, the discriminant payload is preserved and the UI renders survey chrome.
- Given a thread has `attachedTo: { kind: "bet", id: "b1" }`, when the Bet detail page mounts, then the thread shows up in the bet's thread panel (when L18 lands).
- Given the migration runs against a fresh DB, then `kind = "review"` is the default for back-compat.
- Given an exhaustive switch on `ThreadKind`, the TS compiler enforces all 6 cases.

**Contracts / constraints.**
- The 6 kinds are FIXED. No 7th. Founder filter blocks new shapes without a concept-doc update.
- `attachedTo` is mandatory; un-attached coach threads use `{ kind: "user", id: <self> }`.
- Migration is forward-only and has a written rollback plan.
- No emojis.

**Effort.** L (~5d)

---

### L8 — Render `ThreadSections` in Conversations Submenu

**Story.** As a reviewer landing on `/conversations`, I want the Submenu to show the actual thread list — pinned, blocking, reviews, chats, resolved — instead of two static "Review Queue 3 / Chat 1" NavItems with hardcoded counts, so that I can pick thread #2 (currently impossible).

**Depends on.** L7.

**Acceptance criteria.**
- `ThreadSections` (already built at `packages/web/src/components/ThreadSections.tsx`) is imported and rendered inside the Submenu when `view === "conversations"`. The two NavItems "Review Queue" / "Chat" are removed from `AppShell.tsx:39-44`.
- Thread list is fed by `useQuery(['threads', filter])` against the L7 endpoint. Selection drives a lifted `selectedThreadId` in AppShell, NOT navigation.
- Section counts ("Pinned 1 / Blocking 3 / Reviews 5 / Chats 7 / Resolved 12") are derived from the fetched list, not literals. The hardcoded `count: 12` etc. in `SUBMENU_CONFIG` (`AppShell.tsx:40-41`) is removed.
- `kind` chip on each row reflects the discriminant from L7 (review / survey / chat / feed / DM / coach).
- The "blocking outranks kind" rule (per ThreadSections lore) is preserved.
- Vitest tests cover: rendering with empty list, rendering with mixed-kind list, selection drives selectedThreadId.
- Playwright e2e: list of threads loads, click a thread → main pane updates to that thread, count badges match list contents.
- Inventory rows from L5 (page-local thread mocks, hardcoded submenu counts) closed.
- `bun run check` + `bun run lint` + `bun run test` all green; e2e suite green.

**Validation scenarios.**
- Given there are 7 threads on the server, when the page loads, the Submenu shows 7 rows grouped into the 5 sections by status.
- Given a thread's kind is `survey`, the row shows a SURVEY chip; clicking opens the survey detail.
- Given the user clicks a thread, the main pane (`ConversationsReview` or its successor in L9) renders that thread.
- Given the network fails, the Submenu shows a clear error state (not silent collapse).

**Contracts / constraints.**
- ThreadSections is reused as-is — do not re-build the component.
- Counts must match list length; counts that lie are forbidden (founder filter: trust-leakage is the primary failure mode).
- No keyboard navigation on the list in this story; that's a follow-up if ever (founder-demoted).
- No emojis.

**Effort.** M (~2-3d)

---

### L9 — Collapse review/chat to one detail route

**Story.** As a user, I want one Conversations route — `/conversations` (queue) + `/conversations/:threadId` (detail) — instead of two sibling routes that split the same queue by URL, so that the page adapts to whichever shape the initiator chose (per v3 Basic 2 reframing) and I never pick the wrong tab before I can see what the agent wants.

**Depends on.** L7.

**Acceptance criteria.**
- New routes in `packages/web/src/router.tsx`: `/conversations` (the queue) and `/conversations/:threadId` (a single detail page that renders by `thread.kind`). The old `/conversations/review` and `/conversations/chat` routes redirect to `/conversations` (preserve history with `Navigate replace`).
- New page `packages/web/src/pages/Conversations.tsx` (singular) and `ConversationDetail.tsx` replace `ConversationsReview.tsx` + `ConversationsChat.tsx`.
- The detail page dispatches by `thread.kind` to per-kind body components (`ReviewBody`, `SurveyBody`, `ChatBody`, `FeedBody`, `DmBody`, `CoachBody`). Body components live in `packages/web/src/components/threads/`.
- Submenu's "Chat" NavItem is removed (collapses with L8); the Conversations IconRail item is the sole entry point.
- Naming collisions (`Conversations` / `Chat` / `Chats` / `chat`) are resolved per the spec from L1 — one canonical noun per concept.
- Vitest tests cover: each kind dispatches to the right body; unknown kind shows a "Unknown thread shape" fallback (logged, not crashing).
- Playwright e2e: navigate from `/work/portfolio` → click a bet's thread → URL becomes `/conversations/:id` → the right body renders.
- Stale links to `/conversations/review` and `/conversations/chat` redirect, not 404.
- `bun run check` + `bun run lint` + `bun run test` all green; e2e suite green.

**Validation scenarios.**
- Given a user opens `/conversations/review`, then they redirect to `/conversations` and the queue loads.
- Given a thread of kind `survey`, when its detail page loads, then `SurveyBody` is rendered, not `ReviewBody`.
- Given a deep-link `/conversations/abc123` where `abc123` is unknown, then a clear "thread not found" empty state is shown (not the editable-fallback anti-pattern).
- Given a kind not yet implemented (e.g., `coach` if its body is stubbed), the fallback body says so explicitly and links to a tracking issue.

**Contracts / constraints.**
- One detail page; per-kind bodies. Do NOT split into per-kind detail pages.
- Old routes redirect, never 404 — preserve any external links and Rail badges that already point at the old paths.
- No emojis.

**Effort.** M (~2-3d)

---

### L10 — Submenu filter chips actually filter

**Story.** As a user, when I click "Needs review" in the Conversations Submenu filter, I want the thread list to actually filter — not just paint the chip selected — so I stop losing trust in controls that look like they work.

**Depends on.** L8.

**Acceptance criteria.**
- `submenuFilter` state in `AppShell.tsx:367-374` is now read by ThreadSections, which filters the list by status (`needs-review` ⇒ `status === "needs_human"` and similar). The "filter is set but never read" comment at `:60-63` is deleted along with the bug.
- Filter set is reduced to what L7's discriminant supports: `all` / `needs-review` / `pinned` / `resolved`. The redundant `chats` filter is removed (kind is a row-level chip, not a global filter).
- After L7's 6-kind discriminant, filter chips become real filters: clicking `survey` filters to survey-kind threads. Empty filtered states show a clear "0 surveys today" state.
- Vitest tests cover: each filter narrows the list correctly; clearing filter restores full list.
- Playwright e2e: click Needs review → list narrows → click All → list restored.
- Counts on chips reflect the filtered count (unfiltered count is shown beside as `12 of 47`).
- `bun run check` + `bun run lint` + `bun run test` all green; e2e suite green.

**Validation scenarios.**
- Given 12 threads with mixed statuses, when the user clicks Needs review and 5 are `needs_human`, then 5 rows show.
- Given a filter with 0 matches, the list shows a clear empty state with a "clear filter" affordance.
- Given the user clears the filter, the original 12 rows return.

**Contracts / constraints.**
- No customizable filter sets (founder cut over-flexibility / kit-of-parts).
- No saved filter presets — filters are session-local state.
- No emojis.

**Effort.** S (~1d)

---

### L11 — Replace ReviewHeader with shape-driven `ThreadActionBar` (inline with messages)

**Story.** As a user, I want the action bar (verdict / answer / reply / quick-replies) to live INLINE with the thread messages — at the bottom of the message stream, as part of the thread — not as a floating top toolbar, so that the actions feel like part of the conversation and so each shape (review / survey / chat / feed / DM / coach) can have its own action set without the chrome lying about what's possible.

**Depends on.** L7.

**Acceptance criteria.**
- New component `packages/web/src/components/ThreadActionBar.tsx` rendered INLINE at the bottom of the thread message stream (under the last message), NOT as a top floating toolbar. **Founder direction: "ThreadActionBar inline with the messages, not on top — it's part of the thread."**
- ThreadActionBar dispatches by `thread.kind`: review shows verdict buttons + quick-replies; survey shows the constrained answer set; chat / DM show input + quick-replies; feed shows mark-as-read + react-buttons (no emoji — preformatted action buttons per founder); coach shows reply input only.
- Per-kind action sets defined in `THREAD_ACTIONS_BY_KIND` constant, derived from the L1 spec.
- `ReviewHeader.tsx` is reduced to a thin presentation header (title + sender + SLA + "← back to queue"). All verb buttons move to ThreadActionBar.
- The 7 hardcoded keyboard shortcuts at `ReviewHeader.tsx:153-178` are removed (founder demotes keyboard verbs).
- Vitest tests cover: each kind renders the right action set; verdict click dispatches to L6's `commitVerdict`.
- Playwright e2e: review thread → ThreadActionBar shows below messages with verdict buttons → click Approve → verdict commits via L6.
- `bun run check` + `bun run lint` + `bun run test` all green; e2e suite green.

**Validation scenarios.**
- Given a review thread, when scrolled to the bottom, then ThreadActionBar appears INLINE with the last message and shows Approve / Request Changes / Reject / Snooze.
- Given a survey thread with options `["Yes", "No", "Need more info"]`, when ThreadActionBar renders, then those exact options are buttons.
- Given a feed thread, when ThreadActionBar renders, then it shows preformatted actions ("Looks good", "Pause this"), NOT emoji.
- Given a coach thread, when ThreadActionBar renders, then it shows a reply input only — no verdict.

**Contracts / constraints.**
- Inline placement is non-negotiable — top toolbar is the wrong model per founder.
- No emoji reactions; preformatted actions only.
- No keyboard verbs.
- No emojis in code or comments.

**Effort.** M (~2-3d)

---

### L12 — Mount artifact stack on every Work level

**Story.** As any persona on Work, I want to SEE what the agents have made — thumbnails, preview links, latest diffs — at every level (portfolio gallery / product+team feed / bet artifact stack / story converging artifact), not just status badges, so v3 Basic 1 ("see what the agent has made") is implementable instead of structurally absent.

**Depends on.** L13.

**Acceptance criteria.**
- `ArtifactView` (already at `packages/web/src/shell/ArtifactView.tsx`) is imported and rendered on every Work page:
  - Portfolio: a "What shipped this week" gallery row at top, function-agnostic (deck, contract, dashboard, code-diff, drafted-email, design, etc.) — shows up to 12 most recent shipped artifacts across all products.
  - Product/Team page (from L13): a team artifact stack — most recent N per active bet.
  - Bet detail: an Artifacts band with cost-per-artifact inline; shows latest output per task.
  - Story (task) row: the current converging artifact preview.
- New API: `GET /api/artifacts?productId=...&betId=...&taskId=...&limit=...` — returns artifacts in the canonical shape used by ArtifactView, joined with cost from session.
- Real artifact data backed by an `artifacts` table; the table is joined to the producing session for cost. Inventory row from L5 closed (zero hardcoded artifacts in any Work page).
- For function-agnostic outputs without a code-diff: thumbnail + title + cost; click opens the artifact's preview URL (Vercel-style — show, don't tell).
- Vitest tests cover: the artifact band loads on each level; empty states render correctly.
- Playwright e2e: open Portfolio → see gallery → click an artifact → preview opens; open Bet detail → see band; open Story row → see converging artifact.
- `bun run check` + `bun run lint` + `bun run test` all green; e2e suite green.

**Validation scenarios.**
- Given a marketing team has 3 shipped landing pages this week, the Portfolio gallery shows 3 thumbnails.
- Given a bet has 5 tasks each producing 1 artifact, the Bet detail's Artifact band shows 5 entries with cost-per-artifact.
- Given a finance team produces a runway model, it appears in the gallery as a `data` shape (chart preview).
- Given an artifact has no preview URL yet, a clear "rendering…" placeholder shows; never a fake thumbnail.

**Contracts / constraints.**
- Reuse `ArtifactView`. Do not invent new render shapes in this story (the function-agnostic shape map is GAP-1; if expansion is needed, that lands in a follow-up — for now, the existing 5 shapes plus a generic `link` shape suffice).
- No hardcoded artifact lists on any Work page — every entry comes from the API.
- No emojis.

**Effort.** M (~3d)

---

### L13 — Add Product=Team level (drill-down hierarchy)

**Story.** As a user, I want a Product page (Portfolio → Product → Bet → Story → Session-jump-out) that is a drill-down from a clicked product card on Portfolio, so the v3 5-level hierarchy is implemented and so I can see one team's work without the Team Board collapsing Product+Bet into one smear. **Founder direction: "Team and Product are 1:1 — that's the same. It's a product team. The rest applies but it should be a drill-down not a side navigation."**

**Depends on.** None.

**Acceptance criteria.**
- New route `/work/product/:productId` in `packages/web/src/router.tsx` — the Product/Team page (Product = Team, 1:1).
- New page `packages/web/src/pages/WorkProduct.tsx`. Shows: team roster (agents on this product team), active bets (Canvas: Shaped + Committed), team burn vs cap, the team artifact stack (from L12 once it lands).
- Navigation: clicking a product card on `/work/portfolio` drills DOWN to `/work/product/:productId`. Submenu reflects the drill-down (breadcrumb-style: "Portfolio › Alpha"). NOT a side navigation tree.
- The existing `/work/team` route is removed (was always a denormalized Product+Bet smear). Existing links redirect to the user's primary product, or to Portfolio if they have multiple.
- Server APIs: `GET /api/products/:id` (product detail), `GET /api/products/:id/team` (roster), `GET /api/products/:id/bets`. Backed by real DB; inventory rows from L5 closed (zero hardcoded product/team data on this page).
- Vitest unit tests cover the dispatch + breadcrumb logic.
- Playwright e2e: from Portfolio, click a product card → URL changes to `/work/product/:id` → roster + bets render → breadcrumb shows correctly.
- `bun run check` + `bun run lint` + `bun run test` all green; e2e suite green.

**Validation scenarios.**
- Given a user clicks the "Alpha" product card on Portfolio, the URL becomes `/work/product/alpha` and the Alpha team's roster, active bets, and burn show.
- Given a user navigates `/work/team` (legacy URL), they redirect to their primary product.
- Given the breadcrumb, clicking "Portfolio" returns to `/work/portfolio`.
- Given a product has no active bets, the page shows a clear "0 active bets — pick a pitch" empty state, not a fallback fake bet.

**Contracts / constraints.**
- Product = Team. Do not introduce a separate "team" entity in the data model — they're the same.
- Drill-down only — no parallel side navigation.
- The Submenu reflects the drill-down with a breadcrumb; it does NOT carry a separate Product list.
- No emojis.

**Effort.** L (~5d)

---

### L14 — Bet-level human actions with consequence preview

**Story.** As a user on a Bet detail page, I want first-class buttons to Pause / Force-stop / Adjust-appetite / Comment-to-unblock / Downvote, with a consequence preview that shows what stops, what continues, and what's saved BEFORE I confirm, so I can act at the bet level (per v3 task-ownership rule: "humans act at the bet level, not the task level") without surprise.

**Depends on.** L3.

**Acceptance criteria.**
- New props on `BetCard.tsx`: `onPause`, `onForceStop`, `onCommentToUnblock`, `onDownvote`, `onAdjustAppetite` — all wired through Bet detail page.
- New `StopConsequencePreview` modal: server endpoint `POST /api/bets/:id/stop-preview` returns `{ sessionsTerminating, sessionsDraining, artifactsFrozen, artifactsDiscarded, agentsReturning }`. Modal shows this BEFORE the pause/force-stop commits.
- Adjust-appetite uses the L3 Cost+Tokens model (`moneyCap` + optional `tokenCap`) — no Duration field.
- Pause = soft stop (running tasks finish, no new tasks pick up). Force-stop = hard kill (running sessions terminate, freeze artifacts).
- Server endpoints: `POST /api/bets/:id/pause`, `POST /api/bets/:id/force-stop`, `POST /api/bets/:id/comment-to-unblock`, `POST /api/bets/:id/downvote`, `PATCH /api/bets/:id/appetite`. Each writes a `bet_revision_log` entry.
- `BetStatus` enum gains `paused` if not present; `killed` is wired to force-stop.
- Vitest unit tests cover each action's local handler + server response shape.
- Playwright e2e: open Bet detail → click Force-stop → consequence preview appears → confirm → bet transitions → revision log shows the entry.
- All hardcoded BetCard fixtures replaced with real data from API. Inventory rows from L5 closed.
- `bun run check` + `bun run lint` + `bun run test` all green; e2e suite green.

**Validation scenarios.**
- Given a running bet with 3 active sessions, when the user clicks Force-stop, the preview shows "3 sessions terminating, 5 artifacts frozen, 2 agents returning to other work" and requires confirm.
- Given the user clicks Pause (not Force-stop), running sessions DRAIN to completion; preview shows "3 sessions draining, no artifacts frozen".
- Given the user adjusts appetite from `$50` to `$100`, the bet's `moneyCap` updates and the revision log records the change with reason.
- Given comment-to-unblock, the comment surfaces in the bet's thread (from L18) for the assigned agent to read on next pickup.

**Contracts / constraints.**
- Consequence preview is non-skippable — the modal MUST render before any destructive action commits.
- Adjust-appetite uses the L3 Cost+Tokens types — never Duration.
- No keyboard shortcuts (founder demoted).
- No emojis.

**Effort.** L (~4-5d)

---

### L15 — Strip drag/drop from Kanban; add request-state-change + start-thread affordances

**Story.** As a user on the Team Board, I want drag/drop on tasks REMOVED (per v3: tasks are agent-team-owned, humans don't move them) but I still want a way to request the item to change state, OR to start a thread with the agent working on the item to unblock / stop / clarify, so I can interact at the task level without violating ownership. **Founder direction: "There should still be a way for a user to request the item to change state or start a thread with the agent working on the item to unblock or stop or whatever is necessary."**

**Depends on.** L7.

**Acceptance criteria.**
- `Kanban.tsx`: `PointerSensor`, `KeyboardSensor`, `COLUMN_TO_STATE` inverse map, and `handleMoveTask` are removed. `WorkTeam.tsx:116-120` no longer mutates state on drop.
- TaskCard gains a hover-revealed action set: `Comment`, `Downvote`, `Open thread`, `Request state change` (drop-down: pause / cancel / re-prioritize-up / clarify). Selecting an action posts a thread message to the task's thread (from L18) — the AGENT decides whether to honor it; humans request, never command.
- The "Open thread" action opens the task's attached Thread (from L7+L18) in the right pane.
- Server endpoints: `POST /api/tasks/:id/threads/messages` (post a request as a thread message). Server maps the request to a structured `task_request` entry the agent picks up on next session.
- Drag survives ONLY between Shaped → Committed columns in `Canvas.tsx` (that IS a human-owned move per Shape Up shaping); everywhere else drag is removed.
- Vitest tests cover: drag is no-op on TaskCard; request actions post messages to the right thread; "Open thread" lifts thread to right pane.
- Playwright e2e: try to drag a task → no-op → click Request state change → action posts → message appears in the task's thread → agent (mocked) acknowledges.
- `bun run check` + `bun run lint` + `bun run test` all green; e2e suite green.

**Validation scenarios.**
- Given a user attempts to drag a TaskCard, the action does nothing (no visual cue, no state change).
- Given the user clicks Request state change → "Cancel", a thread message appears on the task's thread saying "Human requests cancel; reason: <text>".
- Given the user clicks Open thread, the task's thread renders in the right pane (collapsible).
- Given the user clicks Downvote, the task's `downvote_count` increments and the agent's prioritization model picks it up next session.

**Contracts / constraints.**
- Tasks are agent-team-owned. Humans request; agents decide.
- Drag survives only Shaped → Committed (Shape Up shaping).
- No emojis.

**Effort.** M (~3d)

---

### L16 — Render bet pitch as blocks-in-markdown (with addressable block ids)

**Story.** As a user reading a bet pitch, I want it rendered as proper markdown with block-level structure (headings, lists, callouts) and addressable block ids — not as raw `<pre>` text — so I can read it like prose and so future stories (per-block comments, `@bet/<id>#<block>` deep-links) have the structural anchor they need.

**Depends on.** L2.

**Acceptance criteria.**
- `react-markdown` + `remark-gfm` added as runtime dependencies (founder approved via L2's recommendation).
- `WorkBet.tsx:262-267` (the `<pre>` fallback) replaced with a `<MarkdownBlocks>` component that parses the pitch markdown into the L2 block primitive and renders each block.
- Each top-level block gets a stable id (path + content_hash + position per L2). The block ids are exposed as URL fragments — `/work/bet/b1#problem` scrolls and highlights that block.
- The `@lore` "react-markdown is NOT a dependency yet" comment is removed; new `@lore` documents the block-id stability rule.
- Vitest tests cover: round-trip (markdown → blocks → markdown) is lossless; block ids are stable across re-parse with identical content.
- Playwright e2e: open a bet → pitch renders as styled markdown (no `#` symbols visible); navigating to `/work/bet/b1#solution` scrolls to and highlights the Solution block.
- All hardcoded `MOCK_PITCH` strings remain ONLY in `*.stories.tsx` and tests — runtime data comes from the bet's `pitch` field in the DB. Inventory row from L5 closed.
- `bun run check` + `bun run lint` + `bun run test` all green; e2e suite green.

**Validation scenarios.**
- Given a pitch with `# Problem`, then the rendered page shows a styled H1, never literal `#`.
- Given two parses of the same pitch, the block ids are identical (stable id rule).
- Given a deep-link to a block id, the page scrolls and highlights.
- Given a pitch is edited and one block changes, OTHER block ids are unchanged (id-stability test).

**Contracts / constraints.**
- The on-disk format remains valid markdown (per L2) — never escape into a proprietary block DB.
- No customizable block kits (founder filter).
- No emojis.

**Effort.** S (~2d)

---

### L17 — Cost + Tokens model wired into Work

**Story.** As a user, I want cost numbers (today's spend, weekly burn, per-bet appetite vs spend, per-artifact cost) all expressed in the L3 Cost + Tokens model — Money types, not strings — so v3 Basic 3 ("see what it's costing") is implementable at every level and so cost-per-artifact ($4 landing page, $97 rewrite, $0.30 session) reads honestly.

**Depends on.** L3.

**Acceptance criteria.**
- `Money` and `TokenUsage` types defined in `packages/shared/src/types.ts` per L3 spec. Existing string-typed cost (e.g., `MOCK_RAIL_COST.todaySpend = "$12.40"`, `Bet.appetite = "2 weeks"`) replaced with structured types throughout `packages/web/src/`, `packages/server/src/`, and `packages/db/src/schema.ts`.
- DB migration: `bets.appetite_money_cap` (jsonb-or-equivalent storing Money), `bets.token_cap` (TokenUsage), `bets.spend_money` (Money), `bets.spend_tokens` (TokenUsage). `tasks.cost_cap_money`, `tasks.cost_actual_money`, `tasks.tokens_used`. `sessions.cost_money`, `sessions.tokens_used`.
- Removed: any `Duration` field from bet/task/session that pretended to be a budget. Wall-clock duration on sessions is preserved as `duration_ms` (informational only).
- A shared `MoneyDisplay` formatter component renders `$12.40` style with tabular numerals (per AQ-006 if enforced). Bet header shows the two-axis appetite line: spend/cap (money) and tokens-used/cap (TokenUsage).
- Server endpoints updated to read/write the new shape; backfill on existing rows uses sensible defaults.
- Vitest tests cover: Money formatter, conversion helpers, type-narrow on currency.
- Playwright e2e: open Bet detail → see appetite line with structured money display, no string-money anywhere; ship the bet → spend updates correctly.
- All hardcoded cost strings replaced with real DB-backed values. Inventory rows from L5 closed.
- `bun run check` + `bun run lint` + `bun run test` all green; e2e suite green.

**Validation scenarios.**
- Given a bet has `appetite: { moneyCap: $50.00 USD, tokenCap: { ... frontier } }`, the header shows "$22.40 / $50.00 spent · 1.2k / 5k frontier tokens".
- Given a session costs $0.30, the cost-per-artifact column on the artifact band reads `$0.30`, not `0.30` or `30 cents`.
- Given a refactor removes the last `string`-typed money in the codebase, a TS-level lint enforces "no string money" going forward.
- Given a session ran for 30 minutes with high token use, the UI shows token usage prominently and duration as a small footnote — never as a budget axis.

**Contracts / constraints.**
- Money is always `amountMinor` (cents-int), never floats. Currency-aware.
- Duration is informational ONLY; never a budget axis (founder's call per L3).
- Tokens carry `modelTier` (founder's call: tokens + tier indicates complexity).
- No emojis.

**Effort.** M (~3-4d)

---

### L18 — Thread primitive attached to bets, tasks, artifacts

**Story.** As a user on Bet detail / Task detail / Artifact view, I want an attached thread side pane (using L7's Thread primitive with `attachedTo: { kind: "bet"|"task"|"artifact" }`) so localized discussions live with the work, per founder's "threads are a theme across the entire app".

**Depends on.** L7, L16.

**Acceptance criteria.**
- New component `<ThreadAttached subjectKind="bet"|"task"|"artifact" subjectId={...}>` renders a side pane (Slack two-pane model) on Bet detail, Task detail (when shipped), and ArtifactView.
- Bet detail's existing `MockBetComment[]` (already removed in L7) is replaced by a real thread fetched via `GET /api/threads?attachedToKind=bet&attachedToId=<id>`. Comments are messages on that thread.
- Task detail (L15's "Open thread" action) opens the same component for a task-attached thread.
- ArtifactView gains a thread side panel when an artifact has an attached thread.
- Comments-on-blocks (Notion-CORE) anchor to the block ids from L16: clicking a comment on a block scrolls and highlights the block; the comment is stored as a message with `block_anchor: <block-id>`.
- Vitest tests cover: ThreadAttached lifecycle, posting a message to a bet thread, anchoring to a block.
- Playwright e2e: open Bet detail → side pane shows thread → post a comment → another tab sees it (WebSocket sync).
- No hardcoded comments anywhere — all flow through the API. Inventory rows from L5 closed.
- `bun run check` + `bun run lint` + `bun run test` all green; e2e suite green.

**Validation scenarios.**
- Given a bet with 5 attached thread messages, the side pane on Bet detail shows the 5 messages in the right order.
- Given the user posts a comment anchored to block `#problem`, the comment shows the block anchor; clicking it scrolls to the Problem block.
- Given a task is unblocked via a thread message, the agent's next session reads the message (via the existing thread schema).
- Given an artifact has no thread, the panel is collapsed and shows "0 comments — start a thread".

**Contracts / constraints.**
- ThreadAttached uses the L7 `Thread` shape — no parallel `Comment` table.
- Two-pane layout (main + side) — do not nest threads inline within the main pane (Slack lesson: long agent reasoning belongs in a right pane).
- No emojis.

**Effort.** M (~3d)

---

### L19 — Harness jump-out from session metadata

**Story.** As a CTO-tier user wanting to inspect what an agent actually did, I want a "Open in <harness>" jump-out button on each task / session row, so I can pop into the agent harness (opencode / hermes / pi-agent / openclaw / claude-code) for the deep view, while HyperIdle continues to NOT render the session interior (per v3: session is delegated to the harness).

**Depends on.** None.

**Acceptance criteria.**
- `TaskCard.tsx` and the bet detail tasks table extended with `latestSession?: { id, agent, costMoney: Money, tokensUsed: TokenUsage, durationMs, outcome, harnessKind, harnessUrl }`. Type updated in `packages/shared/src/types.ts`.
- Server endpoint: `GET /api/tasks/:id/sessions?latest=1` returns the latest session for a task with the harness URL.
- New small component `<HarnessJumpButton harnessKind={...} harnessUrl={...}>` rendered on TaskCard and the tasks table on Bet detail. Opens the harness URL in a new tab; the URL is treated as opaque to HyperIdle.
- Outcome chip on TaskCard reflects the latest session outcome (completed / errored / interrupted).
- Vitest tests cover: button visibility (only when latestSession exists), outcome chip mapping.
- Playwright e2e: open Bet detail → tasks table shows outcome chips → click "Open in opencode" → new tab opens.
- All hardcoded session data replaced with real DB-backed sessions. Inventory rows from L5 closed.
- `bun run check` + `bun run lint` + `bun run test` all green; e2e suite green.

**Validation scenarios.**
- Given a task with a completed session in opencode, the row shows "Open in opencode" linking to the harness URL; clicking opens a new tab.
- Given a task with no session yet, the harness button is hidden (no placeholder).
- Given a session errored, the outcome chip is red and clicking jumps to the harness's error view.
- Given the harness URL is malformed, the button is hidden (defensive — never broken-link).

**Contracts / constraints.**
- HyperIdle does NOT render the session interior. The button jumps OUT.
- Harness URL is opaque — HyperIdle stores and displays, never parses.
- No emojis.

**Effort.** S (~1-2d)

---

### L20 — Auto-rollover / auto-carry primitive at cycle boundary

**Story.** As an operator, I want unfinished bets and tasks to auto-carry into the next review cycle without me filing them by hand — the "stuff that gets forgotten" — surfaced as an `auto-carried` rail on Portfolio, per Linear-CORE automatism. This is auto-carry only — NOT sprint planning, NOT cycles UI (founder cut Linear cycles).

**Depends on.** L14, L17.

**Acceptance criteria.**
- New `Cycle` table: `{ id, label, starts_at, ends_at, status }`. New `BetCycle` join: `{ bet_id, cycle_id, carry_from_cycle_id? }`.
- Server cron job at cycle close: bets with status in (`active`, `paused`) AND open tasks AND `appetite.moneyCap` not exceeded → automatically copied into the next cycle with `carry_from_cycle_id` set. Status preserved.
- New API: `GET /api/cycles/current/auto-carried` returns the auto-carried bets with provenance.
- Portfolio page gains an "Auto-carried" rail row showing carried bets with a small `carried from <cycle>` provenance chip. No human gesture required to carry.
- The bet's appetite line shows: "If still open at appetite end: carry / stop and review" — clear pre-cycle communication.
- Vitest tests cover: cycle close cron, carry rule, provenance preserved.
- Playwright e2e: simulate cycle close → auto-carried rail appears with the right bets and chips.
- `bun run check` + `bun run lint` + `bun run test` all green; e2e suite green.

**Validation scenarios.**
- Given a bet is still in_progress at cycle close, the bet appears in the next cycle with `carry_from_cycle_id` set; no human action required.
- Given a bet exceeded its `moneyCap`, the bet does NOT auto-carry; it surfaces in a "needs review" rail (per L14's force-stop / adjust path).
- Given a carried bet, the Bet detail shows "carried from cycle <X>".
- Given the cron fails, the failure is logged and a fallback retry runs; bets are never silently dropped.

**Contracts / constraints.**
- Auto-carry is the ONLY cycle UI. No sprint planning, no capacity dial, no cycle picker (founder cut cycles UI).
- The cycle entity exists for grouping and bookkeeping — it is not surfaced as a planning UI.
- No emojis.

**Effort.** M (~3d)

---

### L21 — CoC create-on-the-fly (bottom-right rail overlay thread)

**Story.** As a user anywhere in HyperIdle, I want a Chief of Staff button at the bottom-right of the rail; clicking opens an OVERLAY thread (modal-style) where I can ask anything; I can ADD ANYTHING from the surrounding view as context to that thread; the CoC responds without pulling product agents off their work. **Founder direction: "The button to start a thread with the COC could just be bottom right in the rail and it overlays a thread and somehow we can add anything as context to that thread. That would really be your assistant in the company."**

**Depends on.** L7.

**Acceptance criteria.**
- New component `<CoCTrigger>` rendered as a fixed-position button at the bottom-right of the Rail. Visible on every Work / Conversations / Knowledge view (the founder's "anywhere" rule).
- Click opens an overlay thread (modal-overlay, dimming the page, but the underlying view stays visible — that's the "add as context" affordance).
- The overlay thread uses L7's Thread primitive with `kind: "coach"` and `attachedTo: { kind: "user", id: <self> }`. It's never attached to a bet or task — that's the "doesn't pull agents off work" part.
- "Add as context" affordance: the user can drag (or click "Add this") on any visible item (bet card, task row, artifact, knowledge entry, message) and it's attached as a context reference to the next CoC message. Context items render as chips above the input.
- Server: `POST /api/coc/sessions` initiates a CoC session; messages include the context reference IDs.
- The CoC responds (new tab in Conversations as a `coach` thread) — for-the-record persistence; the user can promote any answer to Knowledge later (cross-area follow-up, not in this story).
- Vitest tests cover: trigger renders, overlay opens, context attaches.
- Playwright e2e: from Work portfolio, click CoC button → overlay opens → drag a bet card as context → ask a question → response renders.
- `bun run check` + `bun run lint` + `bun run test` all green; e2e suite green.

**Validation scenarios.**
- Given the user is on any page, the CoC button is visible at bottom-right of the rail.
- Given the user clicks CoC, the overlay opens; the underlying page stays visible behind.
- Given the user adds a bet as context, the chip "context: Bet B12 (Auth flow)" appears above the input; the next message includes the reference.
- Given the user closes the overlay, the thread persists in Conversations (kind=coach) and can be reopened.

**Contracts / constraints.**
- Bottom-right placement is NON-NEGOTIABLE per founder.
- No keyboard shortcut to invoke CoC — button only (founder demoted keyboard idioms).
- CoC threads are user-attached, never bet/task-attached.
- No emojis.

**Effort.** M (~3-4d)

---

### L22 — Three relevance signals as first-class data

**Story.** As a user on `/knowledge`, I want recency / frequency / impact rendered as three real signals on every row — not one opaque `attentionScore` and a hand-templated `whyNow` — and I want the citation-driven impact computed from real agent citations, so v3 Knowledge Basic 1 ("surface the most relevant items") rests on data, not aspiration.

**Depends on.** L4.

**Acceptance criteria.**
- DB schema migration adds `lastValidatedAt`, `lastEditedAt`, `lastAccessedAt`, `accessCount`, `impactScore` columns to the `knowledge_items` table. New `knowledge_citations` table per L4.
- `packages/fabric/src/attention-scoring.ts` rewritten: `computeUsage` returns real `accessCount` from the new column; `computeImpact` queries `knowledge_citations` (NOT the old `IMPACT_BY_KIND` constant). Old constant is deleted.
- Agent harness contract updated: every artifact-producing session emits `cited_knowledge_ids: string[]` to a new endpoint `POST /api/sessions/:id/citations`. Server records the citations on session completion.
- New `relevance` view computed per L4 formula with tunable weights from a config table.
- KnowledgeRow renders a 3-cell signal block: Recency dot (color by half-life) / Freq number (last 30d) / Impact number (citation count). When a signal has no data, render `—` (per L4 anti-pattern rule — never a fake number).
- Sort/filter UI: 3-way segmented sort control (recent / cited / impact), default `cited`. NO customizable saved-views builder (founder cut).
- Vitest tests cover: relevance composite math, sort dispatch, fake-zero guard.
- Playwright e2e: open `/knowledge` → row signals visible → click "cited" → list re-sorts → click an item with high impact → detail page shows the citation count.
- All hardcoded `attentionScore` / `whyNow` strings removed from page-side fixtures. Inventory rows from L5 closed.
- `bun run check` + `bun run lint` + `bun run test` all green; e2e suite green.

**Validation scenarios.**
- Given a knowledge item cited by 5 agent sessions, its impact reads `5`; if cited by 0, it reads `—`.
- Given two items, one fresh-validated yesterday and one stale 6 months ago, sorting by recency surfaces the fresh one.
- Given an agent harness emits citations, the next view of the cited item reflects the new count.
- Given the user changes sort, the URL `?sort=impact` is bookmarkable.

**Contracts / constraints.**
- No fake numbers — always `—` until data exists.
- No keyboard shortcuts.
- No customizable saved views (founder cut).
- No emojis.

**Effort.** L (~5d)

---

### L23 — Blocks-in-markdown body renderer (Knowledge)

**Story.** As a user reading a knowledge item, I want the body rendered as proper markdown blocks (headings, lists, callouts, code) — not a single `<pre>` rectangle — so a 3-sentence belief and a multi-section playbook don't share the same grey box, and so per-block comments / linking can attach to addressable block ids.

**Depends on.** L2.

**Acceptance criteria.**
- `KnowledgeDetail.tsx:301-307` `<pre>` replaced with a `<MarkdownBlocks>` (same component as L16 — pulled into `packages/web/src/components/blocks/`).
- Block ids are stable per L2; `/knowledge/k12#section-3` deep-links work.
- The on-disk format remains valid markdown — the bodies in the DB stay text, never JSON.
- Code blocks render with monospace + syntax highlighting; quotes get callout styling; lists get proper bullet/number rendering.
- Vitest tests cover: round-trip lossless on supported types; block-id stability.
- Playwright e2e: open a Knowledge entry with multi-section body → see styled rendering → deep-link to `#some-block` scrolls.
- Hardcoded `LEGACY_DETAILS` text removed; bodies come from API. Inventory rows from L5 closed.
- `bun run check` + `bun run lint` + `bun run test` all green; e2e suite green.

**Validation scenarios.**
- Given a 3-sentence belief, the page renders 3 paragraphs with no chrome — light, readable.
- Given a 5-section playbook, the page renders with H2 / H3 hierarchy; the section block ids are addressable.
- Given a deep-link `/knowledge/k12#anti-patterns`, the page scrolls and highlights.
- Given an edit changes only one section, the OTHER section block ids are unchanged.

**Contracts / constraints.**
- Reuse the `<MarkdownBlocks>` component from L16 — single block primitive across Work and Knowledge.
- No customizable view kits.
- No emojis.

**Effort.** M (~2-3d)

---

### L24 — Linking primitive (`[[wiki-link]]` + backlinks)

**Story.** As a user reading a knowledge item, I want `[[id]]` syntax in the body to render as inline KnowledgeChip with hover preview, and a backlinks panel under the body showing "cited by N items", so the graph emerges from prose rather than from a fixture array.

**Depends on.** L23.

**Acceptance criteria.**
- New `knowledge_links` table: `{ from_id, to_id, kind: "cites" | "contradicts" | "supersedes" | "evidence" }`.
- `[[id]]` syntax (or `[[title]]` with autocomplete) parsed in block content; resolves to inline `<KnowledgeChip>` with hover preview (title + short body excerpt + source attribution).
- Backlinks computed by reverse query (`SELECT from_id FROM knowledge_links WHERE to_id = :id`) and rendered under the body as `Cited by N items`. Replaces the hand-authored "Related" sidebar.
- New API: `GET /api/knowledge/:id/backlinks`.
- `@bet/<id>` and `@decision/<id>` mention syntax also resolve (cross-area links — anchor for Conversations #9 and Work #5).
- Vitest tests cover: `[[id]]` parse + resolve, backlinks query, autocomplete.
- Playwright e2e: open a knowledge item with a `[[k1]]` mention → chip renders → hover shows preview → click navigates to k1; backlinks panel shows the entries that link in.
- Old `relatedItems[]` fixture string array removed; replaced with computed backlinks. Inventory rows from L5 closed.
- `bun run check` + `bun run lint` + `bun run test` all green; e2e suite green.

**Validation scenarios.**
- Given a body contains `[[k7]]`, the rendering shows a chip; hovering shows k7's title + lead sentence.
- Given k7 is cited by 4 items, k7's detail page backlinks panel shows those 4 entries.
- Given `@bet/b1` in a knowledge body, the chip resolves to bet b1 (cross-area link).
- Given an unresolved link `[[zzzzz]]`, the chip renders as broken-link with a clear visual state — never silently text.

**Contracts / constraints.**
- Linking is a `packages/shared` primitive — exported and consumed by Conversations and Work as well (per cross-area finding).
- Backlinks are computed, never stored as a fixture.
- No emojis.

**Effort.** L (~5d)

---

### L25 — Continuity-loop verbs as typed actions

**Story.** As a user on a knowledge detail page, I want typed actions — `validate` / `refine` / `merge` / `split` / `promote` / `deprecate` — instead of just an Edit button whose Save doesn't even hit the API, so the v3 continuity loop ("capture → review → refine → promote / merge / split / deprecate") actually exists in the UI.

**Depends on.** None.

**Acceptance criteria.**
- New `KnowledgeAction` enum: `"validate" | "refine" | "merge" | "split" | "promote" | "deprecate"`.
- Right-aligned verdict bar on `/knowledge/:id` detail page: each action is a button (with confirmation for destructive ones).
- Server endpoints for each action wired to existing endpoints in `packages/server/src/routes/knowledge.ts` (which already has merge/split/promote/deprecate). Save in edit mode calls `PATCH /:layer/:id` with optimistic locking. The current "state-only Save" is fixed.
- `CurationSuggestionCard.tsx`: Review button wires to inline merge confirmation (no longer `undefined`).
- Each action writes a `knowledge_edit_log` entry with the action kind + reason.
- Vitest tests cover: each action → server call → log entry.
- Playwright e2e: open knowledge item → click Promote → confirmation → status changes → log shows the entry.
- All "Save doesn't persist" lore removed; Save genuinely persists. Inventory rows from L5 closed.
- `bun run check` + `bun run lint` + `bun run test` all green; e2e suite green.

**Validation scenarios.**
- Given the user clicks Save in edit mode, the body persists to the DB; reloading the page shows the saved version.
- Given the user clicks Promote, the item's status flips to `active` and the log records who and when.
- Given the user clicks Merge, an inline picker appears for the merge target; on confirm, the source item gets `superseded_by` and a log entry.
- Given the user clicks Deprecate, the item's status becomes `archived` and it's filtered out of default views.

**Contracts / constraints.**
- Optimistic locking on Save — no "last writer wins" silent overwrite.
- Destructive actions (merge / deprecate) require explicit confirm.
- No emojis.

**Effort.** M (~3d)

---

### L26 — Per-block thread + comment affordance (Knowledge)

**Story.** As a user wanting to leave a note for the practice lead on a specific paragraph of a knowledge entry, I want a hover-revealed left gutter per block with a comment-thread anchor, so the founder's wiki-style "leave a note" affordance lands and so the per-block thread uses the same Thread primitive as the rest of the app.

**Depends on.** L7, L23.

**Acceptance criteria.**
- Block-level hover gutter on the left of each block: drag-handle on top, comment count + open-thread on the bottom. Click opens a `<ThreadAttached subjectKind="knowledge" subjectId={...} blockAnchor={blockId}>` (uses L7 + L18's primitives).
- Block-anchored threads use Thread `kind: "chat"` with `attachedTo: { kind: "knowledge", id }` and `block_anchor: <block-id>` on the parent message.
- Existing read-only Observation Log is replaced with the same ThreadAttached panel at item-level (no `block_anchor` for item-level discussion).
- Vitest tests cover: hover gutter renders, click opens correct thread, block_anchor preserved.
- Playwright e2e: hover a paragraph → gutter shows comment count → click → thread opens scoped to that block → post a message → reload → message persists.
- All hardcoded `MOCK_OBSERVATIONS` removed; observations are real thread messages. Inventory rows from L5 closed.
- `bun run check` + `bun run lint` + `bun run test` all green; e2e suite green.

**Validation scenarios.**
- Given a block has 3 anchored comments, the gutter shows "3" and clicking opens those 3 messages.
- Given the user posts a message anchored to block `#anti-patterns`, reloading shows the message attached to that block.
- Given the user removes a block (edits the body), the anchored thread is preserved with a "block deleted" indicator on each anchored message.
- Given an item-level thread (no `block_anchor`), it appears at the top of the discussion panel as "general discussion".

**Contracts / constraints.**
- Use L7's Thread primitive — no parallel `KnowledgeComment` table.
- Hover-revealed gutter — never always-visible (clutter).
- No emojis.

**Effort.** L (~4d)

---

### L27 — Knowledge-lifecycle status (not Work-status chips)

**Story.** As a user on `/knowledge`, I want chips that reflect the knowledge lifecycle (`captured` / `provisional` / `validated` / `active` / `stale` / `archived`) — NOT the Work-borrowed `HEALTHY / BEHIND / BLOCKED / ERROR` framing — so a `pattern` doesn't display as "ERROR" and an `archived` doesn't display as "DONE".

**Depends on.** None.

**Acceptance criteria.**
- `KnowledgeRow` no longer maps knowledge lifecycle through `knowledgeStatusToStatus`. The `StatusChip` import is replaced by a new `KnowledgeStatusChip` (or KnowledgeRow inlines the rendering).
- Lifecycle states render as monochrome dots + label text. Only `stale` gets a colored (warning) dot — everything else is monochrome (Knowledge isn't broken; it's simply at different lifecycle stages).
- The misleading mapping table is deleted from `KnowledgeRow.tsx` and any other consumer.
- Vitest tests cover: each lifecycle state renders the correct chip; old Work-status colors never appear on knowledge.
- Playwright e2e: open `/knowledge` → no `ERROR` / `BEHIND` chips on knowledge items; `stale` items show the warning dot.
- Visual-regression baseline updated for the affected rows (separate `chore(L27):` commit).
- Inventory row from L5 (Work-status borrowing on Knowledge) closed.
- `bun run check` + `bun run lint` + `bun run test` all green; e2e suite green.

**Validation scenarios.**
- Given a `pattern` knowledge item, the chip reads `pattern · captured` or similar — never `ERROR`.
- Given an `archived` item, the chip reads `archived` — never `DONE`.
- Given a `stale` item, only that chip is colored (warning).
- Given the visual-regression run, the Knowledge list is re-baselined cleanly.

**Contracts / constraints.**
- No reuse of `StatusChip` (a Work primitive) on Knowledge — Knowledge has its own lifecycle vocabulary.
- Color discipline: monochrome by default; `stale` is the only colored state.
- No emojis.

**Effort.** S (~1-2d)

---

### L28 — Six knowledge shapes differentiated in row + detail

**Story.** As a user scanning `/knowledge`, I want the 6 shapes (`belief` / `decision` / `skill` / `doc-tree` / `graph` / `table`) to look different — not pixel-identical — so a CTO scanning decisions can find decisions and a grandma reading a belief sees only what fits a belief.

**Depends on.** None.

**Acceptance criteria.**
- `MockKnowledgeItem` collapses six shapes into one — replaced with a discriminated union: `{ kind: "belief"; ... } | { kind: "decision"; statement, rationale, alternatives, ratifiedAt } | { kind: "skill"; steps[], antiPatterns[] } | { kind: "doc-tree"; sections[] } | { kind: "graph"; nodes[], edges[] } | { kind: "table"; rows[], schema }`.
- Detail page becomes a `<ShapeRenderer kind={...}>` dispatching to per-shape body components (`BeliefBody`, `DecisionBody`, `SkillBody`, `DocTreeBody`, `GraphBody`, `TableBody`). Each body lives in `packages/web/src/components/knowledge-shapes/`.
- KnowledgeRow's secondary line is type-driven: decision shows date+author+ratification; pattern shows `applies-when`; brief shows lede; skill shows step-count; etc. Same row primitive, different content.
- Server: `GET /api/knowledge/:id` returns the typed shape.
- Vitest tests cover: each kind → correct body renders; row differentiation visible per kind.
- Playwright e2e: navigate through one of each kind on `/knowledge` → each renders distinctly.
- `bun run check` + `bun run lint` + `bun run test` all green; e2e suite green.

**Validation scenarios.**
- Given a `decision`, the row shows the date + author + ratification chip; the detail shows statement / rationale / alternatives.
- Given a `skill`, the row shows step count; the detail shows numbered steps + anti-patterns.
- Given a `graph`, the detail shows the focused node + edges (limited rendering — no full graph view, founder cut).
- Given a kind not yet implemented (early phase), a clear "shape under construction" body shows; never an empty page.

**Contracts / constraints.**
- Six shapes are FIXED. No 7th. Founder filter blocks new shapes without a concept-doc update (L1/L2/L4 patterns).
- Per-shape rendering uses the L23 block primitive inside each body — blocks compose all shapes.
- No graph visualization in this story (founder rejected — "visualizing zero edges is theatre"); future work after L24 has data.
- No emojis.

**Effort.** M (~3d)

---

### L29 — Final sweep: hardcoded data + test coverage gap

**Story.** As a maintainer, I want a final pass that closes any remaining hardcoded-data inventory rows from L5, AND I want a deep look at why our test/e2e suite passed even with hardcoded UI data — closing the structural test-coverage gap with new tests that would have caught it — so that we leave Track L with real data flowing through real APIs and a test suite that proves it.

**Depends on.** L5, L6, L7, L8, L9, L10, L11, L12, L13, L14, L15, L16, L17, L18, L19, L20, L21, L22, L23, L24, L25, L26, L27, L28.

**Acceptance criteria.**
- Re-walk every row in `docs/reviews/hardcoded-data-inventory.md` (L5). For each row, mark `closed-by: <story>` or `unassigned`. Every `unassigned` row gets either a fix in this story or a recorded follow-up ticket-equivalent in `docs/reviews/post-L29-followups.md`.
- Add an ESLint rule that forbids importing from `packages/web/src/fixtures/` outside of `*.test.ts*` and `*.stories.tsx` files. Rule lands in `packages/eslint-config/` (or wherever the project's lint config lives) and fails CI on violation.
- Add a Vitest meta-test that scans the `packages/web/src/pages/` directory at compile time and asserts: no `MOCK_*` / `FALLBACK_*` constants are imported into runtime modules. (Static check via TS compiler API; mirrors the K4 inspector pattern.)
- **Test-coverage gap analysis (deliverable doc):** new file `docs/reviews/test-coverage-gap-L29.md` answers, with concrete examples:
  - Why did existing tests pass with hardcoded data? (e.g., tests imported the same fixtures the runtime imported, so both lied together; or tests stubbed the API but never asserted the API was called.)
  - Which test patterns are structurally weak — list at minimum 3, with examples and remediation.
  - What integration / e2e tests are missing — list with priorities and an "added in this story" / "tracked for follow-up" tag per item.
- Add at least 5 new e2e tests that would have caught the most painful previously-hidden bugs (per `area-*-journey.md` and `improvements-*.md`):
  - A test that asserts `/conversations` shows real threads from the API, not fixture counts.
  - A test that asserts BetCards on Portfolio link to real bet detail (not no-op divs).
  - A test that asserts knowledge items' relevance signals come from the API (not fake numbers).
  - A test that asserts the Submenu count badges match the list length (no count lies).
  - A test that asserts cost values render as the `Money` shape, not strings.
- All `bun run test` and Playwright e2e suites green. CI lint job rejects any new fixture import into runtime code.
- `bun run check` + `bun run lint` + `bun run test` all green; full Playwright e2e suite green.

**Validation scenarios.**
- Given an engineer adds a `MOCK_WIDGETS` constant to `packages/web/src/pages/Foo.tsx`, the lint rule fails the build with a clear message.
- Given the inventory, every row is either `closed-by: L<n>` or has a tracked follow-up entry.
- Given the gap analysis doc, when read, it explicitly enumerates ≥3 structural test weaknesses with concrete examples.
- Given the new e2e tests run on the pre-L1 codebase (rolling back), they fail — proving they would have caught the issues.

**Contracts / constraints.**
- The lint rule is non-bypassable; `// eslint-disable-next-line` requires a tracking issue in the message.
- Hardcoded data is OK in `tests/`, `*.test.ts*`, `*.stories.tsx`. NOT OK in any runtime page or component.
- The gap-analysis doc is a deliverable, not a stub.
- No emojis.

**Effort.** L (~5d)

---

## Track L dependency graph

```
L1 (Thread spec) ──┬─► L7 ─┬─► L8 ─► L10
                   │       ├─► L9
                   │       ├─► L11
                   │       ├─► L15
                   │       ├─► L18
                   │       ├─► L21
                   │       └─► L26
                   │
L2 (Block spec) ───┼─► L16 ─► L18
                   └─► L23 ─► L24
                            └─► L26
                            └─► L28 (uses blocks inside shape bodies)

L3 (Cost spec) ────┬─► L14 ─► L20
                   ├─► L17 ─► L20

L4 (Relevance) ────► L22

L5 (Inventory) ───────────────────────────► L29
L6, L13, L19, L25, L27, L28 (independent) ─► L29
L8, L9, L10, L11, L14, L15, L17, L18, L20, L21, L22, L23, L24, L26 ──► L29
```

**Critical path:** **L1 → L7 → L18 → L20 → L29** (longest dependency chain). **L2 → L23 → L24 → L29** runs in parallel. **L3 → L17 → L20 → L29** parallel. **L4 → L22 → L29** parallel. **L13 → L12** parallel.

**Spec-stories (L1–L4) are all independent and run first in parallel.** L5 (inventory) is also independent and runs in parallel with the specs. After spec stories land:

- L6 (verdict commit) is independent — earliest impl story.
- L7 (Thread primitive) gates Conversations + cross-area thread work (L8, L9, L11, L15, L18, L21, L26).
- L13 (Product level) gates L12 (artifact stack) because the gallery needs the Product page to host the team feed.
- L14 + L17 gate L20 (auto-rollover needs cost model + bet actions + consequence preview).
- L23 (Knowledge blocks) gates L24 (linking) and L26 (per-block threads).
- L29 (final sweep) is the closer — depends on L5 + every impl story.

Stories that have **no Track-L dependencies** and can be picked up early once specs land:
L6, L13, L19, L25, L27, L28.

---
