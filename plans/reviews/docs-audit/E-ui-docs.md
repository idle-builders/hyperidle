# Audit E — UI docs (HIL, IA, blocks, ui-design)

Scope: 26 files, 1786 lines. Checked against origin/main code in the worktree.

## Facts that break many pages at once

- **`framework/design-system/` is gone.** Only a leftover `node_modules` dir is there, and `git ls-files` returns nothing for it. The design system now lives in `layers/core-ui/src/ds/` (see `.claude/rules/design-system.md`). There is no `DESIGN.md`, `PRINCIPLES.md` or `AESTHETICS.md`. `tokens.css` is at `layers/core-ui/src/ds/tokens.css`.
- **`framework/block-derivation/` and `framework/domain-model/src/blocks/` are gone.** Blocks now live in `layers/core-ui/src/block/` (`types.ts`, `derive-blocks.ts`, `block-id.ts`, `normalise.ts`, `derive-payloads.ts`), about 980 lines. See the lore at `block/types.ts:5-6`.
- **`framework/conversation-parts/` is gone.** The Part model is at `layers/core-ui/src/components/parts/part.ts`.
- **`BlockRef` (inline block reference) was removed.** `InlineRef = EntityRef | MentionRef | CanvasArtifactRef` (`framework/domain-model/src/thread.ts:179`). The lore at `layers/core-ui/src/contexts/AssistantContext.tsx:20` says a block id rots when the source is edited, so attaching now copies the block's text into a new document. `BlockRefEmbed.tsx` and `useBlockResolution.ts` don't exist.
- **Thread `HOST_KINDS` = `document | agent | user | team | factory`** (`thread.ts:35`). There is no `task` and no `artifact`. There are also two different `BlockHostKind` lists: `core-ui/src/block/types.ts:24` (task, document, artifact, agent, user) and `domain-model/src/thread.ts:27` (task, document, agent, user).
- **Dial-in was removed** (`layers/core-ui/src/pages/Conversations.tsx:27-31`). `SessionActivityPanel.tsx` doesn't exist. Sessions open from the task page (`WorkTaskPage.tsx:932-950`).
- **`/settings` is a real route** (`router.tsx:105`). It is not an overlay or a redirect. `settingsOpen` is worked out from the URL (`AppShell.tsx:313-316`). The body max width is 720px (`SettingsPage.tsx:50`), not 680.
- **There is no `/artifacts/:id` route and no `artifact` open route.** `OpenTarget.route` is one of `host | review | session` (`components/parts/part.ts:217-234`, `services/open-handler.ts`). There is no `bet` case in `host-route.ts`, and `task` resolves to `/work/task/:id`.
- **`riskTier` does not exist.** The only mention is a comment about a deleted table (`framework/db/src/schema.ts:228`) plus dropped migrations. The approval rate exists (`layers/core-api/policy/src/approval-rate.ts`). It uses a hardcoded 30-day window (`layers/core-api/src/actions/compose.ts:394`) and there is no `trust_window_days` setting. `AgentProfile.tsx:538` shows it.
- **Task bodies are not rendered as Blocks.** `WorkTaskPage.tsx` never calls `deriveBlocks`, and `WorkTask.tsx` doesn't exist. `deriveBlocks` is only used by `DocumentBody.tsx`, `review-canvas.tsx`, `ReviewRenderedInContext.tsx` and `ImagePayload.tsx`.
- **The Knowledge triage badge is not rendered.** `Sidebar.tsx:803` passes `badgeCount` only for conversations. The Conversations "blocking" badge actually counts threads with an unresolved review (`AppShell.tsx:650-656`). `ThreadItem.blocking` is hard-coded `false` (`AppShell.tsx:90`). `isBlocking` is only called in `ds/ThreadShell.tsx:286`.
- **The lint rules exist** in `tools/eslint-plugin-design/src/rules/` (36 rules). Severity is set in `hearth-config.ts`. The hard design rules are already written in `.claude/rules/aesthetic-quality.md` (AQ-xxx), `.claude/rules/design-system.md` and `.claude/rules/frontend.md`. `docs/ui-design` restates many of them.

---

## docs/human-interface-layer/

### index.md (14): REWRITE (or delete with the folder)
- False: line 10 says "trust-gating surface (approval-rate × riskTier)". There is no riskTier and no gating.
- False: line 8 says "AM1/AM3 vocabulary". That is a work-item id, which the docs rules forbid.

### overview.md (70): MERGE→interface/overview.md (keep about 20 lines)
- False: :16 and :316 say "a single app shell with three views". There are four sidebar destinations: Notifications, Conversations, Work, Knowledge (`Sidebar.tsx:4`).
- False: :55 says "The WorkTeam summary strip shows capacity". Capacity is gone (`WorkTeam.tsx:325`).
- False: :43 links `architecture/run-unit-model.md`. That model has no code.
- Stale: :45 "OTEL planned" is a plan, which docs should not contain.
- Stale: :70 "structure via topics … catalogue with Triage/Curated". Topics are gone; Knowledge is a tree.
- Stale: :56 and :59 "the gate … is being rebuilt; no document describes…". This is a note about the future.
- Trim: the "rejected alternatives" history (:11-14), the anti-pattern list (:61-70), the delivery posture (a duplicate of `architecture/system-overview`), and the harness list (a duplicate of agent-layer).
- Keep: one app, one grammar; the human answers every review; the approval rate is a track record, not a gate.

### the-three-views.md (62): MERGE→interface/overview.md (keep about 25 lines)
- False: :28 describes session dial-in, the `D` key and `SessionActivityPanel`. All removed.
- False: :24 and :26 say "Blocking … sorts first" and "Blocking / Unread" filtering. The list is flat by lastActiveAt (`Conversations.tsx:661` `groupBySection={false}`), and blocking is always false.
- False: :30 mentions "the five `ArtifactView` shapes". Deleted.
- False: :38 says tasks are agent-owned and "Humans request state changes through the thread". `WorkTaskPage` has a State select in its edit panel (`WorkTaskPage.tsx:655`), and `edit_task` has no gate.
- False: :52 "counters built in: facilitator attention scoring … topics as the browsable mid-level". Attention scoring and topics are both gone. This contradicts :46 on the same page.
- False: :34 cites `(WorkOverview.tsx, AD9)`. Work-item id.
- Trim: the "most critical view to get right" sermon (:42) and the 15-second decidability essay (move one line to overview).
- Missing: the Notifications/inbox destination as a fourth sidebar entry.

### thread-primitive.md (91): MERGE→interface/threads.md (keep about 50 lines)
- False: :8 lists `members[]`. The column is `participants`. `title` and `deleted_at` (soft delete) are missing (`schema.ts:531-560`).
- False: :47-54 "Configurations … `classifyThreadConfiguration`". That function is gone (0 hits). `direct_key` is described as a "post-spec extension (AF14)".
- False: :37 cites a lock by `framework/domain-model/src/__tests__/message-types.test.ts`. That file doesn't exist.
- Doubtful: :56-63 "Blocking (derived) … sorts first". `isBlocking` exists (`thread.ts:281`), but the product list never uses it (see above).
- Doubtful: :68 "assistant thread re-homes to factory (contract only; not yet exercised)". This describes behaviour that doesn't exist; delete it.
- Trim: the pseudo-schema block (:5-15, it drifts; link `actions/thread.ts` `ThreadSchema` instead), "Closure discipline" (:84-86, process), and the Items/responses history (:90).
- Keep: host kinds, message types, the 5 verdicts plus labels, append-only and redaction, idempotency via `client_key`, and who may post.

### part-model.md (115): MERGE→interface/threads.md (keep about 35 lines)
- False: :44 cites `framework/conversation-parts/src/part.ts`. It is `layers/core-ui/src/components/parts/part.ts`.
- False: :52 and :91 give Embed closed set `artifact · block · diff · session-reference · entity-ref · mention · unknown`. Code has `diff | session-reference | entity-ref | mention | unknown` (`part.ts:191-213`). The artifact embed was deleted, and there never was a block embed in this set.
- False: :100 cites `framework/design-system/DESIGN.md` and `tokens.css`. Gone and moved.
- False: :111 "Session view composer adds a descriptor pill strip (model · effort · mode)". This contradicts :84-86 on the same page, which says it was deleted.
- False: :115 `createOpenHandler(navigate, { betId })`. Now `{ onOpenSession, onInspectPath }` (`open-handler.ts:36-46`).
- False: :29 and :68 mention "dial-in" and "the lower-level dial-in, AM3". Removed.
- Trim: AM1/AM3/"Track-AM"/"building t3" wording everywhere (:3, :14, :20, :36, :46, :48, :98), and the visual detail that will change with the UI rebuild: grey self-box, `bg-[var(...)]`, green/grey avatars (:31-35), aggregateAt = 2 (:65).
- Move: "Model options are agent configuration" (:69-86) is about agents, not the Part model. Send it to `agent-layer/harness-capability-descriptor.md`, and delete the history blockquote.
- Keep: Part is derived and never stored, the closed Part kinds (`prose|review|resolved|questionnaire|tool|reasoning|unknown`, which match `part.ts:131-186`), both adapters, one `PartList` renderer, and the ESLint import boundary. Link to it (`eslint.config.ts:740-755`) and don't restate it.

### open-contract.md (68): REWRITE→a section of interface/navigation.md (about 20 lines)
- False: :18-24 give the route closure `host | artifact | review | session` and `/artifacts/:id`. The real set is `host | review | session`, and no artifact route exists.
- False: :22 and :37 (H5) say "task should resolve … (see H5)" and "bet resolves to `/work/bet/:betId`". Code: task → `/work/task/:id`, no bet (`host-route.ts`).
- False: :31 (H3) lists `task` host as a no-op. Not true.
- False: :32 (H4) says "block payloads (`design-system/src/block/*`), `KpiStat` + `Sparkline`, `diff/` core, `kinds/compose-artifact-body.tsx` live in `framework/design-system`". Wrong package. `Sparkline` and `compose-artifact-body` don't exist.
- False: :24 says review → `/reviews/:reviewId`. The code appends `?threadId=` (`open-handler.ts:95`).
- False: :14, :35 and :52 cite `framework/design-system/src/SplitView.tsx`. It is at `layers/core-ui/src/ds/SplitView.tsx`.
- Trim: the "Extracted, not invented" history (:53), "AM5 … the bug AM5 exists to kill" (:64), and the long NOT-list (:61-68).
- Keep: intent → presentation (`navigate→page, inspect→pane, act→overlay`, `object-presentation.ts`), block-anchored open via `#block-<id>`, the fold modes.

### review-primitive.md (82): REWRITE→interface/reviews.md (about 35 lines)
- False: :58-76 describe the OutcomeBand and its captured/granted/held/executed/failed states. None of it exists in code (0 hits for `OutcomeBand` or `executed`; `ReviewActionOperation.tsx` has only a reversibility line at :275).
- False: :50 "`trust_window_days`, default 30". It is a hardcoded 30 (`compose.ts:394`).
- False: :3, :82 and the `artifact-primitive` link say "the underlying data is the Artifact primitive". Review canvases come from the review message payload (`CanvasArtifactRef`, `thread.ts:157`). Produced documents are a separate thing.
- Stale: :56 "The gate … is being rebuilt". Future tense.
- Trim: AL2/AL3/AL4/AD4/AL7 headers, and the ASCII composition tree (it will change with the rebuild).
- Keep: 9 canvas kinds plus unknown fallback (these match `canvas-registry.ts:20-30`), anchored comments by blockId plus spotLabel, the `isSafeSourceHref` guard, one verdict per Subject, the buttons-only verdict UI, "no auto-approval", and approve → the agent's own session resumes.

### notification-primitive.md (89): MERGE→process-layer/subscriptions-and-retros.md (about 20 lines, "a person's inbox")
- False: :88 "Rows older than 30 days are swept, whether read or not". Only **read** rows older than 30 days are deleted (`layers/core-api/src/services/inbox-reaper.ts:17`, `service-bootstrap.ts:72`).
- False: :3 "(BC5)". Track id.
- False: :4 and :34 say "triage badge". The Knowledge triage badge isn't rendered.
- False: :36 mentions "Not the Thread / Item". Items are gone.
- Doubtful: :45 "read on click-through or dismiss, which removes the row from view". `markRead` sets `seenAt`/`readAt` (`subscriptions-store.ts:155-158`). This is fine, but check that the popover hides read rows.
- Trim: the vocabulary table and "What it is not" list. The contracts section repeats the definition.
- Note: the name "Notification primitive" is misleading. The object is the inbox row, and subscriptions are the primitive. The UI still labels the entry "Notifications" (`Sidebar.tsx:249`). That is a UI label, not a primitive.

### block-primitive.md (29): DELETE
- A pointer page that restates `docs/blocks`. It is also wrong: :7 says derivation is "see DocumentBody", :13 lists `WorkTask.tsx` (doesn't exist, and task bodies aren't Blocks), and :22 cites `framework/domain-model/src/blocks/types.ts` (gone). The naming disambiguation (:24-29) is already in `blocks/definition.md` §6.

### content-examples-for-design-reference.md (43): DELETE
- It admits that it cites the retired `ARTIFACT_VIEW_SHAPES` (:7). It also mentions "Knowledge triage badge +8" and "0 conflicts" (conflicts were deleted), and a task row in `WorkTeam.tsx`. Sample content belongs in `.stories.tsx` fixtures, next to the rebuild. It isn't product truth, so it doesn't belong in `docs/`.

### decisions.md (18): DELETE (fold the survivors into overview)
- False: :17 "Settings: overlay pattern. Twelve sections … Backend, Worker". It is a real route with 11 sections, and Worker is inside Backend (`SettingsPage.tsx:152-164`).
- False: :6 "Behavior gaps filled by `focus-trap-react` and `@floating-ui/dom`". `@floating-ui/dom` is not a dependency (`layers/core-ui/package.json`).
- False: :14 "Knowledge view: … Two tabs: Triage and Curated". True, but it duplicates knowledge-view.
- False: :16 "Humans do not drag or move tasks; state changes are requested via thread conversations. Parent-task state changes show consequence previews". There is a state select, and there is no consequence preview dialog (`ConsequencePreviewDialog` has 0 hits).
- False: :15 "complex artifacts promote to a companion pane". Artifact embeds were deleted.
- Every other line repeats a page it links to.

---

## docs/information-architecture/

### index.md (9): DELETE (with the folder)
- :5 describes AssistantOverlay and "persistent Settings behavior". :7 mentions "the kill dialog". :9 says "every navigation edge". All are stale.

### app-shell-always-present.md (98): REWRITE→interface/navigation.md (about 40 lines)
- False: :60 lists the route `/artifacts/:id → ArtifactPermalink`. Not in `router.tsx`. `ArtifactPermalink` appears only in a story (`ds/PageScaffold.stories.tsx`).
- False: :61 and :82 say "`/settings` redirects to `/conversations?settings=open`". Reversed: `?settings=open` redirects to `/settings` (`AppShell.tsx:363-367`).
- False: :80-84 describe the "Settings (overlay)" with max width 680. It is a route, 720px.
- False: :28-31 "Knowledge … triage-count badge (`knowledge-triage-badge`)". Not rendered. The testid would be `document-triage-badge` (`Sidebar.tsx:355`). :27 says the blocking badge counts blocking threads, but it counts unresolved reviews.
- False: :88 "Model tiers moved into the built-in harness's own detail pane… (AV2)". This is history.
- False: :98 "`AppShell.tsx:455-467, 607-626`". The line numbers drifted; the picker is at `AppShell.tsx:767`.
- Stale wording: :17-18 "retains its existing inbox behavior until its registered follow-up", "Registered domain follow-ups own …". This is planning language.
- Missing: the `/setup` route, the `/conversations/review` and `/conversations/chat` legacy redirects, and NotificationPopover plus ToastRegion as shell parts.
- Trim: badge testids, pixel widths, AppShell line numbers, U9/L21/AD3/AC11/W3 ids. All will change with the UI rebuild.

### conversations-view.md (73): DELETE (keep about 8 lines in navigation/threads)
- False: :51-73 describe session dial-in, `SessionActivityPanel`, the `D` key and the `conversation.dial-in` split. All removed. The only split key left is `conversation.inspect` (`Conversations.tsx:294`).
- False: :49 "`ArtifactRef` is deleted…" (history), plus "canvas-registry.ts:21-29" line numbers.
- False: :21-23 "Sectioned mode …, Filter state lives in AppShell (U6 AC-16)". Sectioned mode is dead in the live page, which uses `groupBySection={false}`. Documenting an unused component default is noise.
- Trim: almost everything. It is screen detail that the rebuild will change. Keep: "reviews are read in the conversation and decided on /reviews/:id".

### work-view.md (86): DELETE (keep about 10 lines)
- False: :7 is a "BB1 (2026-08-30)" history banner.
- False: :50 and :79 show an "Artifacts / ArtifactSection" section on WorkTeam. It was removed (`WorkTeam.tsx:35`). It is still on the task page (true for :79).
- False: :60 "BodyEditor for description and done condition". Create uses plain `Input`s plus `TaskDependencyField` (`WorkTaskCreate.tsx:165-206`).
- False: :62 `?fromKnowledge=<id>`. The code uses `?fromDocument=` (`DocumentDetail.tsx:526`).
- False: :66 cites `WorkTask.tsx`. The file is `WorkTaskPage.tsx`.
- False: :71-75 claim an "Overflow menu Kill", "Stat cards row", "Provenance link" and "Outcome section … AI retro draft". None are in `WorkTaskPage.tsx`. The page has a Details edit panel (title, description, goal, owner, dependencies, state), subtasks with move up/down, Sessions, Artifacts, Discussion.
- False: :76 "Task body rendered as Blocks — deriveBlocks(...)". Not true.
- False: :84 "Kill: ConsequencePreviewDialog … Pause/resume removed (AD5)". No such dialog.
- False: :86 "matches ETHOS §2". Fine but decorative.
- Missing: the Sessions section on the task page (the replacement for dial-in).

### knowledge-view.md (70): DELETE (move the data rules to knowledge-architecture, keep about 10 lines of UI)
- False: :13 "carries a triage badge — count … proposed". Not rendered.
- False: :25 "Sort control … Recency only … no-op". This UI detail will change with the rebuild.
- False: :24 "Shared = factory scope". The code comment says `factory+product+practice` (`DocumentList.tsx:325`). Check `utils/scope-labels`.
- False: :56 "Backlinks card: Children plus siblings". It shows siblings only (`DocumentDetail.tsx:121`).
- False: :66 "a human-created document and an agent-written one both start `proposed`". This contradicts :60 on the same page ("Human-authored documents are created as status `active`").
- Trim: the component tables are screen inventory. The data semantics (:64-70) duplicate `knowledge-architecture/the-canonical-store.md`.
- Keep in the rebuild brief, not in docs: Triage keys (j/k/v/x/o).

### cross-view-navigation-map.md (52): DELETE
- False: :12 "in-shell settings overlay (`AppShell settingsOpen`)". It is a route.
- False: :19 "Dial In or an inline session reference". Dial-in is gone.
- False: :44 "Related-items sidebar (`structuredRelatedItems`, DocumentDetail.tsx:109,327-328)". 0 hits.
- Missing: the task page → session split; the Notifications popover → object.
- A full edge list is exactly what the UI rebuild will rewrite. Keep only the Back vs Up rule (:46-48), in navigation.md.

---

## docs/blocks/

Is 4 pages (297 lines) plus a HIL pointer proportionate to about 980 lines in `core-ui/src/block`? No. The BlockId algorithm is specified twice (in contracts.md, and summarised in canonical-shapes and definition), and all four pages cite dead packages. One page of about 90 lines is enough.

### canonical-shapes.md (52): REWRITE as the single blocks page (the path is cited by code, see the repoint list)
- False: :3 and :9 say "`framework/domain-model/src/blocks/types.ts:2-3` cites it (path frozen, never move)". The citing file is `layers/core-ui/src/block/types.ts:2-3`.
- False: :11 and :41 say `framework/block-derivation/...`. It is `layers/core-ui/src/block/...`. The line refs drifted too: `derive-blocks.ts:295-298`.
- False: :18 "HOST_KINDS is a closed seven-kind enum (task | document | artifact | …) thread.ts:19-28". It has five kinds, at :35.
- False: :18 "`PlainPayloadWithBlockId` thread.ts:480-491" and "schema.ts:787-794". The line numbers are wrong: `blockId` is at `thread.ts:344` and `schema.ts:591-598`.
- False: :48 "`framework/design-system/src/kinds/compose-artifact-body.tsx:88` … `data` kind". The file doesn't exist.
- False: :52 "Task bodies … render through Block[] (`WorkTask.tsx`)". Not true.
- False: :46 "(AM5 outcome)". Work-item id.
- Keep: the closed BlockKind table (it matches `BLOCK_KINDS`), GFM-only on disk, pure derivation, unknown as the safety valve.

### contracts.md (98): MERGE→blocks page (keep the algorithm in about 35 lines)
- False: :27 and :94 cite `golden-ids.test.ts`, `id-stability.test.ts` and `purity.test.ts`. They don't exist. `block/__tests__` holds `assert-version-bumped`, `blocks-no-ssrf`, `derive-blocks`, `fuzz`, `normalise` and `types`.
- False: :87 "dev mode runs `assertNoCollisions` (derive-blocks.ts:432-477)". 0 hits.
- False: :95 (rule 3) "Inline block references are `BlockRef` … `threads-schema.ts:42-47`". BlockRef was removed and `threads-schema.ts` doesn't exist.
- False: :98 explains why BlockRef carries a host pair. Delete it with BlockRef.
- False: :8 and :10 "Cross-body reference happens through inline `BlockRef`s". Removed.
- False: :23 cites `useBlockResolution.ts`. Gone.
- False: :96 says "migration `0020_T5`" and ":107" for `threads-schema`. Stale.
- False: :93 "knowledge sync watcher". Check against the writeback processor (`agent-orchestration/run-orchestration/src/writeback-processor.ts`); it isn't a "Knowledge Fabric".
- Keep: the hash inputs (these match `block-id.ts`: version, kind, outlinePath, normalisedPayload, single spaces, blake2s dkLen 16), outlinePath/ordinal/slug (these match `normalise.ts`, using github-slugger and `<root>`/`<empty>`), the per-kind normalisation table, and message block anchors.

### definition.md (94): MERGE→blocks page (about 25 lines)
- False: :5, :13 and :15 cite `framework/block-derivation` and `framework/domain-model/src/blocks/types.ts`.
- False: :7 "Knowledge Fabric watches plain markdown files"; "`useBlockResolution.ts:12-14`". Both dead.
- False: :17 "`hostKind` is one of `task | document | agent | user` (`BlockHostKind`, `framework/domain-model/src/thread.ts`)". Two lists disagree, and the block one includes `artifact`.
- False: :41 and :49 mention `BlockRefEmbed.tsx`, `BlockRef` as cross-body reference, and a "source changed" indicator. Gone.
- False: :45 "design-system components (`framework/design-system/src/block/`)". It is `layers/core-ui/src/ds/block/`.
- False: :57 "`review-canvas.tsx:176`" as the degraded indicator. Check this. The block-ref degradation path is gone.
- False: :94 lists `WorkTask.tsx` and `compose-artifact-body.tsx` as consumers.
- Trim: the founder quote (:35-37, one sentence is enough), the rejection list numbered as "load-bearing", and the vocabulary "aliases not to use" table.

### derivation-and-rendering.md (45): MERGE→blocks page (about 10 lines)
- False: :7 "`useBlockResolution.ts:12-14`, @lore T4". Gone.
- False: :22 lists the Task description renderer `WorkTask.tsx`. Not true.
- False: :37 "Block reference (contextual) `BlockRef` … `BlockRefEmbed.tsx:10`". Removed.
- False: :41 "`InlineRef.kind` is a closed union of six kinds: `document | task | artifact | message | block | mention`". Actual: `document | task | message | mention | artifact` (canvas). There is no block.
- False: :43 "HOST_KINDS closed at seven kinds". It has five.
- False: :16 `framework/domain-model/src/__tests__/blocks/assert-version-bumped.test.ts`. It is at `layers/core-ui/src/block/__tests__/assert-version-bumped.test.ts`.
- Keep: derivation runs client-side on every render with no cache, writes store markdown only, and the list of render surfaces (corrected: DocumentBody, review-canvas, ReviewRenderedInContext).

### index.md (8): REWRITE (or delete if the folder collapses)
- :6 "path frozen (cited by `framework/domain-model/...`)", :7 "T4 BlockRef and T5", :8 "7 InlineRefKinds". All false.

---

## docs/ui-design/

### index.md (9): DELETE (with the folder)
- :9 "AG7 design contract". Work-item id.

### foundation.md (34): MERGE→interface/ui-design.md (about 12 lines)
- False: :8 lists `@floating-ui/dom`. Not a dependency.
- False: :25 and :27 cite `framework/design-system/DESIGN.md`, `src/tokens.css` and `Tokens.stories.tsx`. They are at `layers/core-ui/src/ds/tokens.css` and `ds/Tokens.stories.tsx`, and there is no DESIGN.md.
- False: :31 "`framework/design-system/src` never imports `@hyperidle/core-ui` … `eslint.config.ts:770-799` (AJ6 AC8)". The package is gone, so the rule is moot.
- False: :32 links `.claude/rules/visual-regression.md`. It is `.pipeline/rules/visual-regression.md`.
- Trim: the jsdom gotcha belongs in testing rules. The token wiring facts duplicate `.claude/rules/design-system.md` §Tokens.
- Keep: the stack (Tailwind 4, DaisyUI 5, Tiptap), the two theme names and the theme storage key (these match `useTheme.ts:20` and `index.css:6-36`).

### our-components.md (73): DELETE (link `ds/index.ts` and `.claude/rules/design-system.md`)
- False: :13 and :27 say components "Live in `framework/design-system/src/`". They are in `layers/core-ui/src/ds/`.
- False: :34 lists `BetCard`. Gone; `GlobalSearchPanel.tsx:258` says "BetCard replaced by TaskCard".
- False: :47 "Sidebar … 276px / 300px, four stable destinations". True now, but it duplicates the shell doc and will change with the rebuild.
- False: :39 says "~70 components". `.claude/rules/design-system.md` says 57 top-level.
- Trim: the tier model is duplicated by `.claude/rules/design-system.md` (budget, promotion), and the history notes (PitchCard, Kanban, ArtifactView deleted) should go. The DaisyUI as-is and not-used lists are the only unique content; move them to `.claude/rules/frontend.md` if they are still wanted.

### rules.md (16): DELETE (it restates lint and `.claude/rules`)
- Restates lint: #3 `no-local-status-builder`; #5 `no-hardcoded-color`/`no-raw-tailwind-color` (AQ-008); #6-8 `no-handrolled-page-scaffold`/`no-handrolled-page-header`/`no-undefined-font-heading`; #9 `no-off-grid-spacing` (word for word as AQ-001); #10 `shadow-token-only` (AQ-012). #1-2 duplicate `.claude/rules/frontend.md` and `design-system.md`.
- False: :9 says tokens are in `framework/design-system/src/tokens.css`. :8 says "`--space-3` = 9px, `--space-4` = 12px" as the density default; check against `ds/tokens.css` (the guide says `--space-N` = 3N px).
- Trim: the "AZ7/AZ11" ids at :13.

### page-anatomy.md (145): REWRITE (about 30 lines; code cites it, see the repoint list)
- False: :5 cites four `framework/design-system/src/Page*.tsx` paths. They are at `layers/core-ui/src/ds/`.
- False: :139 cites `layers/core-ui/__e2e__/AZ2-page-scroll.spec.ts`. It is `__e2e__/page-scroll.spec.ts`.
- False: :141 cites RuleTester files `AZ2-…test.ts` and `AI7-…test.ts`. They are `no-handrolled-page-scaffold.test.ts` and the others without prefixes.
- False: :135 "exempt via `eslint.config.ts:184-185`". Now :193-194.
- False: :66 and :72 use example copy "Work / Portfolio", "Phase: build · Lead: Dana". Portfolio, phase and lead are all gone. :108 "WorkBet/WorkTask style" names deleted pages.
- Trim: the "Before AZ2…" war story (:11), the "min-h-0 does not belong" essay (:50; one line is enough), and the Enforcement section (:129-141), which restates three lint rules. Link to the rules instead. Also cut the content-lane pixel table (:36-46), which will change with the rebuild.
- Keep: PageScaffold `scroll` vs `managed`, `frame=page|local`, the invariant that a scrolling body is a flex item of a bounded flex column, the AppShell main being overflow-hidden, and one h1 per page (PageHeader).

### settings-consistency.md (143): DELETE
- False: :68-78 "Agent backends uses a 6px inline dot (not StatusChip)". It uses `StatusChip` (`SettingsHarnesses.tsx:121`).
- False: :51 and :105-107 "The aliases pass `eslint-plugin-design` … no current tooling catches them". `no-off-grid-spacing` resolves Tailwind aliases (`no-off-grid-spacing.ts:40-43`; AQ-001 "whether written as a supported Tailwind alias"). `gap-4` = 16px is flagged.
- False: :45 gives the grid as `{3,6,9,12,18,24}`. Lint allows `{0,3,6,9,12,18,24,36,48}`.
- False: :129 and :135 cite `HarnessCard.tsx` as a file (it is a component inside `SettingsHarnesses.tsx`) and `eslint.config.ts:943-969` / `:962-963` (drifted to about :943).
- False: :64-65 and :99 mention "Models" rows and `SettingsModels.tsx`. There is no Models section and no such file.
- False: :21 and :91 "Models tier data-row cards …", "(AV2 rewrite)".
- Stale: the per-section pixel treatment table is pure screen detail, and the UI rebuild will replace it. The StatusChip colour-meaning rule (blue calmer than amber) is the only durable idea; put one line in the ui-design page.

---

## Code and docs that cite these pages (repoint needed)

| Citing file | Cites | Action |
|---|---|---|
| `layers/core-ui/src/block/types.ts:2-3` | `docs/blocks/`, `docs/blocks/canonical-shapes.md` | Repoint to the single blocks page (for example `docs/interface/blocks.md`). If the folder collapses, the "path frozen" promise must go. |
| `layers/core-ui/src/block/derive-blocks.ts:4` | `docs/blocks/` | Repoint. |
| `layers/core-ui/src/block/__tests__/types.test.ts:7` | `docs/blocks/canonical-shapes.md` | Repoint. |
| `layers/core-ui/src/ds/Paragraph.stories.tsx:28` | `/docs/blocks` (sample link) | Harmless sample text; optional. |
| `layers/core-ui/src/ds/PageScaffold.tsx:5` | `docs/ui-design/page-anatomy.md` | Repoint to the ui-design page. |
| `.claude/rules/design-system.md:66` | `docs/information-architecture/` | Repoint to the navigation page. |
| `framework/db/drizzle-sqlite-archive/0007_…sql:19` | `docs/human-interface-layer/thread-primitive.md` | Archive migration; leave it. |
| `reviews/*.md` (4 files) | ui-design, blocks | Leave it, or delete reviews/ as history (out of scope). |
| Other docs linking in: requirements/usability-requirements (7), system-requirements (3), product/human-ai-collaboration (3), architecture/system-overview (3), as-implemented-domain-architecture (3), functional-requirements (2), process-layer/subscriptions-and-retros (2), handoff-and-lifecycle-propagation (2), guides/user/three-core-views (2), guides/developer/design-system (2), architecture/decisions (2), plus about 10 single links | | Fix links in the same change as the collapse. |

Neighbouring duplicates to decide on together: `docs/guides/user/the-interface.md` (94) and `three-core-views.md` (118) repeat the shell and views. `docs/guides/developer/design-system.md` (50) repeats ui-design and `.claude/rules/design-system.md`. `docs/process-layer/artifact-primitive.md` (152) is the claimed owner of "artifact embed shapes" that no longer exist.

---

## Proposed target structure

Collapse all four folders into one `docs/interface/` folder, and move inbox semantics to the process layer next to subscriptions. Screen-level detail (component tables, pixel widths, testids, per-view edge lists) is dropped. The UI rebuild will rewrite it, and the stories plus code are its source of truth.

| Page | Purpose | Replaces | Lines before → after |
|---|---|---|---|
| `interface/index.md` | Section links | 4 index pages (40) | 40 → 8 |
| `interface/overview.md` | One app, four sidebar destinations (Notifications, Conversations, Work, Knowledge), what each is for, the human answers every review, approval rate is a record not a gate, what the layer is not | overview, the-three-views, decisions, content-examples, block-primitive | 222 → 40 |
| `interface/navigation.md` | The route table, the sidebar, shortcuts, the Settings page (11 sections, link to the user guide), the assistant overlay, Back vs Up, the open contract (intent → page/pane/overlay, fold, `#block-` anchor) | app-shell, cross-view map, open-contract, conversations/work/knowledge-view | 449 → 50 |
| `interface/threads.md` | Thread and Message model, host kinds, message types, verdicts, append-only/redaction/idempotency, who may post; the Part model (closed Part and Embed kinds, two adapters, one renderer, a link to the lint boundary) | thread-primitive, part-model | 206 → 80 |
| `interface/reviews.md` | The review page: 9 canvases plus fallback, anchored comments, source-link guard, one verdict, approve → session resumes | review-primitive | 82 → 35 |
| `interface/blocks.md` | The Block primitive: GFM-only, derived on every render, closed kinds, the BlockId algorithm and normalisation, message block anchors, render surfaces | blocks/* (4) | 289 → 90 |
| `interface/ui-design.md` | Stack, themes, where tokens and components live, the PageScaffold scroll invariant, the heading contract, the status-colour meaning; links to `.claude/rules/aesthetic-quality.md`, `design-system.md` and the lint rules for everything enforced | foundation, our-components, rules, page-anatomy, settings-consistency | 411 → 45 |
| `process-layer/subscriptions-and-retros.md` §Inbox | An inbox row is a pointer at a change, seen/read, read rows reaped after 30 days, the popover | notification-primitive | 89 → +20 |

**Total: 1786 → about 370 lines** (about −80%). Delete `content-examples-for-design-reference.md`, `block-primitive.md`, `decisions.md`, `cross-view-navigation-map.md`, `settings-consistency.md`, `rules.md` and `our-components.md` outright. If the founder wants the folders kept, the same content fits as `human-interface-layer/` (overview, navigation, threads, reviews) plus `blocks/index.md` (one page) plus `ui-design/index.md` (one page), with `information-architecture/` removed.
