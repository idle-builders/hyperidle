# conversation-parts — destroyer verdict (framework)

## Where does this package go?
**Verdict: DISSOLVE → `layers/core-ui`**

Every production consumer is `layers/core-ui`. Nothing else imports it — not the conversation
service, not core-api, not agent-orchestration, not desktop. Measured:
`rg -a -l "@hyperidle/conversation-parts" layers framework applications tools` → 23 files,
all under `layers/core-ui/` (the one `framework/domain-model` hit is a doc comment).

**Explicit answer to the founder's question — is "parts of a conversation" a different thing
from "conversation"?** No, but the dissolve target is NOT the conversation service either.
A Part is a client-side render unit, "derived, never stored" by the package's own design.
The server owns `Message` (in `domain-model`); it never sees a Part. Moving this into the
conversation service would put UI view-model code on the server. The concept belongs to the
renderer that consumes it: this is `layers/core-ui/src/parts/` code wearing a package costume.

The package boundary exists for one reason: a scoped ESLint `no-restricted-imports` rule
proving the renderer never imports `Message`/`HarnessEvent`. A lint rule can scope to a
directory inside core-ui exactly as well. A package is not needed to hold a lint boundary.

Bonus: the `deriveComposerPills` function is the package's ONLY reason to depend on
`@hyperidle/harness-capability` — a composer concern jammed into a "conversation parts"
package because it had no better home. Dissolving kills that dependency edge too.

## Consumers (measured, not assumed)
| Consumer | What it imports | Could it own this? |
|---|---|---|
| `layers/core-ui` (23 files: PartList, SessionView, Conversations, ConversationSurface, open-handler, parts/*, tests, stories) | Everything the package exports that is used at all | Yes — it is the only consumer. Move `part.ts` to `layers/core-ui/src/parts/part.ts`, delete the package. |
| `framework/domain-model/src/session-activity.ts` | Nothing — mentions `derivePartsFromSession` in a comment | n/a |

## The headline finding: half this package renders data that does not exist

The only production producer of `ActivityEntry` is
`layers/agent-orchestration/src/session-activity-buffer.ts`, fed by
`run-orchestration/src/provisioner.ts:1565`, which emits exactly
`{ type: "tool_call", data: { toolName, argsSummary } }`. Confirmed with `rg -a` across
layers/framework/applications: **no production code ever produces** `reasoning`,
`answer_delta`, `answer_settled`, or `human_message` entries, and no production tool_call
ever carries `toolKind`, `status`, `verb`, `target`, `output`, `diff`, or `opensSession`.
Only stories, unit tests, and one e2e spec fabricate them.

In the running product, `derivePartsFromSession` therefore always outputs generic neutral
tool rows (toolKind "generic", status "neutral", no diff, no output), and:
- the streaming-prose merge machinery (delta append, settle, flush) never runs
- reasoning Parts never exist → `ReasoningPart.tsx` never renders in production
- `aggregateToolRun`'s running-standalone rule and `failedCount` never fire — every status
  is "neutral", everything folds
- SessionView's toolKind tallies (`SessionView.tsx:216-221` counting edits/cmds/reads) count
  over a field that is always undefined
- the `sub-agent` → `opensSession` → nested-session affordance (`ToolPart.tsx:200-207`)
  never fires
- `TOOL_KINDS`' alias pairs are a lie twice over: `normalizeToolKind`'s comment claims it
  canonicalizes "read"/"file-read" and "edit"/"file-change" but the code returns the raw
  value, so every consumer dispatches on both spellings — of values that never arrive.

This is stories-and-tests-driven fiction sustaining ~150 lines of adapter plus renderer
surface. Either wire real producers or cut the vocabulary to what the wire carries. The
destroyer verdict is: cut it; re-grow branches when a producer actually emits them.

## Second dead variant: `session-reference` Embed

No adapter and no production code ever constructs a `session-reference` Embed — only
stories and tests (`rg -a 'kind: "session-reference"'`). The renderer branch in
`embeds.tsx:66,101-102` filters and renders a variant that cannot occur. Delete the union
member, the renderer branch dies with it. (The `route: "session"` OpenTarget stays — it is
also the sub-agent row's route — but note that path is production-dead today too.)

## If written today, from scratch

A single `layers/core-ui/src/parts/part.ts` (+ the existing `parts/*` renderers) holding:
- `Part` union (prose, review, resolved, questionnaire, tool, reasoning*, unknown — reasoning
  only if a producer lands), `PartAuthor`, `PartGroup`, `Embed` (minus session-reference),
  `OpenTarget`, `OpenHandler`
- `derivePartsFromMessages` — the real, load-bearing adapter (Conversations surface)
- `derivePartsFromSession` — reduced to the tool_call mapping the wire actually carries
- `groupParts`
- tool-run folding inlined where SessionView uses it

No package, no `@hyperidle/harness-capability` dependency, no exported const sets.

## Kill summary
| Verdict | Count |
|---|---|
| DELETE | 9 |
| MERGE | 1 |
| SIMPLIFY | 4 |
| KEEP | 7 |
Surface: 21 exports → 12 survivors (43% export cut), package itself deleted (100% package cut)

## Feature-level kills
1. **The rich session-stream vocabulary** (reasoning/answer-delta/answer-settled/human-message
   entries, toolKind families, statuses, diffs, sub-agent recursion). Breaks: nothing a user
   can see — production never produces the data. Stories/tests that fabricate it die too.
   Hole: when real harness streaming lands, the branches must be rebuilt against the real
   emitter instead of against fixtures — which is the correct order anyway.
2. **`session-reference` Embed kind.** Breaks: two stories, one test. No production path.
3. **The package boundary itself.** Breaks: the W1 ESLint rule must be re-scoped from a
   package name to a directory glob. One-line lint config change.

## Full export audit
| # | Export | Kind | Reach | Verdict | Reason |
|---|---|---|---|---|---|
| 1 | `groupParts` | function | UI: Conversations + SessionView via PartList | KEEP | Real grouping both live surfaces run on every render; moves to core-ui. |
| 2 | `derivePartsFromMessages` | function | UI: `/conversations` (Conversations.tsx, ConversationSurface.tsx) | KEEP | The load-bearing adapter; review/resolved/questionnaire/verdict paths all have real API producers (threads.ts, coach.ts, assistant.ts); moves to core-ui. |
| 3 | `derivePartsFromSession` | function | UI: SessionView | SIMPLIFY | Production input is tool_call-only (`session-activity-buffer.ts` emits nothing else); reasoning/answer_delta/answer_settled/human_message branches + streaming merge (~100 of 140 lines) are TEST-ONLY fiction — cut to the tool_call mapping; moves to core-ui. |
| 4 | `aggregateToolRun` | function | UI: SessionView only | SIMPLIFY | Status is always "neutral" in production — running-standalone rule and failedCount never fire; degenerates to "fold runs of ≥2 tools"; inline into SessionView. |
| 5 | `deriveComposerPills` | function | UI: SessionView composer only | MERGE | Six-line find+filter; sole reason the package depends on harness-capability; composer concern, not a conversation part — inline into SessionView. |
| 6 | `PartKind` | type | none (PartList mention is a comment) | DELETE | Exported to nobody; internal use inlines into the union. |
| 7 | `ToolKind` | type | none outside package | DELETE | Dies with the TOOL_KINDS fiction; production value is always "generic". |
| 8 | `PartId` | type | none | DELETE | Alias of `string`, referenced by zero consumers. |
| 9 | `PartAuthor` | interface | UI: Conversations.tsx, SessionView.tsx | KEEP | Real author shape both adapters and pages construct; moves to core-ui. |
| 10 | `ReviewTarget` | interface | none outside package | DELETE | Internal-only; inline the `{betId, reviewId}` shape into the Part union. Note `betId` is always `""` at the only construction site (part.ts:377) — half the shape is already hollow. |
| 11 | `FoldDescriptor` | interface | DEAD | DELETE | Zero references anywhere — not even inside its own package. Pure corpse. |
| 12 | `Part` | type | UI: PartList, SessionView, all parts/* renderers | KEEP | The core vocabulary of the conversation surface; moves to core-ui. |
| 13 | `EmbedKind` | type | DEAD | DELETE | Zero references anywhere outside its own derivation line. |
| 14 | `Embed` | type | UI: embeds.tsx, ProsePart, adapters | SIMPLIFY | Survives minus the `session-reference` variant no production code ever constructs (stories/tests only); renderer branch embeds.tsx:66 dies with it; moves to core-ui. |
| 15 | `OpenTarget` | type | UI: open-handler.ts, Conversations, SessionView, ToolPart | KEEP | The real routing seam the navigate hook resolves; moves to core-ui beside open-handler.ts. |
| 16 | `OpenHandler` | type | UI: 8 production files | KEEP | The single open-hook signature every part renderer takes; moves to core-ui. |
| 17 | `PartGroup` | interface | UI: PartList, SessionView | KEEP | Return shape of groupParts; moves with it. |
| 18 | `ToolRunBlock` | type | UI: SessionView only | SIMPLIFY | Single consumer; `failedCount` is production-dead (statuses always neutral) — drop it and inline the type with aggregateToolRun into SessionView. |
| 19 | `PART_KINDS` | const | TEST-ONLY externally; internal type derivation | DELETE | No runtime production reader; inline the union literals. |
| 20 | `TOOL_KINDS` | const | TEST-ONLY externally; internal `normalizeToolKind` membership check | DELETE | An 11-member closed family for a field production never sends; contains duplicate alias pairs its own "normalizer" doesn't normalize; `sub-agent` entry gates a feature with no producer. |
| 21 | `EMBED_KINDS` | const | TEST-ONLY | DELETE | Only readers are the package's own tests asserting the const equals itself. |

## Holes this leaves
- **Session view gets honest, not worse.** After the SIMPLIFY cuts, SessionView renders
  exactly what it renders in production today: generic neutral tool rows. The rich stream
  (reasoning spans, streaming prose, statuses, diffs, sub-agent nesting) was only ever
  visible in Storybook. When a real emitter lands in `provisioner.ts`/the buffer, the
  branches must be rebuilt against real events — with `ReasoningPart.tsx` and the
  ToolPart status/diff/opensSession affordances (core-ui destroyer's turf) revived with them.
- **W1 lint boundary** (renderer must not import `Message`/harness types) must be re-scoped
  from `@hyperidle/conversation-parts` to a core-ui directory glob, or the source-agnostic
  guarantee silently evaporates. One lint-config edit; do it in the same PR as the move.
- **Two stories and a handful of unit tests** (`AM1-part.test.ts` session-reference cases,
  SessionView/ToolPart/ReasoningPart rich-stream stories, parts of `AM3-session-view.test.tsx`)
  die with the fiction they fabricate. Correct per brief: dead code plus tests that should
  die with it.
- `derivePartsFromMessages`, `groupParts`, `Part`/`Embed`/`OpenTarget`/`OpenHandler` survive
  unchanged in behavior — the conversation surface itself loses nothing.
