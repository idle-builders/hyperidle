# L16 — Concept probe

## Verdict

**L16 does NOT introduce a new primitive.** It is the first runtime consumer of the existing **Block** primitive shipped in L2. The two load-bearing nouns this story touches — `Block` and `Pitch` — are both already settled.

## What's already locked (and not re-litigated here)

- **Block** — concept owned by `docs/blocks/`; types in `packages/shared/src/blocks/types.ts`; renderer in `packages/design-system/src/Block.tsx`; derivation in `packages/shared/src/blocks/derive-blocks.ts`. A `Block` is one top-level mdast node mapped to one of 10 closed `BlockKind`s, carrying `id` (deterministic blake2s), `payload` (typed), `source` (host + range + bodyDigest), `anchor`, and `order`. Re-derived from the markdown body — never authored, never persisted as a row.
- **Pitch** — already a `text("pitch") NOT NULL` column on `bets` (`packages/db/src/schema.ts:66`). Free-form markdown. The `MockBetDetail.body` field in `WorkBet.tsx:38` is a client-only alias of that column; persistence already calls it `pitch`.

## What L16 does (and does not do)

- L16 swaps the `<pre>{bet.body}</pre>` fallback at `WorkBet.tsx:262-267` for `deriveBlocks(pitch, { kind: "bet", id: betId }).blocks.map(b => <Block id={b.id} payload={b.payload} />)`.
- L16 is `BlockHostKind = "bet"` — that constant already exists in the L2 type union.
- L16 does NOT add new affordances. **No BlockHandle, no BlockActionsPopover wiring.** The L16 ACs require styled rendering and stable ids, NOT hover-actions or per-block discussion. Per-block discussion attaches in L18 (`docs/blocks/`-anchored threads, depends on L1 + L16). Keeping L16 to renderer-only is consistent with the spec ("structural anchor it needs" — anchoring exists in `Block.id`; L18 is what *uses* it).
- L16 does NOT change the on-disk format. Markdown stays markdown.
- L16 does NOT introduce a `Block` editor. Edits to the pitch live elsewhere (out of scope).

## Probes settled

### Probe 1 — Is "pitch body" a new noun, or just `bets.pitch` rendered as blocks?

**Settled: it is `bets.pitch`, alias dropped.** The mock-only `body` field in `MockBetDetail` is a vestige of a pre-schema fixture shape. We rename `body → pitch` on the runtime data path so the column name in the DB and the field name in the API response and the field name in the page agree. Mock fixture stories may keep their inline strings, but the runtime page reads `pitch`.

### Probe 2 — Does L16 own replacing `MOCK_BETS` with a real fetch?

**Settled: no — L14 owns it.** `TRACK-L.md:489` says L14 closes "all hardcoded BetCard fixtures … with real data." L14's complexity (S, 3-5d) implies it touches `WorkBet.tsx`'s data source. L16's AC-3 ("runtime data comes from persisted pitch content; matching inventory row from L6 is closed") is satisfied by L14 wiring + L16 not reintroducing inline fixtures. **If L14 has not landed when L16 starts**, L16's scope expands by exactly one wire: `useBet(betId)` calling `GET /api/bets/:id` (already implemented at `packages/server/src/routes/bets.ts:87`). L16 does NOT block on L14; it assumes-or-wires. The ordered task list in `architecture.md` carries this conditional.

### Probe 3 — What about empty / oversize / unknown-kind bodies?

L2 already handles all three: empty body returns `{ blocks: [] }`; oversize returns one `unknown` block with `reason: "body-too-large"`; unrecognised mdast types fall through to `unknown` with `reason: "parser-unrecognised"`. L16 just needs to not crash on those — handled by the empty-array `.map` rendering nothing, plus the existing `UnknownPayload` renderer in `packages/design-system/src/block/UnknownPayload.tsx`.

### Probe 4 — Is there a vocabulary collision with `body`?

Yes, mild. `MockBetComment.body` and `MockBetDetail.body` both currently exist on this page. Renaming `MockBetDetail.body → pitch` resolves it for bets. Comments keep `body` (their concept-layer field is `text` per `messages` schema; that's a separate cleanup, out of scope).

## What it is NOT

- NOT a new BlockKind.
- NOT a markdown editor.
- NOT a thread-anchor wiring (that's L18).
- NOT a BlockHandle / BlockActionsPopover wiring (deferred to L18 too).
- NOT a data-fetch refactor (assumed inherited from L14).
- NOT a custom container component for "pitch view" — the renderer is `bet.pitch.split` into `<Block />` instances directly inside `WorkBet`.
