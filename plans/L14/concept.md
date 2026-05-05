# L14 — Concept

## Phase 0: Noun identification

L14 uses these nouns with design weight:

| Noun | Candidate class |
|---|---|
| **Bet** | Stable — fully defined in `docs/process-layer/bets-shape-commit-change-ship.md`, `docs/process-layer/the-five-primitives.md`, `docs/requirements/functional-requirements.md §F-2.1`, implemented in `packages/server/src/services/bet-state-machine.ts` |
| **BetAction** | Not a primitive — an operation on a Bet. No concept doc needed; its shape is fully determined by the existing state-machine transitions. |
| **ConsequencePreview** | UI affordance — a non-modal gate before a destructive BetAction commits. Not a primitive; it is a presentation artifact of the Human Interface layer. No concept doc needed beyond what the design phase produces. |
| **RevisionLog / RevisionLogEntry** | Stable — defined in `docs/process-layer/canonical-shapes.md` ("RevisionLogEntry shape (for bets)"), implemented in `bet-state-machine.ts:13-21`. |
| **Appetite** | Stable — the closed enum `"1 week" | "2 weeks" | "6 weeks"` on a Bet. Defined by L4 concept. Anti-pattern "duration as budget axis" is locked in `docs/process-layer/wip-and-cost-limits.md §10.7`. |

## Verdict: concept verified, no new primitives

None of the central nouns in L14 require a new concept doc or reshape an existing one. All load-bearing concepts are already locked:

- **Bet** and its lifecycle: `docs/process-layer/bets-shape-commit-change-ship.md` §5.4 Change
- **BetStatus** state vocabulary: `packages/shared/src/types.ts` — `BET_STATUSES` includes `paused` and `killed`
- **Valid state transitions**: `packages/server/src/services/bet-state-machine.ts` — `VALID_TRANSITIONS` map already models `in_progress → paused`, `paused → in_progress`, `in_progress → killed`, etc.
- **RevisionLogEntry**: `docs/process-layer/canonical-shapes.md` §1 + `bet-state-machine.ts:13-21`
- **Appetite enum**: `packages/server/src/routes/bets.ts:20` — `BET_APPETITES = ["1 week", "2 weeks", "6 weeks"]`
- **Money + TokenUsage**: L4 concept, `docs/process-layer/canonical-shapes.md` §2 — not yet wired to UI (that is L17), but the types are settled

## What L14 IS

L14 is an **operation surface**: it wires the existing state-machine transitions to a human interface affordance layer on the WorkBet detail page, and enforces the consequence-preview gate before destructive transitions. No new concepts. The work is:

1. Expose the four human-valid bet actions (pause, kill, adjust-appetite, unblock/comment) via API endpoints and a UI action bar.
2. Enforce a non-skippable consequence preview dialog before destructive actions (kill, pause).
3. Ensure every action writes a RevisionLogEntry (already enforced by `transitionBet` and `updateBetField` — just needs to reach the UI).
4. Replace hardcoded BetCard fixtures with real data per the L6 inventory row.

## What ConsequencePreview is NOT

- Not a new primitive. It is a UI dialog pattern, implemented with DaisyUI `<dialog>` or a design-system modal-equivalent. No concept doc needed.
- Not an audit log. The RevisionLog is the audit trail; the ConsequencePreview is a forward-looking gate (shows what WILL happen, not what happened).
- Not a general-purpose confirmation dialog. It carries bet-specific consequence data: "What stops", "What continues", "What's saved". Its specificity to destructive bet actions is the whole point.
- Not a review thread. The unblock/comment action posts to the existing HostThread (L18 primitive). ConsequencePreview is orthogonal to threads.

## Required reading for /design and /architecture

- `docs/process-layer/bets-shape-commit-change-ship.md` — §5.4 Change (the conceptual grounding for bet-level human intervention)
- `docs/process-layer/wip-and-cost-limits.md §10` — appetite is Money + TokenUsage, not duration
- `docs/process-layer/canonical-shapes.md` — RevisionLogEntry shape; Money + TokenUsage shape
- `packages/server/src/services/bet-state-machine.ts` — existing transitions, VALID_TRANSITIONS, updateBetField
- `packages/server/src/routes/bets.ts` — existing endpoints; what's missing (pause, resume)
- `packages/web/src/pages/WorkBet.tsx` — existing detail page structure
- `packages/shared/src/types.ts` — BET_STATUSES, MUTABLE_BET_FIELDS
- `packages/design-system/src/BetCard.tsx` — `actions` prop slot already available
- `plans/reviews/hardcoded-data-inventory.md` — the L14/L17 row ("WorkBet.tsx cost strings and appetites")
- `docs/human-interface-layer/` — for the Approve/Reject/Request Changes/Snooze verdict grammar (the ConsequencePreview confirm/cancel maps to a subset of this)

## Vocabulary lock

| Term | Definition | Aliases NOT to use |
|---|---|---|
| **BetAction** | An operation a human performs on a Bet: pause, kill, adjust-appetite, comment/unblock | bet command, bet mutation, bet operation |
| **ConsequencePreview** | The non-skippable dialog shown before a destructive BetAction that states what will stop, continue, and be saved | confirm dialog, are-you-sure, warning modal |
| **RevisionLogEntry** | A single immutable record appended to `bet.revisionLog` capturing field, old_value, new_value, reason, timestamp | audit entry, change log item, history record |
| **Appetite** | Closed enum `"1 week" | "2 weeks" | "6 weeks"` — a budget-size signal, not a duration cap | timebox, duration, deadline, sprint length |

## Self-critique

Rejection list is concrete and differentiated — ConsequencePreview vs. audit log vs. review thread are three distinct things, not flavors of one. Appetite alias rejection is load-bearing (L4 anti-pattern is explicit). No concept-level gap was identified. All nouns check out against the existing codebase and docs.
