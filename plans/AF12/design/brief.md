DESIGN-CLASS: routine  ref=WorkBet-overflow-menu+AppetiteDialog+TaskSheet+SessionRow  pattern=WorkTask-sessions-section

# AF12 Design Brief — interrogated

## User + decision

A **founder** on the Work surface, managing a bet through its lifecycle. Four micro-decisions, four existing surfaces:

1. **Activate a draft bet** — "this bet is ready, start the team." Decision surface: WorkBet header overflow menu (`bet-overflow-menu`, `WorkBet.tsx:1015`). Today: no control. The endpoint (`POST /bets/:id/commit`) exists.
2. **Set/adjust appetite** — "this bet should cost at most $X." Decision surface: `AppetiteDialog` (`WorkBet.tsx:477`). Today: a leftover *duration* picker that sends a string → server 400s.
3. **Kill a bet, honestly** — "abandon this; stop the work." Decision surface: `ConsequencePreviewDialog` (`WorkBet.tsx:325`). Today: copy promises a cascade that doesn't happen (architecture wires the cascade; design only audits copy honesty).
4. **View a task's sessions** — "what runs/ran on this task?" Decision surface: `TaskSheet` (`WorkBet.tsx:1618`) + the already-built WorkTask sessions section. Today: WorkTask section is permanently empty (endpoint missing); TaskSheet has no sessions section at all.

## Smallest surface that delivers each outcome

- Activate: **one menu item** in the existing overflow dropdown, shown only when `status === 'draft'`. No new dialog — activation is non-destructive (it's the happy path), so it goes straight through, mirroring how `ship` has no confirm. (Optional reason already supported by the endpoint but not required.)
- Appetite: **rewrite the body of the existing `AppetiteDialog`** — swap the `<select>` of duration strings for a money input (amount + currency). Same dialog chrome, same reason field, same non-skippable pattern. Emits `WireMoney`.
- Kill: **no UI change** beyond making the dialog copy match the architecture's actual cascade boundary (state-truth cascade now real; live-process abort is AF7). Copy audit only.
- Sessions: **add a sessions section to `TaskSheet`** reusing the exact `SessionRow` + `LiveDot` + `useTaskSessions` pattern already shipped in WorkTask. Architecture adds the missing endpoint so both surfaces populate.

## Primary state

Populated. Bets being managed already have tasks/sessions. But sessions-empty is a real first-load state (a task with zero sessions yet) and must render an honest empty line, not a blank.

## Composition (named)

- Overflow menu items: plain `<button data-dropdown-item>` (existing pattern, `WorkBet.tsx:1033-1065`).
- AppetiteDialog: native `<dialog>` (existing), DaisyUI `input` (number) + `select` (currency) + `textarea` (reason). No new component.
- Sessions in TaskSheet: lift the `SessionRow` shape from WorkTask (it currently lives co-located in WorkTask; architecture decides whether to extract or duplicate — see open questions). Uses `LiveDot` (existing design-system) + `useTaskSessions` (existing hook).

## Unsettled → resolved reads

- *Currency selector or USD-only?* → Include the currency `<select>` (closed enum `CURRENCY_CODES`), defaulting to the bet's current currency or USD. The money contract is currency-aware; a USD-only input would re-invent a narrower shape, violating the WP constraint to reuse the money shape. Small cost: one extra select.
- *Appetite editable on draft?* → No. Server `patchCostAppetite` allows mutation only in `active` (`bets.ts:305`). Hide "Adjust appetite" for draft (currently shown for draft+active, `WorkBet.tsx:1033`). Set appetite at creation (BetCreateDialog already takes `costAppetite`) or after activation. This removes a guaranteed-400 path.
- *Sessions list location — TaskSheet, WorkTask, or both?* → Both. WorkTask already renders it (just starved of data); TaskSheet is the in-context peek from the bet page and currently shows none. AC4 says "viewable from the task surface" — TaskSheet IS a task surface reached from the bet.
