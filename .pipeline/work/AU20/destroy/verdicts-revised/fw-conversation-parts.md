# conversation-parts — destroyer verdict (framework) — REVISED after founder rulings

## What changed after the rulings

Ruling A4 inverts the first wave's headline. The first wave found that production only ever
produces generic neutral tool rows and concluded the rich renderers were Storybook fiction to
cut. The ruling says the renderers are the *right* half of a live session surface you dial
into; the missing half is a producer and a place to watch. So the rich-vocabulary rows move
from SIMPLIFY/DELETE to FINISH, and the evidence below is re-cast as a producer gap analysis
instead of a deletion warrant. Ruling A3 separately kills the composer-pill path outright.

| # | Export | Old verdict | New verdict | Ruling |
|---|---|---|---|---|
| 3 | `derivePartsFromSession` | SIMPLIFY (cut reasoning/answer/rich-tool branches) | **FINISH** | A4 — branches are the right half; build the producer |
| 4 | `aggregateToolRun` | SIMPLIFY (status rules never fire → degenerate fold) | **FINISH** | A4 — status rules go live when tool results are emitted |
| 5 | `deriveComposerPills` | MERGE (inline into SessionView) | **DELETE** | A3 — per-message composer pills die; option concept moves to agent config |
| 7 | `ToolKind` | DELETE (fiction) | **SIMPLIFY** | A4 revives the family; alias-pair defect stands independently |
| 18 | `ToolRunBlock` | SIMPLIFY (drop failedCount) | **FINISH** | A4 — failedCount becomes real with statuses |
| 20 | `TOOL_KINDS` | DELETE (fiction) | **SIMPLIFY** | A4 revives the family; collapse the alias duplicates |

**6 rows changed.** All 15 other rows stand: the seven KEEPs were never in question, and the
remaining DELETEs (`PartKind`, `PartId`, `ReviewTarget`, `FoldDescriptor`, `EmbedKind`,
`PART_KINDS`, `EMBED_KINDS`) plus the `Embed` SIMPLIFY rest on zero-reference / test-only
evidence that is independent of the single-user premise and of A4 — the founder explicitly
kept them.

### What must be built for the live session surface

**What the producer emits today — file and shape.** The canonical harness vocabulary is
`framework/harness-protocol/src/harness/harness-events.ts`: exactly five event types —
`token_usage`, `tool_call { toolName, args }`, `completion { text }`, `error`,
`pre_compaction`. The drain loop is
`layers/agent-orchestration/run-orchestration/src/provisioner.ts` (Phase 10, ~1549–1580): it
handles `token_usage` (accumulate), `tool_call` (emit
`tool_call_recorded { sessionId, toolName, argsSummary, timestamp }` on the EventBus, args
summarized via `ports.observability.summarizeToolArgs`), and `error` (crash). **`completion`
and `pre_compaction` fall through the if/else and are silently dropped.**
`layers/agent-orchestration/src/session-activity-buffer.ts` subscribes to
`tool_call_recorded` only and stores
`{ type: "tool_call", timestamp, data: { toolName, argsSummary } }` — the only
`ActivityEntry` kind production ever creates. Client side,
`layers/core-ui/src/hooks/useSessionActivity.ts` does a REST snapshot
(`GET /api/sessions/:id/activity`) plus WS topic `session:<id>`, and its WS handler branches
only on `tool_call_recorded` and `session_ended`.

**Per missing Part kind — does the wire already carry it?**

1. **Agent prose (`answer_settled`) — already arrives, dropped.** Every adapter emits
   `completion { text }`: claude assistant text blocks
   (`harness-event-normalization.ts` `preMapClaudeEvent`, lines 80–84), opencode `text`
   events carrying `part.text` (lines 181–195), codex `item.completed` `item.text`
   (lines 225–230), builtin at many sites (`builtin-harness-adapter.ts:574–912`). The
   provisioner has no `completion` branch. Job: add one — emit an
   `agent_answer_recorded`-style event, add a buffer branch and a WS-handler branch. No
   harness-protocol change. **Smallest item on this list.**
2. **Streaming deltas (`answer_delta`) — partially on the wire.** opencode `text` events are
   already per-chunk (verified in the AR5 lore at that pre-map); claude needs
   `--include-partial-messages`; codex is per-item; builtin is per-call. The canonical
   vocabulary cannot distinguish delta from settled — either treat each `completion` as a
   settled prose turn (the adapter's existing merge machinery already appends and settles) or
   add a delta member to `HarnessEvent`. Medium.
3. **Reasoning — counts arrive everywhere, text arrives for claude and is dropped at the
   pre-map.** `token_usage.reasoningOutputTokens` already flows (enough for the "Thought for
   Ns" resting label, no body). Claude stream-json assistant messages carry `thinking`
   blocks; `preMapClaudeEvent` (lines 61–85) inspects only `tool_use` and `text` blocks, so
   thinking falls through to an empty completion. Job: pre-map branch + a canonical
   `reasoning` event + the same emit/buffer/WS plumbing. codex/opencode reasoning-text
   availability is unverified — do not promise it there. Medium.
4. **Tool status / output — dropped at the pre-maps.** Claude tool results arrive as `user`
   events with `tool_result` blocks; the pre-map maps `user` → benign empty completion
   (lines 92–94). opencode `tool_use` events carry `part.state`, of which only `state.input`
   is read (lines 162–169). Correlating a result back to its call needs a call id — canonical
   `ToolCallEvent` has no id field, so this one requires a harness-protocol extension.
   Medium-large.
5. **Diff stats — not on any wire.** Must be computed from edit-tool args/results; the
   package's own `diffEmbed` lore already admits the label-as-artifactId placeholder. Do
   last among the tool enrichments.
6. **Sub-agent nesting (`opensSession`) — nothing emits child session ids.** Harness
   sub-agents (e.g. claude's Task tool) never become HyperIdle sessions; this needs
   orchestration-level invention (provision or virtualize child sessions and link them).
   Largest; defer until the rest of the surface is live.
7. **`human_message` — requires interactive sessions.** Sessions are one-shot provisioned
   runs; there is no route that feeds input into a running harness, and `SessionView`'s
   `onSend` is a stubbed no-op at its only production mount (`Conversations.tsx`
   `SessionViewPanel`: "sending is not supported here"). Whole input path missing
   (UI → route → harness stdin). Part of the surface build, not this package.

**Where would the surface live — what is missing.** Two components exist in
`layers/core-ui/src/components/`: `SessionActivityPanel.tsx` and `SessionView.tsx`. Only the
first is reachable: `Conversations.tsx` shows a "Dial in" button when a session is active and
opens `SessionActivityPanel` in the right split. `SessionView` — the rich renderer this
package feeds — is mounted via `SessionViewPanel` but opened only by `onOpenSession`, which
fires from a `session-reference` Embed click or a sub-agent tool-row click, **both of which
are production-dead**. So the rich surface is mounted-but-unreachable. There is no
`Session*.tsx` in `layers/core-ui/src/pages/` and no `/sessions/:id` route. Missing, in build
order:

1. **A reachable opener** — a session page/route, or make dial-in open `SessionView`. Note
   `SessionActivityPanel` and `SessionView` are two renderers of the same activity feed; the
   finished surface should be ONE of them (core-ui destroyer's turf, flagged here).
2. **`answer_settled` emission** (item 1 above) — the cheapest visible win: real agent prose
   in the live view.
3. **Reasoning** (item 3), then **tool status/output** (item 4), then **deltas** (item 2).
4. **Diffs, sub-agent sessions, interactive input** (items 5–7) — each is real invention,
   schedule separately.

## Where does this package go?
**Verdict: DISSOLVE → `layers/core-ui` — unchanged by the rulings.**

Every production consumer is `layers/core-ui`. Measured:
`rg -a -l "@hyperidle/conversation-parts" layers framework applications tools` → 23 files,
all under `layers/core-ui/` (the one `framework/domain-model` hit is a doc comment). The
live-session ruling does not change this: the producer work lands in
`agent-orchestration` + `harness-protocol` + `domain-model` (`ActivityEntry` already lives
in `domain-model/src/session-activity.ts` — the normalized boundary is already outside this
package). What this package holds is the client-side derivation and view vocabulary, and its
only consumer is the renderer layer. A Part is "derived, never stored"; the server owns
`Message` and `ActivityEntry`, never a Part. The package boundary still exists for one
reason — a scoped ESLint `no-restricted-imports` rule proving the renderer never imports
`Message`/`HarnessEvent` — and a directory-scoped lint rule inside core-ui holds that
boundary equally well. Dissolve stands; do the lint re-scope in the same PR as the move.

The A3 deletion of `deriveComposerPills` also removes the package's ONLY dependency on
`@hyperidle/harness-capability` — the dissolve gets cheaper, not harder.

## Consumers (measured, not assumed)
| Consumer | What it imports | Could it own this? |
|---|---|---|
| `layers/core-ui` (23 files: PartList, SessionView, Conversations, ConversationSurface, open-handler, parts/*, tests, stories) | Everything the package exports that is used at all | Yes — it is the only consumer. Move `part.ts` to `layers/core-ui/src/parts/part.ts`, delete the package. |
| `framework/domain-model/src/session-activity.ts` | Nothing — mentions `derivePartsFromSession` in a comment | n/a |

## If written today, from scratch

Against the corrected premise — a shared backend, a team of humans and agents, an event
stream plugins hang off, and a live session surface you dial into to watch an agent work:

A single `layers/core-ui/src/parts/part.ts` (+ the existing `parts/*` renderers) holding:
- `Part` union — **including** reasoning and the rich tool shape, because the surface that
  renders them is product, with the producer scheduled (see above)
- `PartAuthor`, `PartGroup`, `Embed` (minus the never-constructed `session-reference`
  variant), `OpenTarget`, `OpenHandler`
- `derivePartsFromMessages` — the load-bearing conversation adapter
- `derivePartsFromSession` — kept at full vocabulary, fed by the finished producer
- `groupParts`, `aggregateToolRun` (with a status field that finally varies)
- a tool-kind family of **canonical members only** — `command, read, edit, search,
  web-search, mcp, sub-agent, create, generic` — with a normalizer that actually maps the
  legacy alias spellings instead of pattern-matching on both

No package, no `@hyperidle/harness-capability` dependency, no composer pills, no exported
const sets.

## Kill summary
| Verdict | Count |
|---|---|
| DELETE | 8 |
| MERGE | 0 |
| SIMPLIFY | 3 |
| FINISH | 3 |
| KEEP | 7 |
Surface: 21 exports → 13 survivors (38% export cut), package itself still deleted
(100% package cut). First wave was DELETE 9 / MERGE 1 / SIMPLIFY 4 / KEEP 7.

## Feature-level kills (and un-kills)
1. **UN-KILLED: the rich session-stream vocabulary** (reasoning / answer streaming / tool
   status / diffs / sub-agent nesting). First wave: cut ~150 lines of fiction. Ruling A4:
   FINISH — the renderers stay, the producer gets built per the gap analysis above. Stories
   and tests that fabricate rich entries stop being fiction the moment the emitter lands;
   they stay until then as the only spec of the target shape.
2. **KILLED (A3): the composer-pill path.** `deriveComposerPills` and SessionView's pill
   rendering (`SessionView.tsx:565`) die; per-model options move into agent configuration.
   Breaks: nothing — pills rendered options for a composer whose `onSend` is a no-op.
3. **KILLED (stands): `session-reference` Embed kind.** No adapter and no production code
   ever constructs one — only stories and tests (`rg -a 'kind: "session-reference"'`). The
   renderer branch in `embeds.tsx` dies with the union member. If the live surface later
   wants conversation-embedded session links, re-add it with a real producer in the same PR.
4. **KILLED (stands): the package boundary itself.** The W1 ESLint rule re-scopes from a
   package name to a core-ui directory glob. One-line lint config change.

## Full export audit
| # | Export | Kind | Reach | Verdict | Reason |
|---|---|---|---|---|---|
| 1 | `groupParts` | function | UI: Conversations + SessionView via PartList | KEEP | Real grouping both live surfaces run on every render; moves to core-ui. |
| 2 | `derivePartsFromMessages` | function | UI: `/conversations` (Conversations.tsx, ConversationSurface.tsx) | KEEP | The load-bearing adapter; review/resolved/questionnaire/verdict paths all have real API producers; moves to core-ui. |
| 3 | `derivePartsFromSession` | function | UI: SessionView | FINISH | A4: keep the full branch set (reasoning/answer/rich tool); today only the tool_call branch runs because the provisioner drops `completion` and the pre-maps drop thinking/tool_result — build the producer per the gap analysis; moves to core-ui. |
| 4 | `aggregateToolRun` | function | UI: SessionView only | FINISH | A4: the running-standalone rule and `failedCount` activate when tool statuses are emitted (harness-protocol tool-result extension); moves to core-ui. |
| 5 | `deriveComposerPills` | function | UI: SessionView composer only | DELETE | A3: the per-message composer-pill path dies; option concept moves to agent config. Kills the package's only `harness-capability` dependency and SessionView's pill block. |
| 6 | `PartKind` | type | none (PartList mention is a comment) | DELETE | Stands: exported to nobody; internal use inlines into the union. |
| 7 | `ToolKind` | type | none outside package | SIMPLIFY | A4 revives the family, but the defect stands: collapse the duplicate alias pairs to canonical members and make the normalizer actually normalize (today `normalizeToolKind` claims to canonicalize read/file-read and edit/file-change but returns the raw value — part.ts:446-450 vs the lore at 443). |
| 8 | `PartId` | type | none | DELETE | Stands: alias of `string`, zero consumers. |
| 9 | `PartAuthor` | interface | UI: Conversations.tsx, SessionView.tsx | KEEP | Real author shape both adapters and pages construct; moves to core-ui. |
| 10 | `ReviewTarget` | interface | none outside package | DELETE | Stands: internal-only; inline the shape; `betId` is always `""` at the only construction site. |
| 11 | `FoldDescriptor` | interface | DEAD | DELETE | Stands: zero references anywhere, not even inside its own package. Pure corpse. |
| 12 | `Part` | type | UI: PartList, SessionView, all parts/* renderers | KEEP | The core vocabulary of the conversation surface; under A4 also the vocabulary of the live session surface; moves to core-ui. |
| 13 | `EmbedKind` | type | DEAD | DELETE | Stands: zero references outside its own derivation line. |
| 14 | `Embed` | type | UI: embeds.tsx, ProsePart, adapters | SIMPLIFY | Stands: survives minus the `session-reference` variant no production code ever constructs; re-add only with a real producer. Moves to core-ui. |
| 15 | `OpenTarget` | type | UI: open-handler.ts, Conversations, SessionView, ToolPart | KEEP | The real routing seam; the `route: "session"` arm becomes the opener of the live surface under A4. Moves to core-ui. |
| 16 | `OpenHandler` | type | UI: 8 production files | KEEP | The single open-hook signature every part renderer takes; moves to core-ui. |
| 17 | `PartGroup` | interface | UI: PartList, SessionView | KEEP | Return shape of groupParts; moves with it. |
| 18 | `ToolRunBlock` | type | UI: SessionView only | FINISH | A4: keep `failedCount` — it goes live with tool statuses; still single-consumer, still inlines beside aggregateToolRun in core-ui. |
| 19 | `PART_KINDS` | const | TEST-ONLY externally; internal type derivation | DELETE | Stands: no runtime production reader; inline the union literals. |
| 20 | `TOOL_KINDS` | const | TEST-ONLY externally; internal `normalizeToolKind` membership check | SIMPLIFY | A4: the family is the target vocabulary the producer must emit — keep it, but drop the alias duplicates (`file-read`/`read`, `file-change`/`edit`) and keep `sub-agent` only as the declared target of the deferred nesting item. |
| 21 | `EMBED_KINDS` | const | TEST-ONLY | DELETE | Stands: only readers are the package's own tests asserting the const equals itself. |

## Holes this leaves
- **The live surface stays honest-but-thin until the producer ships.** Nothing here makes
  the session view richer by itself — SessionView still renders generic neutral tool rows
  until the schedulable items above land, and SessionView itself stays unreachable until an
  opener exists. The FINISH verdicts are work orders, not survivors that need nothing.
- **A producer work package must exist.** The emission gaps live outside this package
  (provisioner drain loop, harness pre-maps, harness-protocol vocabulary, buffer, WS
  handler) — none of it is conversation-parts code, so dissolving the package neither helps
  nor hinders it. Sequence the dissolve and the producer independently.
- **Composer-pill deletion leaves agent config owing a home for per-model options** (A3's
  other half) — `harness-capability` descriptors survive; the agent-config surface that
  renders them is separate scheduled work.
- **W1 lint boundary** re-scopes from `@hyperidle/conversation-parts` to a core-ui directory
  glob in the same PR as the move, or the source-agnostic guarantee silently evaporates.
- **SessionActivityPanel vs SessionView duplication** — two renderers of one activity feed;
  the finished surface should keep one. Flagged for the core-ui destroyer.
