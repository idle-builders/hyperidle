# AK4 — Concept: the Assistant can draft and shape a bet

**Level:** per-workpackage. **Verdict:** PROCEED (no `concept-missing`). All load-bearing nouns are already locked; AK4 introduces no new primitive. The only genuine concept work is (a) confirming the **authority boundary** of an Assistant bet-drafting capability against ETHOS User Sovereignty, and (b) naming one reshaped relationship: **an Assistant conversational turn may now author a draft bet as a side effect of a reply.**

This concept inherits, as fixed inputs, the kernel/strategy split (`docs/architecture/kernel-strategy-split.md`) and the bet primitive (`docs/process-layer/bets-shape-commit-change-ship.md`). It must not contradict either.

---

## Required reading (downstream `/architecture`, `/design` must read)

- `docs/process-layer/bets-shape-commit-change-ship.md` — bet lifecycle (`draft | active | completed | killed`), `description` is the body, draft is editable, commit is the human gate.
- `docs/architecture/kernel-strategy-split.md` §1–§4 — Assistant runs on the **Kernel** agent runtime; harness nouns (system prompt, AGENTS.md, sandbox, session, tools/Skills/MCP); cost stays Kernel-side.
- `ETHOS.md` §3 User Sovereignty — AI recommends, humans decide; never irreversible without approval.
- AH3 as-built (read the code, the spec's "what exists" is STALE):
  - `packages/server/src/services/assistant-turn.ts` — `runAssistantTurn` already produces substantive replies.
  - `packages/server/src/harness/builtin-harness-adapter.ts` — `runChatTurn` (conversational, `tools: []`) vs `runLoop` (task planning, full tool-use).
  - `packages/server/src/tools/assistant-tools.ts`, `create-bet.ts`, `edit-bet.ts` — tools EXIST but are not wired into the turn.
  - `packages/server/src/routes/threads.ts` ~1342 — the human-message → `runAssistantTurn` trigger.
  - `packages/web/src/shell/AssistantOverlay.tsx` — renders `payload.toolCalls` summary rows + `BlockRefEmbed` cards.
  - `packages/web/src/pages/WorkBet.tsx` — bet authoring surface: `description` markdown → `deriveBlocks` (AG3), editable in `draft`/`active`.

---

## Phase 0 — The nouns

| Noun | Working definition | Classification |
|---|---|---|
| **Assistant** | The per-user individual agent (`ast-${userId}`) that runs on the Kernel runtime and converses in the user's pinned thread. | **Stable** (AD8b/AH3) — used as-is. |
| **Bet** | A time-boxed unit of committed work; body is `description` markdown rendered as blocks (AG3); lifecycle `draft → active → completed/killed`. | **Stable** (U1/AG3) — used as-is. |
| **Draft (bet status)** | The pre-commit, fully-editable state of a bet. Nothing acts on a draft; the human commits it. | **Stable** — used as-is. |
| **Assistant turn** | One human-message → Assistant-reply cycle (`runAssistantTurn`). Today: a single chat completion with `tools: []`. | **Reshaped** — gains the ability to call tools (specifically `create_bet`/`edit_bet`) and thereby author a draft bet within a reply. |
| **Drafting** | The act of an Assistant turn producing/updating a draft bet derived from the conversation. | **New relationship** (not a new primitive) — the edge from an Assistant turn to a draft bet. |

Only **Assistant turn** (reshaped) and **Drafting** (the new edge) need probing. Everything else is an input.

---

## Phase 1 — Probe the essence (Assistant turn + Drafting)

**1. Identity.** An Assistant turn is *one conversational reply cycle that may have a structured side effect.* Today it is purely a text reply. AK4 makes it a reply that **may also author or update exactly one draft bet** via a tool call, surfaced inline in the same thread. It is NOT a task session, NOT a bet-authoring form, NOT a separate "draft mode."

**2. Essential properties.** Every Assistant turn: (a) ends in a persisted reply or a persisted notice — *never silent* (AH3 invariant, preserved); (b) reads the full thread transcript as context; (c) runs on the Kernel runtime via the builtin adapter + AdapterPool; (d) is task-free (no task/bet row provisioned for the turn itself — the @lore AH3 §A design-it-twice decision). When drafting: (e) the bet it authors lands in `draft` status; (f) the founder is shown what was drafted and where to find/edit it.

**3. Rejection list (drafting).**
- Drafting is **not committing.** The Assistant authors a `draft`; the human runs `POST /bets/:id/commit`. The Assistant has no commit tool and never will (locked by Sovereignty + AK3 boundary).
- Drafting is **not decomposition.** Turning a committed bet into tasks is AK3, fires on `draft→active`, and is explicitly out of AK4 scope. The Assistant produces the bet *before* commit; it never triggers work.
- Drafting is **not a new content dialect.** The bet body is the same `description` markdown → AG3 blocks. No "assistant draft format," no parallel editor.
- Drafting is **not a wizard / blank form.** The whole point is conversation-first: the draft is derived from the transcript, not collected field-by-field.
- Drafting is **not autonomous bet creation.** A bet only appears when the conversation calls for one (the founder asks, or the Assistant proposes and the turn authors a draft); it is always reviewable and reversible (a draft can be edited or discarded).

**4. Composition.** An Assistant turn carries: the thread transcript (context in), a reply message (text out), and — when drafting — zero-or-one `create_bet`/`edit_bet` tool call. The authored draft bet attaches to a **team** (`teamId`, required by the bet schema) and carries `description` (+ optional `doneCondition`, `hypothesis`). The reply message surfaces the draft via the existing `payload.toolCalls` summary rows and/or a block/bet ref the overlay can render and link to WorkBet.

**5. Lifecycle.** Turn: `triggered → (reply | notice)`. The authored bet enters the *existing* bet lifecycle at `draft` and proceeds exactly as a hand-typed draft: editable in WorkBet, committed by the human. Iteration (AC4): a subsequent turn referencing the same draft calls `edit_bet` to update `description`/`doneCondition`/`hypothesis` in place — same draft id, no new bet. The draft is identified across turns by the most-recent draft bet the Assistant authored in this conversation (architecture decides the exact binding; concept requires *one* draft per drafting thread of conversation, updated in place, not a new draft per message).

**6. Authority.** The Assistant **produces and mutates drafts**; the **human commits**. Source of truth for the bet is the `bets` table; the Assistant writes through the same `create_bet`/`edit_bet` tools any agent would, gated to the `assistant` role (already enforced in `tool-registry.ts`). The Assistant never calls commit/ship/kill. This is the Sovereignty line, restated: *recommend and draft, never decide the irreversible.*

**7. Vocabulary collision.** None. "draft" already names the bet status (no clash — drafting *produces a draft*). "Assistant" is the locked individual-agent noun (CoS/coach purged). "create_bet"/"edit_bet" are existing tool names. The HIGH_RISK_TOOLS set in `assistant-tools.ts` already lists `create_bet`/`edit_bet` as requiring "human approval" — see the contract note below; AK4 must reconcile this with "a draft IS the approval surface."

---

## Phase 2 — Rejection list (consolidated, with reasons)

1. **A drafted bet is NOT committed work.** Reason: Sovereignty — commit is the irreversible-ish gate that starts decomposition (AK3); the human must own it.
2. **Drafting is NOT a separate editor or content format.** Reason: AK4 contract "no new content dialect" — the bet body is `description` markdown → AG3 blocks, period. The founder edits the draft in WorkBet, the same surface a hand-typed bet uses.
3. **The Assistant turn is NOT a task session.** Reason: AH3 design-it-twice (@lore §A) — provisioning a real session would pollute tasks/bets with fake rows and couple chat to the task state machine. The drafting turn reuses only AdapterPool + harness + tool registry, never `provisionSession`.
4. **Drafting does NOT spawn a new draft per message.** Reason: AC4 says the draft *updates* as the founder iterates — one living draft per drafting conversation, edited via `edit_bet`, not a graveyard of near-duplicate drafts.
5. **The Assistant does NOT need a fresh `create_bet` capability.** Reason: it already exists (`create-bet.ts`), is role-gated to `assistant`, and produces `draft` status. AK4 wires it into the turn; it does not invent it.

---

## Phase 3 — Vocabulary (locked)

| Term | Definition | Aliases not to use |
|---|---|---|
| **Assistant** | The per-user individual agent `ast-${userId}` that converses in the user's pinned thread. | CoS, Chief of Staff, coach, copilot |
| **Assistant turn** | One human-message → reply cycle (`runAssistantTurn`); may author/update one draft bet. | chat round, exchange, session (a turn is task-free, not a session) |
| **Draft bet** | A bet in `draft` status — fully editable, not yet committed, nothing acts on it. | proposal, pitch (pitch was renamed to `description`), suggestion |
| **Drafting** | An Assistant turn authoring or updating a draft bet via `create_bet`/`edit_bet`. | proposing-and-committing, auto-creating |
| **Commit** | The human-only `POST /bets/:id/commit` (`draft→active`). | publish, submit, approve-and-start (the Assistant never does this) |
| **bet body** | The `description` markdown field rendered as AG3 blocks. | pitch, concept doc (the *content* is the concept; the field is `description`) |

---

## Phase 4 — Contracts

- **Cardinality.** A drafting conversation maintains **at most one active draft bet** at a time; iteration edits it in place. (Architecture binds "which draft" — most-recent assistant-authored `draft` bet in the conversation.)
- **Closure.** No new bet status. No new tool. No new message type — the draft is surfaced via existing `payload.toolCalls` rows + block/bet ref rendering. Adding any of these would be a concept change, not an architecture choice.
- **Mutability.** The Assistant may mutate a bet **only while `status = 'draft'`** (and only via `edit_bet`). Once the human commits (`draft→active`), the Assistant must not edit it through the conversational path. (`edit-bet.ts` today does not check status — architecture/AC must constrain Assistant edits to draft, or rely on the conversational binding never re-targeting a committed bet.)
- **Identity.** The bet keeps its opaque `id` across iterations; `edit_bet(betId, …)` targets it. The turn has no persisted id (task-free).
- **Hard rules.**
  1. **No autonomous commit.** The Assistant has no path to `commit`/`ship`/`kill`. Drafting always terminates at `draft`. *Violating this breaks the concept.*
  2. **Never silent.** Every turn ends in a persisted reply or notice (AH3 invariant carried forward), including drafting turns.
  3. **Draft = the editable review surface.** The founder reviews/edits the draft in WorkBet (AG3) before committing. The "human approval" the HIGH_RISK_TOOLS comment references IS the draft + commit gate — *not* a blocking pre-execution review modal that would stop the Assistant from producing the draft in the first place. (AK4 must resolve this: a draft bet is inherently reversible, so authoring it is not the irreversible action Sovereignty guards; the irreversible gate is commit. Architecture should treat `create_bet`/`edit_bet` at `draft` status as *not* requiring a pre-execution human gate — the draft itself is the approval surface.)
  4. **One runtime.** Reuse the Kernel harness + tool registry; no second/parallel agent runtime (per AK4 contract + AH3 @lore §A).

---

## Phase 5 — Ground-truth updates

No new `docs/<topic>/<noun>.md` primitive doc is warranted — AK4 introduces no primitive. The reshaped relationship is small and lives best as an addendum:

- **`docs/process-layer/bets-shape-commit-change-ship.md`** — add a short "Bet origination" note: a draft bet may be authored by the Assistant within a conversation (AK4), and proceeds through the identical lifecycle thereafter; the human always commits. (Defer the actual edit to `/write-docs`; flagged here for that phase.)
- **`docs/architecture/kernel-strategy-split.md`** — no change needed; the Assistant drafting runs entirely Kernel-side and uses the existing harness/tool nouns.

This concept doc (`plans/AK4/concept.md`) is the fixed input for `/architecture`.

---

## Phase 6 — Self-critique

- **Rejection list distinct?** Yes — five rejections span four different axes (commit vs draft; format; runtime; cardinality; pre-existing capability), not flavours of one.
- **Vocabulary collision?** Verified via grep: "draft" is the bet status; "drafting" is the act; no clash. "Assistant" is the locked noun (CoS/coach purged). HIGH_RISK_TOOLS lists create_bet/edit_bet — surfaced as Hard rule #3, the one real tension AK4 must resolve, not silently inherit.
- **Contracts complete?** Cardinality (one draft/conversation), closure (no new status/tool/message type), mutability (draft-only edits), identity (opaque bet id across iterations), hard rules (no autonomous commit, never silent, draft=review surface, one runtime). The "which draft to edit" binding is correctly deferred to architecture (it's a mechanism, not a concept).
- **Rationale concrete?** Yes — cites the AH3 task-free @lore decision, the U1 status simplification, the HIGH_RISK_TOOLS tension, and the AK3/AK4 boundary.
- **Right files touched?** Concept doc written; two ground-truth files flagged for `/write-docs` (no premature edits).

**Rationale (why this shape).** The founder's wedge is *Plan → Interact → Review → Repeat*, entered through conversation. AH3 already made the Assistant talk; AK4's narrow job is to let that conversation *deposit a draft bet* without crossing the Sovereignty line. The temptation is to over-build — a draft mode, a proposal/approval modal, a new content format, a second runtime. The concept rejects all of these: a draft bet is *already* the reversible review surface, the bet body is *already* AG3 blocks, and the turn *already* runs on the Kernel harness. The single real reshape is giving the conversational turn a tool-use path so it can call `create_bet`/`edit_bet` — and the single real tension (HIGH_RISK_TOOLS' "requires approval") is resolved by recognizing that authoring a *draft* is not the irreversible act; commit is.
