# block-derivation — destroyer verdict (framework)

## Where does this package go?
**Verdict: DISSOLVE → `framework/design-system`**

Block derivation is real product capability, not machinery ahead of need — but it is not a package.
Derived blocks reach five UI doors: the knowledge page (`KnowledgeBody.tsx`), the bet pitch
(`WorkBet.tsx`), the review canvas (`review-canvas.tsx` — prose blocks and synthetic code-line ids
for diff-anchored comments), artifact text bodies (`compose-artifact-body.tsx`), and every plain
message (`CommentRow.tsx` via `derivePayloads`). Anchored comments and knowledge rendering stand on
these ids. The capability lives.

The package does not. Exactly two production consumers exist: `framework/design-system` and
`layers/core-ui` — and core-ui already depends on design-system. Derivation runs **client-side at
render time only** (@lore L23); zero server code touches it — `core-api` and `domain-model` carry
the dependency for tests alone. Derivation and rendering are one pipeline: markdown → payloads →
React. Design-system already owns the rendering half (`src/block/`, `HeadingPayload`,
`compose-artifact-body`). Move the four source files into `framework/design-system/src/block/`,
export `deriveBlocks`, `derivePayloads`, `blockId`, `normalisedPayload`, `slug`,
`EMPTY_SLUG_SENTINEL` from there, delete the package. Design-system gains the deps
(`remark-parse`, `remark-gfm`, `unified`, `github-slugger`, `@noble/hashes`); core-ui's import
lines change package name and nothing else.

Graph note: `trace-uses.ts deriveBlocks` returns "nothing references" — false negative (pure
client-side imports, no door/DI wiring in the graph). The `rg -a` sweep across all four roots is
the evidence above.

## Consumers (measured, not assumed)

`rg -a -l "@hyperidle/block-derivation" layers framework applications tools`:

| Consumer | What it imports | Could it own this? |
|---|---|---|
| `framework/design-system` (3 files: `compose-artifact-body.tsx`, `CommentRow.tsx`, `HeadingPayload.tsx`) | `deriveBlocks`, `derivePayloads`, `slug`, `EMPTY_SLUG_SENTINEL` | **Yes — it becomes the owner.** Already renders every payload the derivation produces. |
| `layers/core-ui` (4 files: `WorkBet.tsx`, `useBlockResolution.ts`, `KnowledgeBody.tsx`, `review-canvas.tsx`) | `deriveBlocks`, `blockId`, `normalisedPayload` | No (design-system cannot import a layer) — but it already imports design-system, so it consumes from there. |
| `framework/domain-model` | **devDependencies only** — its `__tests__/blocks/` hosts tests OF block-derivation code | N/A — misplaced tests; they move with the code, devDep dies. |
| `layers/core-api` | **test-only** (`blocks-no-ssrf.test.ts`); zero production imports in `src/` | N/A — retarget the test import, drop the dep from `package.json`. |

Two production consumers, one of which sits below the other in the dependency graph. That is not a
shared package; that is design-system code with an invented boundary.

## If written today, from scratch

One module family inside design-system, next to the block renderers:

- `deriveBlocks(body, host)` — markdown → identified `Block[]` (the whole point of the concept)
- `derivePayloads(text)` — the same walker with image-downgrade policy and no identity, for messages
- `blockId(...)` / `normalisedPayload(...)` / `slug(...)` / `EMPTY_SLUG_SENTINEL` — the id primitive
  and its normalisation, exported because review-canvas mints synthetic ids for diff lines and
  HeadingPayload re-slugs anchors

One mdast→payload walker, not two. No collision "check" that reports to a no-op.

## Kill summary

| Verdict | Count |
|---|---|
| DELETE | 1 |
| MERGE | 3 |
| SIMPLIFY | 0 |
| KEEP | 5 |

Surface: 9 exports → 5 surviving public exports (44% cut), package itself deleted, ~220 duplicated
walker lines deleted via the `derivePayloads` merge.

## Feature-level kills

**The dev-mode collision check is theatre — delete it.** `deriveBlocks` calls
`assertNoCollisions(blocks, defaultLogger)` in non-production, and `defaultLogger.critical` is an
intentional no-op (`derive-blocks.ts:444-448`). The check builds a Map on every derivation in dev
and can never say anything, in any environment, to anyone. Its own comment concedes
`golden-ids.test.ts` is the canonical guard. Zero production loss; a `domain-model` test that
invokes it directly dies with it.

No other feature kills: derivation itself is load-bearing for Blocks (anchored comments, knowledge
rendering, review anchors) and every remaining export is on a painted UI path.

## Full export audit

| # | Export | Kind | Reach | Verdict | Reason |
|---|---|---|---|---|---|
| 1 | `blockId` | function | UI: review canvas (diff-line comment anchors, `review-canvas.tsx:68`) + INTERNAL (`deriveBlocks`) | KEEP | Mints the id every anchor and comment stands on; moves to design-system. |
| 2 | `deriveBlocks` | function | UI: knowledge page, bet pitch, review canvas, artifact body, `useBlockResolution` | KEEP | The package's reason to exist — five painted routes render its output; moves to design-system. |
| 3 | `assertNoCollisions` | function | INTERNAL (wired to a no-op logger) + TEST-ONLY external refs | DELETE | Reports to nobody by construction; golden-ids snapshot is the real guard. Delete export, dev-mode call, and the test that pokes it. |
| 4 | `derivePayloads` | function | UI: every message row (`CommentRow.tsx:134`) | MERGE → `deriveBlocks` walker | Its file is a ~250-line near-copy of derive-blocks' mdast walker differing only in image policy and no-identity. Keep the entry point, share one walker with an image-policy parameter, delete the duplicate. |
| 5 | `slug` | function | UI: `HeadingPayload.tsx:22` (anchor gating) + INTERNAL (normalise, derive-blocks) | KEEP | Hash-input primitive; heading ids and anchors depend on its exact output. Moves to design-system. |
| 6 | `normalisedPayload` | function | UI: review canvas (code-line ids) + INTERNAL (`deriveBlocks`) | KEEP | Sole source of the hash preimage; review canvas must match `deriveBlocks` byte-for-byte. Moves to design-system. |
| 7 | `BlockIdInput` | interface (internal, not in `index.ts`) | INTERNAL: `blockId` signature only | MERGE → inline into `blockId` signature | A `*Input` type mirroring one function is the exact garbage the brief names. |
| 8 | `EMPTY_SLUG_SENTINEL` | const (public) | UI: `HeadingPayload.tsx:25` + INTERNAL | KEEP | Part of the hash preimage AND read by the renderer to suppress dead anchors — genuinely shared between derivation and paint. Moves to design-system. |
| 9 | `ROOT_OUTLINE_SENTINEL` | const (internal, not in `index.ts`) | INTERNAL: `derive-blocks.ts` only | MERGE → module-private const in `derive-blocks.ts` | Exported from `normalise.ts` for one sibling module; nothing outside the package can even see it. |

## Types / DI ports

| Declaration | Verdict | Reason |
|---|---|---|
| `BlockIdInput` | MERGE | Inline into `blockId`'s parameter; one-function arg mirror. |
| `CollisionLogger` (unexported, `derive-blocks.ts:440`) | DELETE | Dies with `assertNoCollisions`; its only real implementation is a no-op. |

## Holes this leaves

- **None functional.** Every production caller keeps its function; only the import path changes to
  `@hyperidle/design-system`. Block ids are unchanged — no hash input moves.
- **Dev collision detection disappears** — from "computes and tells a no-op" to "doesn't compute".
  Observable difference: zero. `golden-ids.test.ts` remains the id-stability guard.
- **Design-system gains five npm deps** (remark-parse, remark-gfm, unified, github-slugger,
  @noble/hashes). It is already the block-rendering package; parsing what it renders is the same
  concern, not scope creep.
- **Cleanup riders:** `domain-model`'s `__tests__/blocks/` tests and devDep move with the code;
  `core-api` drops a production-declared dependency it only ever used in one test; the
  `derivePayloads` merge must keep the R3 image-downgrade policy (alt→paragraph, empty-alt→drop)
  behind an explicit parameter so message rendering and block derivation stay distinguishable.
