# L16 — Design (approved, single variant)

## Why one variant

The Block primitive landed in L2 with its own design exploration, critique, and approval. The renderer, gutter, focus ring, surface ladder, and density are all already specified in `packages/design-system/src/Block.tsx` and `packages/design-system/src/block/*`. L16 is **slot-in**: the page-level decision is "where do the blocks live in the WorkBet page, and what (if anything) wraps them." That's a small surface — one variant + an edge-case checklist is the right shape.

## Approved variant — "Document section, no chrome"

**Placement.** Below the `BetCard`, above the `Tasks` heading — exactly where the `<pre>` lives today (between line 254 and line 270 of `WorkBet.tsx`).

**Container.** A bare `<section aria-label="Bet pitch" data-testid="bet-pitch">` containing the iterated `<Block />` children. **No card chrome, no `bg-base-200` background, no rounded surface.** The `<pre>`'s previous `bg-base-200 rounded p-3` is removed entirely. Reasons:

1. The Block primitive already sets its own surface treatment (`hover:bg-[var(--surface-ghost)]`, padding `py-[6px]`, gutter column). Wrapping it in another colored surface creates a card-on-card and breaks the surface ladder (AQ-012).
2. The pitch is a doc, not a card. The user reads it like prose. The BetCard above it is the card; the pitch is the body the card metadata describes.
3. Compositionally, this matches how L23 will render knowledge bodies — same primitive, same lack of chrome — so the two consumers stay coherent.

**Vertical rhythm.** A single `gap-2` (8 px) above and below the `<section>`, inherited from the parent `flex flex-col gap-3` (12 px) on the page root. No extra margin tweaks. Block-internal padding (`py-[6px]`) supplies the inter-block rhythm.

**Empty state.** When `bet.pitch` is empty / whitespace-only, `deriveBlocks` returns `{ blocks: [] }`; the `<section>` is omitted entirely (mirrors today's `{bet.body && (…)}` guard, just on a renamed field). No "No pitch yet" empty-state — the absence is the message. Rationale: a bet without a pitch is a degenerate state; a chip or empty-state would invite the user to *add* a pitch from this surface, which L16 does not own.

**Interaction.** Block already provides `tabIndex=0`, `↑/↓` block stepping, `Enter`/`Space` to open actions. L16 does NOT pass `onOpenActions` or `onCopyPermalink`. Result: keyboard navigation between blocks works; activation is a no-op. **This is intentional** — the affordances exist structurally in the DOM (Block-side), but the host-side wiring lives in L18 (per-block discussion). When L18 lands, the only WorkBet diff is two prop callbacks plus a `BlockHandle` slot via `slots.gutterLeading`.

**Stories.** `WorkBet.stories.tsx` adds:
- `WithRichPitch` — fixture with H1/H2 headings, paragraphs, an unordered list, a fenced code block, and a blockquote.
- `EmptyPitch` — `pitch: ""`. Asserts the `<section>` does not render (Vitest), or simply doesn't appear in the screenshot.
- `MalformedPitch` — fixture whose pitch contains an mdast node mapping to `kind: "unknown"` (e.g., a YAML frontmatter block at the top). Visual proof that the `UnknownPayload` fallback renders without crashing or breaking the surrounding visual rhythm. Sized small — well under L2's 256 KB byte cap; the body-too-large path is not exercised in stories.

Existing stories (`KnownBet`, `ShapedBet`, `UnknownBet`, `Loading`) keep their names but the fixture data moves to `packages/web/src/pages/__fixtures__/work-bet-fixtures.ts` and the field is renamed `body → pitch`. Stories pass `overrideBet={MOCK_BETS.b1}` (per architecture §A — `overrideBetId` is removed). Per AC-3, fixtures are allowed in `__fixtures__/`, stories, and tests; an ESLint `no-restricted-imports` rule prevents production code from importing from `__fixtures__/`.

**Pitch / Tasks / Comments h2 asymmetry — acknowledged.** Tasks and Comments each carry a small uppercase h2 chrome label; the Pitch section deliberately does NOT. The pitch is documentary prose with its own internal heading hierarchy — chrome labels are reserved for *list-shaped* sections (stacks of repeating rows). A body section earns no label.

## Did we consider …

- **A bordered card surface around the blocks?** Rejected. Adds chrome, breaks the surface ladder, signals "data" instead of "prose."
- **A fenced "Pitch" heading above the blocks (matching the "Tasks" / "Comments" h2 pattern)?** Rejected. The pitch is the body, not a side panel — its own H1 inside the markdown supplies hierarchy. Adding a chrome heading either competes with the markdown's first heading or, if the pitch starts with a paragraph, awkwardly re-headers it.
- **Truncation / "Read more" for oversize pitches?** Rejected for v1. L2's `body-too-large` path already produces a single `unknown` block with `reason: "body-too-large"`; the existing `UnknownPayload` renders a fallback. That's the cap. Real-world pitches are bounded by the 256 KB byte cap (`MAX_BODY_BYTES`).
- **Wiring `BlockHandle` + `BlockActionsPopover` here?** Rejected — not in L16 ACs. Deferred to L18, which owns per-block thread anchoring (where the affordance is meaningful — there's nothing to "discuss" if the discussion surface isn't built yet). Block exposes `slots.gutterLeading` and `onOpenActions`; L18 fills them.
- **A "no pitch yet" empty state?** Rejected — see "Empty state" above.
- **Mobile sheet adaptation for actions?** N/A — actions aren't wired in L16. Becomes L18's concern when actions land.

## Edge case ledger (verified, not designed away)

| Case | Behavior | Source |
|---|---|---|
| `pitch === ""` | `<section>` omitted; nothing renders. | `deriveBlocks` returns `{ blocks: [] }` for empty body (`derive-blocks.ts:328`). |
| `pitch` is whitespace only | Same as empty — no blocks emitted. | `derive-blocks.ts:333`. |
| `pitch` only paragraphs (no headings) | All blocks render as `paragraph` kind, no outline-path nesting; ids stable. | Verified by L2 unit tests (`derive-blocks.test.ts`). |
| `pitch` mixes headings, lists, quotes, code, table | Each top-level mdast node becomes one Block; each renders via its dedicated `*Payload.tsx`. | `render-payload.tsx` switch. |
| `pitch` contains `<script>…` HTML | Renders as `html` kind via `HtmlPayload`, which passes raw through `sanitizeHtml` if provided, else escapes. L16 does NOT pass a sanitizer — falls back to escape (safe by default). | `Block.tsx:65,123` + `HtmlPayload`. |
| `pitch` has unrecognised mdast (footnote, frontmatter, etc.) | One `unknown` block with `reason: "parser-unrecognised"` rendered via `UnknownPayload`. | `derive-blocks.ts:269-274`. |
| `pitch` exceeds 256 KB | One `unknown` block with `reason: "body-too-large"`. | `derive-blocks.ts:300-325`. |
| Bet has no body at all (field absent / null) | Rename to `pitch ?? ""` at the read site; same as empty case. | Page-side guard. |
| Re-render with same content | `bet.pitch` reference may change; `deriveBlocks` is pure but expensive. Wrap in `useMemo([bet.pitch, betId])`. Block ids stay identical across renders by L2's deterministic hash. | L2 contract. |

## Acceptance criteria coverage (this layer only)

| AC | How this design satisfies it |
|---|---|
| AC-1: pitch renders as styled blocks; `<pre>` replaced. | The `<pre>` is deleted; `<Block />` instances replace it. |
| AC-5: e2e `#` symbol invisible. | `Block` heading kind renders as real `<h1>`/`<h2>`; raw `#` is consumed by mdast. |

The remaining ACs (id stability, round-trip lossless, fixtures-in-tests-only) are architectural / test-strategy concerns; covered in `architecture.md`.

## Token / class audit

- No new colors, radii, shadows, or font sizes introduced. The `<section>` carries no class beyond a `data-testid` and `aria-label`. All visual treatment is delegated to the Block primitive.
- AQ-001 / AQ-002 (off-grid spacing): N/A — no inline padding or gap on the section.
- AQ-008 / AQ-101 (raw colors / `rounded-2xl`): N/A — no styling.
- AQ-104 (no hero in `pages/work/**`): respected — this is documentary prose, not a hero.
