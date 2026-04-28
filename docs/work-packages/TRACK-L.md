# Track L: Journey-Aligned Improvements

This track implements the founder-accepted improvements from the post-journey-v3 alignment review (`docs/reviews/improvements-conversations.md`, `improvements-work.md`, `improvements-knowledge.md`). Three cross-cutting concept-doc updates land first (Thread + messages, Block primitive, Cost & Tokens model, Knowledge relevance signals) so that downstream implementation stories build against one shared spec. A hardcoded-data inventory runs in parallel and feeds a final sweep that closes data-layer + test-coverage gaps.

**Scope rules (apply to every story in this track):**
- **Spec stories first, code second.** L1–L4 are concept-doc updates. They ship no code; they ship the contract. Implementation stories (L7+) reference the contract and stay narrow.
- **Architect plans the how.** Acceptance criteria describe the journey outcome the user gets and the contracts that must hold. The architect's `/plan <id>` step decides file paths, component names, type shapes, endpoint paths, schema column names, library choices, and the exact action / chip / section / placement choices unless the founder has already pinned them. Where this track names a specific file, line, or constant, it is evidence of the *current bug* (the gap to close) — not a recipe for the fix.
- **Reusable primitives get more design effort, not less.** Thread + messages (L7), Block (L2), and Artifact view (L12) are foundational reusable components. The architect and designer explore multiple versions, compare them, and run a design critique inside the planning step before settling. DS-quality. Build once, reuse everywhere.
- **Real data, not fixtures.** Every implementation story replaces hardcoded runtime data with real persistence and APIs. Hardcoded data is allowed only in test files, story files, and dedicated fixtures directories that are imported solely by tests or stories. Pages and runtime components must not import `MOCK_*` / `FALLBACK_*` constants.
- **Acceptance criteria include test coverage.** Every story includes at least one Vitest test for new logic and at least one Playwright e2e for any user-visible change. The full e2e suite re-runs locally before push (per L7 retro lesson — UI-shape changes can break unrelated specs); a regression that escaped existing coverage gets a coverage gate added in the same story.
- **Concept docs stay in sync.** Stories that change a fundamental shape (Thread + messages, Block, Cost+Tokens, relevance signals, level hierarchy, lifecycle propagation) update `docs/concept/` in the same commit so the documentation stays accurate.
- **No founder-filter regressions.** Cargo-cult patterns explicitly demoted by the founder (keyboard verb shortcuts, optimistic-UI bragging, sidebar drag-reorder, emoji reactions, cycles UI, search-modifier mini-language, customizable dashboards / view kits) are not introduced in any story.

**Reference docs:** `docs/reviews/journeys-conversations.md` (v3), `docs/reviews/journeys-work.md` (v3), `docs/reviews/journeys-knowledge.md` (v3), `docs/reviews/improvements-*.md` (the three Phase 2 alignment outputs), `docs/reviews/reference-{notion,linear,slack}.md` (with the founder priority filter at the top of each), `docs/concept/HUMAN_INTERFACE_LAYER.md`, `docs/concept/KNOWLEDGE_ARCHITECTURE.md`, `docs/concept/PROCESS_LAYER.md`, `docs/concept/AGENT_LAYER.md`.

See `docs/work-packages/SHARED.md` for tech stack and the cross-track dependency graph.

---

### L1 — Concept: Thread + messages across all areas

**Story.** As an architect, I want one shared spec for what a thread is, what messages it can carry, and where it can attach, so that every consumer in the track (Conversations, Work, Knowledge, the CoC overlay) builds against one model instead of inventing variants.

**Depends on.** None.

**Acceptance criteria.**
- The spec frames a thread as a *container* with metadata (initiator, attached entity, blocking-or-not, sync-or-async, last-active, participants, pinned, resolved). Messages are the things with shapes — most are plain text; some are *rich* and carry their own inline UI (a review message embeds an output artifact and a decision affordance; a questionnaire message embeds a constrained answer set). This is the generative-UI pattern every modern AI chat interface uses; the spec leans into it rather than reinventing it.
- DM, coach-thread, and feed are documented as thread *configurations* (visibility, membership, pinning) — NOT as message shapes. The spec rejects the v2 "thread shape vocabulary" framing.
- The cross-area attachment contract is captured: a thread attaches to any host entity (bet, task, knowledge item, agent, user). Conversations is a *view* over all threads, never their owner. Un-attached coach threads attach to the current user. Threads do NOT attach to artifacts — artifact discussion lives on the producing task (per L18 / L12 reframing).
- The message-type vocabulary is defined for the journeys this track ships — at minimum plain text, review, and questionnaire. Adding a new rich message type later requires a concept-doc update first.
- The same contracts are added to `docs/work-packages/SHARED.md` "Shared Contracts" section so implementation stories can reference them without re-inventing.
- `docs/concept/ARCHITECTURE.md` and `docs/concept/AGENT_LAYER.md` are updated where threads are mentioned.
- No code or schema changes. `bun run check` + `bun run lint` + `bun run test` all green (docs only).

**Plan calls.** This is a foundational reusable spec. The architect and designer explore multiple versions of the thread + messages model, compare them, and run a design critique before settling on the message vocabulary.

**Validation scenarios.**
- Given an architect reads the new section, when they later open L7, they can answer "what does a thread carry, and what messages can live in it?" without re-reading the journey docs.
- Given the spec, when scanned, every shipping message type has at least one worked example of an initiator and an expected response.
- Given the contract is in SHARED.md, every implementation story (L7, L18, L21, L26) references it by section anchor.

**Contracts / constraints.**
- Spec-only. No code or schema changes outside docs.
- Threads attach to bets, tasks, knowledge, agents, users — never artifacts.
- No emojis.

**Effort.** S (~1d)

---

### L2 — Concept: Block primitive in markdown

**Story.** As an architect, I want one reusable block model that turns any markdown body into a styled, navigable, comment-able view — derived during ingestion, never a new on-disk dialect — so that bet pitches (L16), knowledge bodies (L23), and any future structured-prose surface inherit the same rendering, anchoring, and discussion affordances.

**Depends on.** None.

>> these blocks need to work without agents having to follow formatting or us introducing a new markdown dialect, that will fail. this block element needs to be something that we translate in when ingesting the markdown from the files watched back to the application. this concept needs further refinement by the architect

>> we do not introduce a new markdown dialect. the markdown dialect stay github dialect compatible

**Acceptance criteria.**
- A new "Block primitive" section in `docs/concept/HUMAN_INTERFACE_LAYER.md` and a long-form `docs/concept/BLOCKS.md` together define the block model: what counts as a block, how blocks are derived from a markdown file during file-watcher ingestion, how block ids stay stable across edits, and how per-block affordances (drag, comment-anchor, link-target) attach.
- The on-disk format remains GitHub-flavoured markdown. Blocks are a derived view, never a stored dialect. The architect documents this as a hard rule.
- Cross-area attachment: per-block discussion uses the L1 thread primitive; the block-anchor is the block primitive's own affordance (so consumers like L26 do not need a separate linking dependency).
- Cross-link: `improvements-work.md` #5 and `improvements-knowledge.md` #2 cite this spec.
- `bun run check` + `bun run lint` + `bun run test` all green.

**Plan calls.** This is a foundational reusable spec. The architect and designer explore multiple block-model designs (how blocks are derived, how ids are stabilised, how the gutter works), compare them, and run a design critique before settling.

**Validation scenarios.**
- Given a developer planning L16 or L23 reads BLOCKS.md, they know how a markdown file becomes a block view at ingestion time and how block ids stay stable.
- Given the spec, the on-disk-markdown invariant is stated as a hard rule.
- Given a contributor proposes a new on-disk dialect, the spec is the authority that rejects it.

**Contracts / constraints.**
- Spec-only.
- On-disk format stays GitHub-flavoured markdown.
- Blocks are shared between Work and Knowledge; Conversations does not use them — chat messages are not blocks.
- No emojis.

**Effort.** S (~1d)

---

### L3 — Concept: Cost & Tokens (no Duration) appetite model

**Story.** As an architect, I want the appetite/budget/spend model rewritten as **Cost (money) + Tokens** — explicitly NOT Duration — captured in `docs/concept/PROCESS_LAYER.md`, so that bet appetites, story caps, and session costs share one money+token grammar and "duration" never leaks into a world where wall-clock time is a poor proxy for complexity.

**Depends on.** None.

**Acceptance criteria.**
- The "Appetite / Budget / Cost" section of `docs/concept/PROCESS_LAYER.md` is rewritten so that bet appetite, task caps, and session costs are expressed in money plus tokens. There is no duration budget axis. Wall-clock duration is recorded informationally only.
- The spec defines a money type that is currency-aware and precision-safe and a token-usage type that distinguishes prompt vs completion tokens and carries a coarse model-tier signal. The exact tier names, default currency, and any numerical defaults are decided by the architect during planning — the spec records the choice and the rationale.
- A "Rationale" subsection captures the founder framing: "Does duration really matter in an AI world?" Agents work in bursts; complexity is the signal.
- The money / token-usage shapes are also added to `docs/work-packages/SHARED.md` "Shared Contracts" so L17 picks them up directly.
- `docs/concept/AGENT_LAYER.md` is updated where session cost is mentioned.
- `bun run check` + `bun run lint` + `bun run test` all green.

**Validation scenarios.**
- Given an architect plans L14 (bet actions), when they read PROCESS_LAYER, they know the consequence preview shows cost-spent vs cost-cap and tokens-used vs token-cap, NOT duration.
- Given the rationale section, when an agent later proposes a duration cap on bets, the spec rejects it with a citation.
- Given a downstream story uses money values, it imports a single shared definition rather than redefining one.

**Contracts / constraints.**
- Spec-only. Type definitions land in L17.
- Money values must not lose precision through rounding.
- Wall-clock duration is informational only, never a budget axis.
- No emojis.

**Effort.** S (~1d)

---

### L4 — Concept: Knowledge relevance signals

**Story.** As an architect, I want one model for how knowledge relevance is computed from real measurements captured in `docs/concept/KNOWLEDGE_ARCHITECTURE.md`, so that L22 implements a measurable signal — not aspiration — and so the data layer earns the v3 Knowledge journey's load-bearing rank.

**Depends on.** None.

>> getting this citation to work reliable is a core aspect, as well as tracking when access, citations and so on happen needs some deep thinking.

**Acceptance criteria.**
- The "Relevance / Attention" section of `docs/concept/KNOWLEDGE_ARCHITECTURE.md` is rewritten so that recency and frequency ship as data contracts: every knowledge item knows when it was last validated / edited / accessed, and how often it has been accessed in a recent window from server-side tracking.
- **Citation is evaluated by the architect and designer during planning.** They assess feasibility (harness contracts, reliability of agent self-reporting, access tracking) and decide whether citation ships now or stages with absent values. Don't pre-defer; evaluate. The decision and its rationale are recorded in the spec.
- The relevance composite, its inputs, and how it tunes are defined. Any numerical defaults (decay constants, weights) are chosen by the architect during planning and recorded in the spec.
- Configuration that tunes the composite lives in DB or env, never in source.
- An anti-pattern is explicitly forbidden: until citation data exists, render impact as `—`, never as a fake number. (The current per-kind impact constant in `packages/fabric/src/attention-scoring.ts` is the bug; the fix lives in L22.)
- Cross-link: `improvements-knowledge.md` #1 cites this spec.
- `bun run check` + `bun run lint` + `bun run test` all green.

**Validation scenarios.**
- Given a developer reads the spec before L22, they know access counts come from server-side tracking, not client analytics.
- Given the citation section, when an agent harness author reads it, they know either what they MUST emit (if citation ships) or that the signal is staged (with rationale).
- Given a row that has zero citations and zero accesses, the spec says the row renders impact as `—`, not `0` or a fake constant.

**Contracts / constraints.**
- Spec-only. The data contracts land in L22.
- Tunable weights live in configuration, never in source.
- No fake numbers — `—` when data is absent.
- No emojis.

**Effort.** S (~1d)

---

### L5 — Hardcoded-data inventory (research)

**Story.** As an engineer about to remove every hardcoded fixture from the running app, I want a complete inventory — every `MOCK_*` / `FALLBACK_*` constant, every fixture imported into a runtime page or component, every hardcoded count / chip / number / list / status — saved as a structured doc, so that downstream implementation stories know what they own and the final sweep (L29) has a shopping list.

**Depends on.** None.

**Acceptance criteria.**
- A new file `docs/reviews/hardcoded-data-inventory.md` lists every hardcoded data source consumed at runtime in the web package and supporting packages — explicitly NOT in test or story files. Each row records: source path:line, shape, runtime consumer, real source (API or table), proposed owner story, and notes.
- The inventory is grouped by area: Conversations, Work, Knowledge, Shell, Cross-cutting.
- Each row's "owner story" matches the right L-story; rows with no obvious owner are tagged `unassigned` for L29 to pick up.
- The inventory does NOT propose fixes — that is the impl stories' job. It is a survey.
- A column distinguishes "hardcoded fallback acceptable in" — tests, stories, and dedicated fixtures directories — from forbidden runtime use.
- `bun run check` + `bun run lint` + `bun run test` all green (docs only).

**Validation scenarios.**
- Given the inventory, when L14 starts, the developer knows exactly which fixtures to replace and where the real data lives.
- Given a row tagged `unassigned`, L29 picks it up and either schedules a follow-up or fixes it inline.
- Given the inventory is structured as markdown tables, a script or agent can grep the owner-story column.

**Contracts / constraints.**
- Research-only. No code or schema changes.
- Use absolute paths so other agents can grep.
- Be exhaustive — false negatives are worse than false positives.
- No emojis.

**Effort.** M (~2d)

---

### L6 — Thread response unblocks the agent

**Story.** As a reviewer responding to a thread, I want my response — verdict, questionnaire answer, open-question reply — to persist AND to be picked up by the agent waiting on it, so that the v3 Conversations journey "play your part in the shape the initiator chose" actually closes the loop with the agent's tool call.

**Depends on.** None.

**Acceptance criteria.**
- When the user responds to a thread, the response persists to the server, the thread state updates accordingly, and the rest of the system is notified so other clients update. Today the verdict commit is a no-op (the client-side function at `packages/web/src/pages/ConversationsReview.tsx:132` is empty); this story closes that gap.
- The response becomes an event that **unblocks the agent waiting on it (sync)** or is **recorded for the agent to consume on its next pickup (async)**. The whole point of a response is to unblock a tool call. The architect specifies the response-as-event contract that connects the thread response to the agent harness.
- Network failures surface a clear error; the response is not recorded locally as committed when the server didn't accept it.
- New Vitest tests cover response persistence (success and failure) and the agent-unblocking event being emitted with the right payload.
- A new Playwright spec covers the loop: load a thread → respond → response persists → agent-event is emitted.
- All hardcoded review-fixture access on this page is replaced with a real data fetch. The corresponding inventory row from L5 is closed.
- `bun run check` + `bun run lint` + `bun run test` all green; the full Playwright e2e suite re-runs and stays green.

**Plan calls.** This is NOT a UI auto-advance / undo story. The architect specifies the harness-side contract for how a response surfaces to the waiting agent (sync = unblocks now; async = recorded for next pickup); the designer picks any optional UI affordances around responding.

**Validation scenarios.**
- Given the user responds to a sync thread, when the request succeeds, the agent waiting on that response receives the unblock event and continues its tool call.
- Given the user responds to an async thread, when the request succeeds, the response is recorded and the agent picks it up on its next session.
- Given the network is down, when the user responds, then a clear error is shown and the response is not recorded as committed.

**Contracts / constraints.**
- Correctness first — no optimistic-UI bragging.
- Reuse the existing thread-response server endpoint where one already exists; do not re-spec.
- No emojis.

**Effort.** M (~2-3d)

---

### L7 — Promote Thread + messages primitive into shared

**Story.** As a developer wiring Conversations, Work, and Knowledge threads, I want the Thread + messages primitive from L1 implemented in shared code, the database, and the design system, so that every consumer attaches threads to the right host entity, renders rich messages inline, and reads from one shape.

>> we probably also need thread design system components.

**Depends on.** L1 (concept doc).

**Acceptance criteria.**
- The Thread + messages primitive — thread container with metadata, plain-text messages, and the rich message types defined in L1 (at minimum review and questionnaire) — is implemented in shared types, the database, and the design system. The implementation matches the L1 contract exactly.
- Threads attach to any host entity per L1 (bet, task, knowledge item, agent, user). Conversations becomes a *view* over threads, not their owner.
- Existing review/chat-only data continues to load (back-compat preserved). Message types beyond plain text are now representable.
- Page-local fixture types like the current `MockReviewItem` (`ConversationsReview.tsx:22-33`), `MockThread` (`ConversationsChat.tsx:14-32`), and `MockBetComment` array (`WorkBet.tsx:24-28`) are removed; their consumers move to the shared shape.
- The system can list threads attached to any host entity, fetch one with messages, and create a thread or post a message. The architect picks the endpoint shapes during planning.
- Vitest tests cover discriminant exhaustiveness on message types; server tests cover every shipping type round-tripping through create + read.
- Playwright e2e: at least one thread renders correctly with each shipping rich message type inline.
- All page-local mock thread types are removed; the matching inventory rows from L5 are closed.
- `bun run check` + `bun run lint` + `bun run test` all green; the full e2e suite re-runs and stays green.

**Plan calls.** This is a foundational reusable component built directly into the design system, not as a per-area component. The architect and designer take multiple passes over the thread shell, the message stream, and the rich-message inline rendering, compare designs, and run a design critique before settling. DS-quality.

**Validation scenarios.**
- Given a developer creates a questionnaire thread, when the response is read back, the message payload is preserved and the questionnaire renders inline with its constrained answers.
- Given a thread attached to a bet, when the Bet detail page mounts (after L18 lands), then the thread shows up in the bet's thread surface.
- Given a fresh database with the migration applied, then existing review-shaped data continues to load with no manual fixup.
- Given an exhaustive switch on the message-type vocabulary, the TypeScript compiler enforces every case.

**Contracts / constraints.**
- The message-type vocabulary is closed — adding a new rich type requires an L1 update first.
- Every thread carries an attachment; un-attached coach threads attach to the user themselves.
- Threads do not attach to artifacts.
- The migration is forward-only and ships with a written rollback plan.
- No emojis.

**Effort.** L (~5d)

---

### L8 — Render thread sections in Conversations Submenu

**Story.** As a reviewer landing on Conversations, I want the Submenu to show the actual list of threads, grouped sensibly, instead of static entries with hardcoded counts, so that I can pick any thread (currently only thread #1 is reachable).

**Depends on.** L7.

**Acceptance criteria.**
- The Conversations Submenu renders the full thread list from the L7 store, grouped into sections that read naturally for the user. The static entries currently in `AppShell.tsx:39-44` and the hardcoded counts at `:40-41` are removed. The exact section names, grouping rules, and sort order are designer + architect calls during planning.
- The list is fed by a real query against the L7 thread store. Selection drives a lifted selected-thread id, NOT a route navigation.
- Section counts are derived from the fetched list, not literals.
- Vitest tests cover empty list rendering, mixed list rendering, and selection driving the lifted id.
- Playwright e2e: the list of threads loads, clicking a thread updates the main pane, and count badges match list contents.
- The matching inventory rows from L5 (page-local thread mocks, hardcoded submenu counts) are closed.
- `bun run check` + `bun run lint` + `bun run test` all green; the full e2e suite stays green.

**Validation scenarios.**
- Given there are 7 threads on the server, when the page loads, the Submenu shows 7 rows grouped sensibly.
- Given the user clicks a thread, the main pane renders that thread.
- Given the network fails, the Submenu shows a clear error state, never silent collapse.

**Contracts / constraints.**
- Counts must match list length. Counts that lie are forbidden.
- No keyboard verb shortcuts on the list (founder demoted).
- No emojis.

**Effort.** M (~2-3d)

---

### L9 — Collapse review/chat to one detail route

**Story.** As a user, I want one Conversations entry point — a queue plus a single detail surface per thread — instead of two sibling routes that split the same queue by URL, so that the page adapts to whichever thread the user picked and I never pick the wrong tab before I can see what the agent wants.

**Depends on.** L7.

**Acceptance criteria.**
- Conversations is reachable via one queue plus one detail surface per thread. Legacy review/chat sibling routes redirect (preserving history), never 404.
- The detail surface renders whichever thread the user picked, with rich messages from L7 rendered inline. The architect picks the dispatch / routing shape during planning.
- Naming collisions (Conversations / Chat / Chats / chat) are resolved per the L1 spec — one canonical noun per concept.
- Vitest tests cover the dispatch and the unknown-thread fallback.
- Playwright e2e: navigate from Work → click a bet's thread → the detail surface renders that thread.
- `bun run check` + `bun run lint` + `bun run test` all green; the full e2e suite stays green.

**Uses.** L7 Thread + messages primitive.

**Validation scenarios.**
- Given a user opens a legacy route, then they redirect to the queue and the queue loads.
- Given a deep-link to an unknown thread id, then a clear "thread not found" empty state is shown — not the editable-fallback anti-pattern.

**Contracts / constraints.**
- One detail surface; no per-shape detail routes.
- Old routes redirect, never 404.
- No emojis.

**Effort.** M (~2-3d)

---

### L10 — Submenu filter chips actually filter

**Story.** As a user, when I click a filter in the Conversations Submenu, I want the thread list to actually filter — not just paint the chip selected — so I stop losing trust in controls that look like they work.

**Depends on.** L8.

**Acceptance criteria.**
- The submenu filter state (currently set but never read — see the comment at `AppShell.tsx:60-63` and the unused state at `:367-374`) is consumed by the thread list, which filters accordingly. The "filter is set but never read" bug is closed.
- The real filter axis is **blocking vs non-blocking** (= sync vs async — same axis, two names). The exact chip vocabulary is a designer + architect call during planning, resolved against that axis.
- Empty filtered states show a clear empty state with a clear-filter affordance.
- Vitest tests cover: each filter narrows correctly; clearing restores the full list.
- Playwright e2e: click a filter → list narrows → clear → list restored.
- `bun run check` + `bun run lint` + `bun run test` all green; the full e2e suite stays green.

**Validation scenarios.**
- Given threads with mixed blocking / non-blocking states, when the user picks the blocking filter, the list narrows to blocking threads.
- Given a filter with 0 matches, the list shows a clear empty state.
- Given the user clears the filter, the original list returns.

**Contracts / constraints.**
- One axis: sync = blocking, async = non-blocking. Not two axes.
- No customizable filter sets, no saved presets (founder cut).
- No emojis.

**Effort.** S (~1d)

---

### L11 — Render rich messages inline; remove the ThreadActionBar abstraction

**Story.** As a user reading a thread, I want rich messages (review with its artifact and decision affordance, questionnaire with its constrained answers) to render INLINE as part of the message stream — not as a floating top toolbar — so the actions feel like part of the conversation and the chrome doesn't lie about what's possible.

**Depends on.** L7.

**Acceptance criteria.**
- Rich messages render their affordances inline as part of the message stream. The current top header that renders verb buttons and 7 hardcoded keyboard shortcuts at `ReviewHeader.tsx:153-178` is reduced to a thin presentation header (title + sender + back-to-queue) or eliminated entirely. The keyboard shortcuts are removed. **Founder direction: "ThreadActionBar inline with the messages, not on top — it's part of the thread."**
- Review messages embed the output artifact and the decision affordance inline; questionnaire messages embed the constrained answer set inline. **There is no separate action-bar component.**
- Action invocation in a review message dispatches to L6's response-as-event path; the agent waiting on the response is unblocked.
- Vitest tests cover: each rich message type renders its inline affordance; invoking a review-message decision dispatches via L6.
- Playwright e2e: open a review thread → the artifact and decision affordance render inline → invoke the decision → response persists and unblocks the waiting agent.
- `bun run check` + `bun run lint` + `bun run test` all green; the full e2e suite stays green.

**Uses.** L7 Thread + messages primitive. Rich-message rendering ships as part of the L7 design system primitive — this story consumes and validates it on the Conversations surface.

**Validation scenarios.**
- Given a review message, when scrolled into view, then the artifact and decision affordance render inline with the message.
- Given a questionnaire message, when rendered, then the constrained answers are buttons inline with the message.
- Given the user invokes a review decision, then L6's response-as-event path commits and the waiting agent is unblocked.

**Contracts / constraints.**
- Inline placement is non-negotiable per founder. No separate action-bar component.
- No emoji reactions; pre-formatted actions only.
- No keyboard verb shortcuts.
- No emojis in code or comments.

**Effort.** M (~2-3d)

---

### L12 — Artifact view family across Work surfaces

**Story.** As any persona on Work, I want to SEE what the team's tasks have actually produced — thumbnails, preview links, latest outputs — on every Work surface that benefits, so v3 Basic 1 ("see what the agent has made") is implementable instead of structurally absent.

>> this probably also means that the artifact compoentns need to become design system components.

**Depends on.** L13.

**Acceptance criteria.**
- **Artifacts live on tasks.** Every artifact is produced by a task; no other level produces them. Higher-level surfaces (Bet detail, Product page, Portfolio gallery) aggregate artifacts from their tasks rather than owning them. The architect captures this in a concept update.
- The Artifact view family renders one artifact in different layouts: at minimum a gallery card, a stack item, a single full preview, and the embedded "output" inside a review message.
- The system can fetch artifacts filtered by task, bet, product, or portfolio in a canonical shape that includes the cost from the producing session. The architect picks the endpoint shape.
- Real artifact data is backed by persistence joined to the producing session for cost. The matching inventory rows from L5 are closed (zero hardcoded artifacts on any Work surface).
- For function-agnostic outputs (deck, contract, dashboard, code-diff, drafted email, design, etc.), the artifact card shows what's needed to recognise it; clicking opens the artifact's preview.
- Vitest tests cover: each layout renders correctly; empty states render correctly.
- Playwright e2e: open Portfolio → see the artifact aggregation → click an artifact → preview opens; open Bet detail → see the artifact aggregation; open a task → see its artifact.
- `bun run check` + `bun run lint` + `bun run test` all green; the full e2e suite stays green.

**Plan calls.** This is a foundational reusable component family. The architect and designer explore multiple versions of each layout (gallery card, stack item, single full preview, review-message embed), compare them, and run a design critique before settling. DS-quality.

**Validation scenarios.**
- Given a team has tasks that produced shipped artifacts this week, the Portfolio aggregation shows them.
- Given a bet has tasks each producing an artifact, Bet detail aggregates them with cost from each producing session.
- Given an artifact has no preview yet, a clear placeholder shows; never a fake thumbnail.

**Contracts / constraints.**
- Artifacts live on tasks. Higher views aggregate; they don't own.
- No hardcoded artifact lists on any Work surface.
- No emojis.

**Effort.** M (~3d)

---

### L13 — Add Product=Team level (drill-down hierarchy)

**Story.** As a user, I want a Product page (Portfolio → Product → Bet → Task → Session-jump-out) that is a drill-down from a clicked product card on Portfolio, so the v3 hierarchy is implemented and so I can see one team's work without the Team Board collapsing Product+Bet into one smear. **Founder direction: "Team and Product are 1:1 — that's the same. It's a product team. The rest applies but it should be a drill-down not a side navigation."**

**Depends on.** None.

**Acceptance criteria.**
- The 5-level hierarchy is captured in the concept docs: **portfolio > product > bet > task > session.** Product = Team (1:1).
- A Product page exists and is reachable by clicking a product card on Portfolio. The page shows what a team page should show — the team roster, active bets, team burn vs cap, and (after L12 lands) the team's artifact aggregation. The exact layout is a designer call during planning.
- Navigation is a drill-DOWN from Portfolio. It is NOT a side navigation tree.
- The previous denormalized team route is removed; legacy links redirect to a sensible fallback.
- The system serves real product, roster, and bets data; the matching inventory rows from L5 are closed.
- Vitest unit tests cover the dispatch.
- Playwright e2e: from Portfolio, click a product card → the product page renders → roster and bets are visible.
- `bun run check` + `bun run lint` + `bun run test` all green; the full e2e suite stays green.

**Validation scenarios.**
- Given a user clicks a product card on Portfolio, the URL becomes that product's page and that team's roster, active bets, and burn show.
- Given a product has no active bets, the page shows a clear empty state, not a fallback fake bet.

**Contracts / constraints.**
- Product = Team. Do not introduce a separate "team" entity.
- Drill-down only — no parallel side navigation.
- No emojis.

**Effort.** L (~5d)

---

### L14 — The user can act on a bet

**Story.** As a user on a Bet detail surface, I want first-class affordances to act on a bet — pause it, stop it, adjust its appetite, comment on it to unblock — with a consequence preview before any destructive action commits, so I can act at the bet level (per v3 task-ownership rule: "humans act at the bet level, not the task level") without surprise.

**Depends on.** L3.

**Acceptance criteria.**
- The user can act on a bet. Exactly which acts ship and how they're surfaced is a designer + architect call during planning, with simplicity as the bias. The v2 enumeration ("downvote" never made sense) is dropped; the architect picks the minimum set that lets a user pause, stop, change appetite, and unblock.
- Any destructive action is preceded by a **consequence preview** that tells the user what stops, what continues, and what's saved before they confirm. The preview is non-skippable.
- Adjust-appetite uses the L3 Cost+Tokens model. There is no duration field.
- Every bet-level action is recorded in a revision log capturing the action, who did it, when, and why.
- Bet status vocabulary supports the states the chosen acts produce.
- All hardcoded BetCard fixtures are replaced with real data; the matching inventory rows from L5 are closed.
- Vitest tests cover each shipping action's local handler and server response shape.
- Playwright e2e: open Bet detail → invoke a destructive action → consequence preview appears → confirm → bet transitions → revision log shows the entry.
- `bun run check` + `bun run lint` + `bun run test` all green; the full e2e suite stays green.

**Validation scenarios.**
- Given a running bet, when the user invokes a destructive act, the consequence preview shows what will happen and requires confirm.
- Given the user adjusts appetite, the bet's money cap updates and the revision log records the change.
- Given the user comments to unblock, the comment surfaces in the bet's thread (from L18) for the assigned agent to read.

**Contracts / constraints.**
- The consequence preview is non-skippable for destructive acts.
- Adjust-appetite uses L3 types — never duration.
- No keyboard shortcuts (founder demoted).
- No emojis.

**Effort.** L (~4-5d)

---

### L15 — Strip drag/drop from Kanban; let humans request task changes

**Story.** As a user on the Team Board, I want drag/drop on tasks REMOVED (per v3: tasks are agent-team-owned, humans don't move them) but I still want a way to request that a task change state, OR to start a thread with the agent working on the task to unblock / stop / clarify, so I can interact at the task level without violating ownership. **Founder direction: "There should still be a way for a user to request the item to change state or start a thread with the agent working on the item to unblock or stop or whatever is necessary."**

**Depends on.** L7.

**Acceptance criteria.**
- Drag-to-move is removed from the Team Board's Kanban: dragging a task is a no-op. The current sensors and column-to-state mapping in `Kanban.tsx` and the move-task handler at `WorkTeam.tsx:116-120` are gone.
- Each task gains an affordance to request a state change OR open the task's attached thread (from L18). Selecting a request posts a message to the task's thread — the AGENT decides whether to honor it; humans request, never command. The exact affordance shape is a designer call during planning.
- Drag survives ONLY between Shaped → Committed columns on the Canvas (that IS a human-owned move, per Shape Up shaping). Everywhere else, drag is removed.
- Vitest tests cover: drag is a no-op on task cards; request actions post messages to the right thread; opening a thread lifts it correctly.
- Playwright e2e: try to drag a task → no-op → request a state change → message appears in the task's thread.
- `bun run check` + `bun run lint` + `bun run test` all green; the full e2e suite stays green.

**Uses.** L7 Thread + messages primitive.

**Validation scenarios.**
- Given a user attempts to drag a task, the action does nothing.
- Given the user requests a state change, a thread message appears on the task's thread capturing the request.
- Given the user opens a task's thread, the thread renders.

**Contracts / constraints.**
- Tasks are agent-team-owned. Humans request; agents decide.
- Drag survives only Shaped → Committed (Shape Up shaping).
- No emojis.

**Effort.** M (~3d)

---

### L16 — Render bet pitch as blocks-in-markdown

**Story.** As a user reading a bet pitch, I want it rendered as proper structured prose — not as raw `<pre>` text — so I can read it like prose and so per-block discussion has the structural anchor it needs.

**Depends on.** L2.

**Acceptance criteria.**
- The bet pitch renders as styled, structured markdown blocks. The current `<pre>` fallback at `WorkBet.tsx:262-267` is replaced with the L2 block primitive view.
- Block ids are stable per L2.
- Hardcoded pitch fixture strings remain ONLY in stories and tests — runtime data comes from persisted pitch content. The matching inventory row from L5 is closed.
- Vitest tests cover: round-trip is lossless for supported block types; block ids are stable across re-parse with identical content; editing one block leaves others unchanged.
- Playwright e2e: open a bet → pitch renders as styled markdown (no `#` symbols visible).
- `bun run check` + `bun run lint` + `bun run test` all green; the full e2e suite stays green.

**Uses.** L2 Block primitive.

**Validation scenarios.**
- Given a pitch with `# Problem`, then the rendered page shows a styled heading, never literal `#`.
- Given two parses of the same pitch, the block ids are identical.
- Given a pitch is edited and one block changes, OTHER block ids are unchanged.

**Contracts / constraints.**
- The on-disk format remains valid markdown (per L2).
- No customizable block kits (founder filter).
- No emojis.

**Effort.** S (~2d)

---

### L17 — Cost + Tokens wired into Work (and the harness contract)

**Story.** As a user, I want every Work surface that shows cost to show it in money AND tokens — never strings, never duration as a budget — so v3 Basic 3 ("see what it's costing") is implementable at every level.

**Depends on.** L3.

**Acceptance criteria.**
- Bets, tasks, and sessions carry cost (in money) and token usage (broken down by tier), per L3. Money values do not lose precision through rounding.
- Existing string-typed cost (e.g., the rail's `MOCK_RAIL_COST.todaySpend = "$12.40"`, a bet's `appetite = "2 weeks"`) is replaced everywhere with the structured types — in shared, in the server, and in the database. Any duration field that pretended to be a budget is removed.
- Money rendering is consistent across the app via a single shared formatter.
- **Harness-integration is the load-bearing technical work.** Tokens come basically free from the model; reliable money reporting requires the architect to resolve the contract by which each agent harness reports the cost of its sessions. The plan must produce the harness-side contract and an end-to-end path from harness session completion → recorded money cost on the session row. This is the hard part of the story, not the UI.
- Server endpoints are updated; existing rows are backfilled with sensible defaults.
- Vitest tests cover the formatter and conversion helpers.
- Playwright e2e: open Bet detail → see cost in money + tokens, no string-money anywhere.
- All hardcoded cost strings are replaced; matching inventory rows from L5 are closed.
- A type-level guard prevents new string-typed money from being introduced going forward.
- `bun run check` + `bun run lint` + `bun run test` all green; the full e2e suite stays green.

**Plan calls.** **Founder direction: ship money + tokens.** Tokens come ~free; money is hard because of harness integration. The architect specifies the harness-side cost-reporting contract during planning.

**Validation scenarios.**
- Given a bet's appetite is set as a money cap with an optional token cap, the bet header reflects spend vs cap in both axes.
- Given a session completes in a harness, the harness reports its cost via the contract and the session row records money + tokens.
- Given a session ran for 30 minutes with high token use, the UI emphasises tokens; duration is informational only.

**Contracts / constraints.**
- Money values must not lose precision through rounding. Currency is carried with the value.
- Duration is informational ONLY.
- Tokens carry a model-tier signal.
- No emojis.

**Effort.** M (~3-4d)

---

### L18 — Thread primitive attached to bets, tasks, knowledge

**Story.** As a user on Bet detail, Task detail, or a Knowledge entry, I want an attached thread surface where localized discussion lives with the work, per the founder's "threads are a theme across the entire app".

**Depends on.** L7, L16.

**Acceptance criteria.**
- An attached-thread surface is mounted on Bet detail, Task detail (when shipped), and Knowledge entries. It uses L7's Thread + messages primitive — there is no parallel comment table.
- **Threads do NOT attach to artifacts.** Artifact discussion lives on the producing task (founder pushed back: artifacts live on tasks; the discussion belongs on the task). The architect ensures the surface for an artifact is the task that produced it.
- The Bet detail's previous comment fixture (already removed in L7) is now backed by a real thread fetched by attachment. The Task detail "open thread" affordance from L15 opens the same primitive.
- Block-anchored discussion uses the L2 block primitive's own anchor affordance — no separate linking dependency.
- Vitest tests cover: thread surface lifecycle, posting a message on a bet, posting a message anchored to a block.
- Playwright e2e: open Bet detail → thread surface shows the bet's thread → post a comment → reload → message persists.
- No hardcoded comments anywhere; matching inventory rows from L5 are closed.
- `bun run check` + `bun run lint` + `bun run test` all green; the full e2e suite stays green.

**Uses.** L7 Thread + messages primitive; L2 Block primitive (for block anchors).

**Validation scenarios.**
- Given a bet with attached thread messages, the surface shows them in the right order.
- Given a task is unblocked via a thread message, the agent's next session reads it via the thread (L6 contract).
- Given an artifact, discussion of that artifact happens on the producing task — not on the artifact.

**Contracts / constraints.**
- Use L7's Thread + messages primitive — no parallel comment entity.
- Threads attach to bets, tasks, knowledge — never artifacts.
- No emojis.

**Effort.** M (~3d)

---

### L19 — Harness jump-out from session metadata

**Story.** As a CTO-tier user wanting to inspect what an agent actually did, I want an "open in harness" affordance from a task or session, so I can pop into the agent harness for the deep view, while HyperIdle continues to NOT render the session interior (per v3: session is delegated to the harness).

**Depends on.** None.

**Acceptance criteria.**
- Tasks and the bet-detail task list know about the latest session for each task: which harness produced it, the harness URL, the cost in money, the tokens used, and the outcome.
- A jump-out affordance is rendered when a latest session exists. Clicking it opens the harness URL. The URL is treated as opaque to HyperIdle — stored and displayed, never parsed. The exact affordance shape and where it opens is a designer call.
- An outcome chip on the task reflects the latest session outcome.
- The system can return the latest session for a task. The architect picks the endpoint shape.
- All hardcoded session data is replaced; matching inventory rows from L5 are closed.
- Vitest tests cover: jump-out visibility (only when a latest session exists), outcome-chip mapping.
- Playwright e2e: open Bet detail → tasks show outcome chips → invoke jump-out → harness URL opens.
- `bun run check` + `bun run lint` + `bun run test` all green; the full e2e suite stays green.

**Validation scenarios.**
- Given a task with a completed session, the jump-out is reachable and links to the harness URL.
- Given a task with no session yet, the jump-out is hidden.
- Given the harness URL is malformed, the affordance is hidden — defensive, never broken-link.

**Contracts / constraints.**
- HyperIdle does NOT render the session interior.
- Harness URL is opaque — HyperIdle stores and displays, never parses.
- No emojis.

**Effort.** S (~1-2d)

---

### L20 — Lifecycle propagation across the 5 levels

**Story.** As an operator, I want lifecycle events to propagate up the 5-level hierarchy (portfolio > product > bet > task > session) without me filing them by hand — a session can start or end a task, a finished task can close a bet, a bet closing affects the product, a product closing affects the portfolio — so the system reflects what's actually happening below.

>> we don't have cycles in our concept. Our system is more like a kanban system, its done when its done and we limit the amount that is in progress to create sparsity.

**Depends on.** L14, L17.

**Acceptance criteria.**
- The architect specifies the **lifecycle propagation rules** in a concept-doc update (extending PROCESS_LAYER.md or adding a dedicated propagation concept doc): which transitions at level N affect level N+1, which are automatic, and which require human confirmation. Designer + architect decide the automatic-vs-confirm split during planning, with simplicity as the bias.
- The data layer implements the rules: when a session ends, its task reflects the change; when a task finishes, its bet reflects the change; when a bet closes, its product reflects the change; when a product closes, the portfolio reflects the change.
- Failed propagations are logged and retried; nothing is silently dropped.
- The user observes propagation through whichever surface the designer + architect choose during planning. Cycles UI is NOT introduced (founder cut).
- Vitest tests cover each level's propagation rule.
- Playwright e2e: simulate a task finish that closes a bet → the product surface reflects it without manual filing.
- `bun run check` + `bun run lint` + `bun run test` all green; the full e2e suite stays green.

**Validation scenarios.**
- Given a session ends and its task is the last open task on a bet, the bet's lifecycle reflects the closure (automatically or after a confirmation, per the spec).
- Given a bet closes, the product surface reflects the change.
- Given a propagation fails, the failure is logged and retried; the level above is never silently out of sync.

**Contracts / constraints.**
- Five levels: portfolio > product > bet > task > session. No cycles UI, no sprint planning.
- The propagation rules live in the concept docs; the data layer implements them.
- No emojis.

**Effort.** M (~3d)

---

### L21 — CoC create-on-the-fly (bottom-right rail overlay)

**Story.** As a user anywhere in HyperIdle, I want a Chief of Staff button at the bottom-right of the rail; clicking opens an overlay thread where I can ask anything; I can add visible items as context to that thread; the CoC responds without pulling product agents off their work. **Founder direction: "The button to start a thread with the COC could just be bottom right in the rail and it overlays a thread and somehow we can add anything as context to that thread. That would really be your assistant in the company."**

**Depends on.** L7.

**Acceptance criteria.**
- A Chief-of-Staff trigger is rendered at the bottom-right of the Rail and is visible on every Work / Conversations / Knowledge view.
- Clicking the trigger opens an overlay thread (chatbox-style) that keeps the underlying view visible — that visibility is the "add as context" affordance.
- The overlay uses L7's Thread + messages primitive in a coach configuration, attached to the user themselves. Never attached to a bet or task — that's the "doesn't pull agents off work" part.
- An "add as context" affordance lets the user attach visible items (bet card, task row, artifact, knowledge entry, message) to the next CoC message. The exact mechanic and the small-viewport experience are designer + architect calls during planning.
- The CoC response persists for-the-record as a coach thread in Conversations; the user can promote any answer to Knowledge later (cross-area follow-up — out of scope here).
- The system can initiate a CoC session and persist its messages, including the attached context references. The architect picks the endpoint shape.
- Vitest tests cover: trigger renders, overlay opens, context attaches.
- Playwright e2e: from any surface, invoke CoC → overlay opens → add a bet as context → ask a question → response renders → close → the thread persists in Conversations.
- `bun run check` + `bun run lint` + `bun run test` all green; the full e2e suite stays green.

**Uses.** L7 Thread + messages primitive (coach configuration).

**Validation scenarios.**
- Given the user is on any page, the CoC trigger is visible at the bottom-right of the Rail.
- Given the user adds a bet as context, the next message includes the reference.
- Given the user closes the overlay, the thread persists in Conversations and can be reopened.

**Contracts / constraints.**
- Bottom-right placement is non-negotiable per founder.
- No keyboard shortcut to invoke CoC (founder demoted keyboard idioms).
- CoC threads are user-attached, never bet/task-attached.
- No emojis.

**Effort.** M (~3-4d)

---

### L22 — Three relevance signals as first-class data

**Story.** As a user on Knowledge, I want recency, frequency, and (where feasible) impact as real signals on every row — not one opaque attention score and a hand-templated whyNow — so v3 Knowledge Basic 1 ("surface the most relevant items") rests on data, not aspiration.

**Depends on.** L4.

**Acceptance criteria.**
- Every knowledge item knows when it was last validated, last edited, and last accessed; how often it has been accessed in a recent window from server-side tracking. The fabric's attention scoring (`packages/fabric/src/attention-scoring.ts`) is rewritten so frequency comes from real access tracking. The current per-kind impact constant is deleted.
- **Citation: ship if the L4 evaluation says it's feasible; otherwise stage with absent values per L4's anti-pattern rule.** When citation ships, the agent harness contract emits cited knowledge ids on session completion and the server records them. When staged, the impact column renders `—` until data exists.
- The composite relevance score uses L4's formula with weights tunable from configuration.
- Each row renders the available signals; absent signals render `—`, never a fake number.
- Sort selection is reflected in URL state.
- Vitest tests cover the composite math and the fake-zero guard.
- Playwright e2e: open Knowledge → row signals visible → sort changes → list re-orders.
- All hardcoded attention-score / whyNow strings are removed; matching inventory rows from L5 are closed.
- `bun run check` + `bun run lint` + `bun run test` all green; the full e2e suite stays green.

**Validation scenarios.**
- Given an item with zero data on a signal, that signal reads `—`.
- Given fresh-validated and stale items, sorting by recency surfaces the fresh one.
- Given the user changes sort, the URL reflects it.

**Contracts / constraints.**
- No fake numbers — always `—` until data exists.
- No customizable saved views (founder cut).
- No emojis.

**Effort.** L (~5d)

---

### L23 — Blocks-in-markdown body renderer (Knowledge)

**Story.** As a user reading a knowledge item, I want the body rendered as proper structured prose — not a single `<pre>` rectangle — so a 3-sentence belief and a multi-section playbook don't share the same grey box.

>> see again that pre thing does not sound like a sound concept. but yeah we need to render what ever the structure is in a nice looking UI.

**Depends on.** L2.

**Acceptance criteria.**
- The knowledge detail body renders as styled, structured markdown blocks. The current `<pre>` block at `KnowledgeDetail.tsx:301-307` is gone.
- Block ids are stable per L2.
- The on-disk format remains valid markdown — bodies in persistence stay text, never JSON.
- Vitest tests cover: round-trip is lossless on supported types; block-id stability holds.
- Playwright e2e: open a Knowledge entry with a multi-section body → see styled rendering.
- Hardcoded legacy detail text is removed; bodies come from the data layer; matching inventory rows from L5 are closed.
- `bun run check` + `bun run lint` + `bun run test` all green; the full e2e suite stays green.

**Uses.** L2 Block primitive.

**Validation scenarios.**
- Given a 3-sentence belief, the page renders 3 paragraphs with no chrome.
- Given a 5-section playbook, the page renders with proper heading hierarchy.
- Given an edit changes only one section, the OTHER section block ids are unchanged.

**Contracts / constraints.**
- Reuse the L2 block primitive — single primitive across Work and Knowledge.
- No customizable view kits.
- No emojis.

**Effort.** M (~2-3d)

---

### L24 — Linking primitive (deferred out of this track)

**Story.** As a user reading a knowledge item, I would like `[[id]]`-style references to render as inline chips with hover preview and a backlinks panel under the body — but at today's corpus scale this isn't journey-critical, so we defer.

**Depends on.** L23.

**Status: deferred.** This story does not ship in Track L. The decision is documented here so the manifest stays stable and the dependency graph is preserved. Re-spec when the corpus grows enough that linking + backlinks become journey-critical (likely once Knowledge crosses ~50 entries with cross-references emerging organically). At that point, the story should be re-evaluated with the v3 framings (block primitive ownership, thread primitive for discussion, no per-block linking dependencies that L26 needs).

**Acceptance criteria.** None for this track. The story exists in the manifest as a deliberate deferral marker.

**Validation scenarios.** N/A.

**Contracts / constraints.**
- L26 is independent of L24. Per-block discussion uses the L7 thread primitive; the block-anchor is L2's own affordance.
- When this story is unparked, it MUST not pre-empt the L2 block-anchor or the L7 thread surface.

**Effort.** N/A in this track.

---

### L25 — Knowledge-item actions: manage vs edit

**Story.** As a user on a knowledge detail page, I want two distinct journeys — manage the item (review-like: approve, refine, deprecate) AND edit the body (must actually persist; today's Save lies) — so the v3 continuity loop ("capture → review → refine → deprecate") actually exists in the UI.

**Depends on.** None.

**Acceptance criteria.**
- **Manage journey.** The user can act on a knowledge item — what acting means (approve / refine / deprecate, etc.) is for the designer + architect to choose with simplicity as the bias. One or two manage-verbs ship now; more follow when there's a journey for them. "Promote" is dropped (founder: meaningless here). Merge / split are dropped (founder: no value yet). Each shipping verb persists to the server and writes an edit-log entry capturing the action, who, when, and why. Destructive actions require explicit confirmation.
- **Edit journey.** Save in edit mode actually persists. The current "Save doesn't persist" lore is closed; reloading shows the saved version. Optimistic locking prevents silent overwrites under concurrent edit.
- Vitest tests cover: each shipping action → persistence → log entry; save round-trip; concurrent edit detection.
- Playwright e2e: open a knowledge item → invoke a manage verb → confirmation → status changes → log shows the entry; edit body → save → reload → version persists.
- The matching inventory rows from L5 are closed.
- `bun run check` + `bun run lint` + `bun run test` all green; the full e2e suite stays green.

**Validation scenarios.**
- Given the user clicks Save in edit mode, the body persists; reloading shows the saved version.
- Given the user invokes a destructive manage verb, confirmation is required and the log records the action.
- Given two users edit concurrently, the second save is rejected by the optimistic lock with a clear message.

**Contracts / constraints.**
- Optimistic locking on Save — no last-writer-wins silent overwrite.
- Destructive actions require explicit confirm.
- Drop "promote" / "merge" / "split" until there's a journey for them.
- No emojis.

**Effort.** M (~3d)

---

### L26 — Per-block discussion on Knowledge

**Story.** As a user wanting to leave a note for the practice lead on a specific paragraph of a knowledge entry, I want to attach a discussion to a knowledge entry — and, where the entry is long enough to want it, attached to a specific block — using the same thread primitive as the rest of the app.

**Depends on.** L7, L23.

**Acceptance criteria.**
- A discussion surface attaches to each knowledge entry, using L7's Thread + messages primitive. No parallel comment table.
- For long entries, the user can scope a thread message to a specific block. **The block-anchor is the L2 Block primitive's own affordance** — this story does NOT depend on a linking primitive (L24) and must not re-introduce that dependency.
- When a block is edited away, anchored messages are preserved with a "block deleted" indicator.
- The previous read-only Observation Log is replaced with the L7 thread surface.
- Vitest tests cover: hover anchor renders, click opens correct thread, block anchor preserved, block-deleted indicator surfaces.
- Playwright e2e: hover a paragraph → invoke discussion anchor → thread opens scoped to that block → post a message → reload → message persists.
- The previous mock observations are removed; matching inventory rows from L5 are closed.
- `bun run check` + `bun run lint` + `bun run test` all green; the full e2e suite stays green.

**Uses.** L7 Thread + messages primitive; L2 Block primitive (block-anchor is L2's own affordance — independent of L24).

**Validation scenarios.**
- Given a block has anchored discussion, the count and surface render.
- Given the user removes a block, anchored messages are preserved with a clear indicator.
- Given an item-level thread (no block anchor), it appears as general discussion.

**Contracts / constraints.**
- Use L7's Thread + messages primitive — no parallel knowledge-comment entity.
- The block-anchor comes from L2 — not from L24.
- No emojis.

**Effort.** L (~4d)

---

### L27 — Knowledge-lifecycle status (not Work-status chips)

**Story.** As a user on Knowledge, I want chips that reflect the knowledge lifecycle (captured / provisional / validated / active / stale / archived) — NOT the Work-borrowed HEALTHY / BEHIND / BLOCKED / ERROR framing — so a knowledge item never displays as ERROR or DONE.

**Depends on.** None.

**Acceptance criteria.**
- Knowledge items render their lifecycle states using a Knowledge-specific chip vocabulary, not the Work status vocabulary. The mapping that borrows Work statuses for knowledge (currently in `KnowledgeRow.tsx`) is deleted. The visual treatment is a designer call during planning.
- Any other consumer of the misleading mapping is updated; the mapping itself is removed.
- Vitest tests cover: each lifecycle state renders its correct chip; old Work-status colors never appear on knowledge.
- Playwright e2e: open Knowledge → no Work-status chips on knowledge items.
- The visual-regression baseline is updated for the affected rows in a separate, labeled commit.
- The matching inventory row from L5 is closed.
- `bun run check` + `bun run lint` + `bun run test` all green; the full e2e suite stays green.

**Validation scenarios.**
- Given a `pattern` knowledge item, the chip reads a knowledge-lifecycle state — never ERROR.
- Given an archived item, the chip reads "archived" — never DONE.
- Given the visual-regression run, the Knowledge list is re-baselined cleanly.

**Contracts / constraints.**
- No reuse of the Work status chip on Knowledge.
- No emojis.

**Effort.** S (~1-2d)

---

### L28 — Knowledge shape differentiation (layered, not orthogonal)

**Story.** As a user scanning Knowledge, I want different kinds of knowledge to look different — not pixel-identical — so a CTO scanning decisions can find decisions and a grandma reading a belief sees only what fits a belief.

>> again these are not orthogonal categories, a table and a decision live on different levels. what specifically is necessary has to be decided as part of the story by the architect and designer. it needs to make sense for the user and the content not a random colllection

**Depends on.** None.

**Acceptance criteria.**
- **The architect and designer have produced a layered shape model that reads naturally for the user and the content; the result is recorded as a concept update in `docs/concept/KNOWLEDGE_ARCHITECTURE.md`.** The kinds (decision / belief / pattern / brief) and the representations (table / graph / doc-tree) live on different levels — they are NOT six orthogonal shapes. The concept update resolves the right axis.
- The detail surface dispatches per the resolved shape model. Each shape's body composes the L23 block primitive internally — blocks compose all shapes.
- Knowledge rows differentiate per the shape model on whatever line carries differentiating content.
- The system returns the typed shape for a knowledge item. The architect picks the endpoint shape.
- Vitest tests cover: each shape → correct body renders.
- Playwright e2e: navigate through one of each shape → each renders distinctly.
- A shape that's not yet implemented shows a clear "shape under construction" body — never an empty page.
- `bun run check` + `bun run lint` + `bun run test` all green; the full e2e suite stays green.

**Plan calls.** Designer + architect concept this as part of the story; explore multiple variants of the shape model; resolve the right axis. Don't pre-decide.

**Validation scenarios.**
- Given the resolved shape model, the concept doc carries the rationale.
- Given a knowledge item of each shape, its row and detail render distinctly.
- Given a shape not yet implemented, a clear "under construction" body shows; never an empty page.

**Contracts / constraints.**
- The shape model is closed once the concept update lands. Adding a new shape requires another concept update.
- Per-shape rendering uses the L23 block primitive inside each body.
- No emojis.

**Effort.** M (~3d)

---

### L29 — Final sweep: hardcoded data + test coverage gap

**Story.** As a maintainer, I want a final pass that closes any remaining hardcoded-data inventory rows from L5, AND I want a deep look at why our test/e2e suite passed even with hardcoded UI data — closing the structural test-coverage gap with new tests that would have caught it — so that we leave Track L with real data flowing through real APIs and a test suite that proves it.

**Depends on.** L5, L6, L7, L8, L9, L10, L11, L12, L13, L14, L15, L16, L17, L18, L19, L20, L21, L22, L23, L24, L25, L26, L27, L28.

**Acceptance criteria.**
- Every row in `docs/reviews/hardcoded-data-inventory.md` (L5) is re-walked. For each row, mark `closed-by: <story>` or `unassigned`. Every `unassigned` row gets either a fix in this story or a recorded follow-up entry in `docs/reviews/post-L29-followups.md`.
- A guard forbids importing fixtures into runtime code. The exact mechanism (lint rule, meta-test, or both) is the architect's call during planning, with the constraint that violations fail CI with a clear message.
- A **test-coverage gap analysis deliverable** lives at `docs/reviews/test-coverage-gap-L29.md`. It explains, with concrete examples, why existing tests passed despite the hardcoded data (e.g., tests imported the same fixtures as runtime; tests stubbed the API but never asserted it was called) and lists the structural test-pattern weaknesses with remediation.
- New end-to-end tests that would have caught the most painful previously-hidden bugs are added. Designer + architect decide which gaps the new tests close, with the constraint that the test set must demonstrably fail when run against the pre-L1 codebase (proving they would have caught the regressions).
- All `bun run test` and Playwright e2e suites green. CI rejects any new fixture import into runtime code.
- `bun run check` + `bun run lint` + `bun run test` all green; the full Playwright e2e suite stays green.

**Validation scenarios.**
- Given an engineer adds a `MOCK_*` constant to a runtime page, the guard fails the build with a clear message.
- Given the inventory, every row is either `closed-by: L<n>` or has a tracked follow-up.
- Given the gap-analysis doc, when read, it explicitly enumerates the structural weaknesses with concrete examples.
- Given the new tests run against the pre-L1 codebase, they fail.

**Contracts / constraints.**
- The guard is non-bypassable; an explicit override requires a tracking issue in the message.
- Hardcoded data is OK in tests and stories; it is NOT OK in any runtime page or component.
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

- L6 (response unblocks the agent) is independent — earliest impl story.
- L7 (Thread + messages primitive) gates Conversations + cross-area thread work (L8, L9, L11, L15, L18, L21, L26).
- L13 (Product level) gates L12 (artifact view family) because the gallery aggregates from product teams.
- L14 + L17 gate L20 (lifecycle propagation needs cost model + bet actions).
- L23 (Knowledge blocks) gates L26 (per-block discussion via L2's anchor). L24 is deferred and ships nothing in this track.
- L29 (final sweep) is the closer — depends on L5 + every impl story.

Stories that have **no Track-L dependencies** and can be picked up early once specs land:
L6, L13, L19, L25, L27, L28.

---
