DESIGN-CLASS: routine  ref=KnowledgeCreate(/knowledge/new) + BetCreateDialog  pattern=packages/web/src/pages/KnowledgeCreate.tsx (live full-page create surface)

# Design brief — AG3: Bet authoring is block editing

## Why routine, not novel

Both Phase-0a axes match strongly:

1. **Existing component reference** — the spec names the parity target explicitly: "the same full-page block-editing experience I get when writing a knowledge item." That experience is already shipped as `KnowledgeCreate` at `/knowledge/new` (`packages/web/src/pages/KnowledgeCreate.tsx`). The shape to copy already exists in code.
2. **Pattern match** — the *exact same migration* already happened for Knowledge in Q2: the "+New" button stopped opening `KnowledgeCreateDialog` (overlay) and started navigating to `/knowledge/new` (full-page route). See `KnowledgeList.tsx:23-24, 1079`. AG3 is the same migration applied to bets.

This is a port of a proven, live pattern — not an open design space. Per the design skill's routine track: one variant honoring the named pattern, plus an explicit rejected-directions list. No new design-system primitive is introduced.

Low-confidence flag NOT triggered: the in-session critique on the single variant scores Anti-slop / Hierarchy / States all ≥ 7 (see comparison.md).

## What is actually being changed (precise scope)

The founder's complaint is about **create**, not edit. Confirmed by reading the code:

- **Bet *edit* already has parity.** `WorkBet.tsx:1391-1464` renders the bet pitch through a full-page `BodyEditor` with autosave + a "Saving…/Saved/Save failed" indicator (`useBetDescriptionSave`), identical in shape to `KnowledgeDetail` edit. Bet content already derives into `Block[]` via `deriveBlocks(description, { kind: "bet", id })` (`WorkBet.tsx:194-197`). AC "Editing an existing bet's content offers the same experience as editing a knowledge item's body" is **already satisfied**; AG3 must preserve it and visually verify it, not rebuild it.
- **Bet *create* is the gap.** `BetCreateDialog.tsx` is a `Dialog` (size md) wrapping a `BodyEditor` at `minHeight="160px"` inside a form, plus a team `Select` (shown only for multi-team) and a title preview. This is the "wrong editor" — a cramped box. The work is to replace this with a full-page create surface at `work/bet/new`, mirroring `KnowledgeCreate`.

## Reuse inventory (hard gate)

Every visual element the new bet-create surface needs, mapped to an existing component. Zero `NEW` entries — this is the strongest possible reuse story.

| Element | Source | Notes |
|---|---|---|
| Full-page shell (header + scroll body) | Copy layout from `KnowledgeCreate.tsx` | Same `flex flex-col h-full` + bordered header + `max-w` centered two-column body. Not a new component — page-level composition. |
| Breadcrumb (`Work / <team> / New`) | Same markup as `KnowledgeCreate` nav + `WorkBet.tsx:910-927` breadcrumb | `<Link>` + text. |
| Title input (editable, derived preview) | Plain `<input>` styled like `KnowledgeCreate.tsx:128-150` | Bet title is *derived* from the pitch (`deriveTitleFromPitch`), so this is a read-only **title preview**, not an editable input — see synthesis. |
| Rich body editor | `BodyEditor` (`@hyperidle/design-system`) | Reused AS-IS, `variant="full"`. The single editor component. No second editor. |
| Cancel / Create actions | Pill buttons, same as `KnowledgeCreate.tsx:152-168` | Create disabled until body non-empty + team resolved. |
| Team picker | `Select` (`@hyperidle/design-system`) — the AG5 shared dropdown | Same component BetCreateDialog uses today. Shown only when >1 team. |
| Appetite picker | `Select` (currency) + `Input`/number — same shape as `AppetiteDialog` in `WorkBet.tsx:455-531` | Optional at create (API `costAppetite` is optional). |
| Commitments container (aside) | `<aside>` metadata card, same as `KnowledgeCreate.tsx:210-259` | Holds team + appetite. Mirrors Knowledge's scope aside. |
| Error line | `role="alert"` text, same as `KnowledgeCreate.tsx:181-189` | |
| Save indicator (edit surface) | Already present in `WorkBet.tsx:1397-1428` | Preserved as-is. |

## Interrogated decisions (resolved from code + spec; no open probes)

1. **Who / what decision.** A founder shaping a new bet — the highest-leverage writing they do. Decision: write the pitch, optionally commit team + appetite, then create. Read confirmed.
2. **Smallest surface that delivers the outcome.** A full-page route `work/bet/new` reusing `BodyEditor`, with commitments in a right aside. Not a wizard, not multiple steps.
3. **Where commitments live relative to writing.** In a right-hand `<aside>` metadata card, exactly like Knowledge's scope aside — present but never crowding the writing column. This is the spec's "present but not crowding" requirement, solved by the established Knowledge pattern. Rejected: inline-above-editor (crowds), modal-after-write (two-step, breaks the "feels like a document" goal).
4. **Create vs edit symmetry.** Edit lives in `WorkBet` (full-page, autosave). Create lives in `work/bet/new` (full-page, explicit Create button — nothing to autosave-to until the bet exists). This asymmetry is intentional and matches Knowledge exactly (`/knowledge/new` has a Create button; `KnowledgeDetail` autosaves). Confirmed against `KnowledgeCreate.tsx` lore W-01.
5. **Abandoning mid-write.** Full-page create holds all state in React; nothing is POSTed until "Create". Navigating away (Cancel → `/work/portfolio`, breadcrumb, or browser back) discards local state — **no half-created bet**, because no bet row exists until the POST succeeds. This is structurally how Knowledge avoids draft artifacts. The current dialog already has this property; the route preserves it. (Contrast: AG3 must NOT introduce a server-side draft-on-open.)
6. **Title.** Bet title is derived (`deriveTitleFromPitch`), never typed — current dialog shows a "Title preview". Knowledge has a typed title input. So the bet create header shows the *derived title* as a live preview in the header title slot, not an editable input. This is the one shape difference from Knowledge, and it is correct — it honors the established bet contract that title is derived from the pitch.
7. **Backward compatibility.** API POST `/api/bets` unchanged (`createBetSchema` already accepts optional `costAppetite`). Bets created before AG3 render through the same `deriveBlocks` pipeline — unchanged.

## Mobile

Three-tab layout. The right aside (commitments) collapses below the editor (single column, `flex-col`) at narrow width — same responsive collapse the bet detail outcome section uses (`grid-cols-1 sm:grid-cols-2` pattern, `WorkBet.tsx:1170`). Inputs ≥16px font (AQ-005).
