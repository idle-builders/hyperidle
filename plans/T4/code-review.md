# T4 Code Review

## AC Completeness

| AC | Status | Evidence |
|----|--------|----------|
| 1. `InlineRef.kind` includes `"block"` with shape `{ kind: "block"; blockId: string; hostKind: BlockHostKind; hostId: string }` | PASS | `packages/shared/src/thread.ts` lines 91-105: `InlineRefKind` includes "block", `BlockRef` interface has exact shape, `InlineRef = EntityRef | BlockRef`. Type test in `thread-block-ref.test.ts` confirms narrowing. Exports verified in `packages/shared/src/index.ts` lines 163-168. |
| 2. Zod `inlineRefSchema` validates block refs (discriminated union) | PASS | `packages/server/src/routes/threads-schema.ts` lines 29-53: `entityRefSchema` + `blockRefSchema` combined with `z.discriminatedUnion("kind", [...])`. Schema test `threads-schema.block-ref.test.ts` verifies acceptance/rejection for valid/invalid block refs and entity refs. |
| 3. Block actions popover includes "Share" alongside "Discuss" | PASS | `WorkBet.tsx` lines 1082-1097: `BlockActionsPopover` items array includes "Discuss" always and "Share" conditionally when `overlayOpen`. Same pattern in `KnowledgeDetail.tsx` lines 512-517. Tests `WorkBet.share-block.test.tsx` and `KnowledgeDetail.share-block.test.tsx` confirm. |
| 4. When CoC overlay is open, blocks show CocAttachButton "+" | PASS | `WorkBet.tsx` BetPitch lines 204-210: `<CocAttachButton>` rendered inside each block's relative wrapper. `KnowledgeBody.tsx` lines 130-138: same pattern. CocAttachButton returns null when overlayOpen=false. Tests verify presence/absence. |
| 5. Clicking "Share" or "+" adds block as context ref chip in CoC overlay composer | PASS | `WorkBet.tsx` `handleShareBlock` (line 895-907) calls `attachContext` with block ref shape. `CocAttachButton` calls `attachContext(cocRef)` on click. `CocOverlay.tsx` `ContextChip` renders with correct key branching (lines 176-179). Wire serialization maps block refs to `{ kind, blockId, hostKind, hostId }` (lines 106-114). Integration test `CocOverlay.block-ref.test.tsx` verifies chip render + wire payload shape. |
| 6. Messages with block refs render inline embed card | PASS | `ThreadShell.tsx` lines 463-470: `renderRefEmbeds` called for plain messages with refs, result passed as `afterBody`. `CommentRow.tsx` line 197: `afterBody` rendered after message body. `BlockRefEmbed.tsx` renders bordered card with host label + `renderPayload(payload)`. Wired in both `CocOverlay.tsx` (line 194) and `Conversations.tsx` (lines 381, 428). |
| 7. Deleted block renders "source changed" indicator | PASS | `BlockRefEmbed.tsx` lines 50-64: degraded status renders "Source changed -- the referenced block no longer exists in the source document." `useBlockResolution.ts` lines 150-155: when `blocks.find(b => b.id === blockId)` returns undefined, sets status=degraded. Test `BlockRefEmbed.test.tsx` "renders 'source changed' indicator when status=degraded" confirms. E2E test covers with a mock returning a non-existent block ID. |

## Lens Findings

### Architecture

1. **Reviewer critique findings properly addressed.** Finding #1 (ThreadShell consumers misidentified) resolved: `renderRefEmbeds` wired in `CocOverlay.tsx` line 194 and `Conversations.tsx` lines 381/428. Finding #2 (Share opens overlay) resolved: Share action only appears when `overlayOpen === true` (WorkBet line 1087, KnowledgeDetail line 512). The `@lore` comments explicitly reference the reviewer critique.

2. **Layer boundaries respected.** `BlockRefEmbed` (data-fetching) lives in `packages/web/src/components/`, not the design-system. `renderPayload` is re-exported from the design-system barrel (`index.ts` line 37) so the web layer can call it. `ThreadShell` stays fetch-free via the `renderRefEmbeds` render prop.

3. **Type safety is strong.** The discriminated union narrowing flows correctly through all consumers. `CocContextRef` mirrors `InlineRef` with the added `label` field. No `any` types anywhere in the new code.

4. **[Minor] Redundant `as` cast.** `useBlockResolution.ts` line 145: `kind: hostKind as "bet" | "knowledge_item"` is a narrowing cast. The invariant is guaranteed by control flow (fetchHostBody returns null for other kinds, and null is checked above), but TypeScript cannot infer this from the module-level cache indirection. Acceptable — the invariant is documented.

### Design

1. **Consistent with existing patterns.** CocAttachButton usage on blocks matches the existing pattern on BetCard (WorkBet line 943). The relative wrapper + CocAttachButton pattern is consistent.

2. **Stories present.** `BlockRefEmbed.stories.tsx` covers all four states (Loading, Resolved, Degraded, FetchError). Stories render the visual state directly rather than mocking the hook — acceptable approach documented in the `@lore` comment.

3. **[Minor] Stories do not use the real component.** The stories duplicate the JSX rather than rendering `<BlockRefEmbed>` with a mocked hook. This means visual regressions in the component would not be caught by the stories. However, this is pragmatic given the storybook framework's module mocking limitations.

4. **Token usage correct.** All colors use semantic tokens (`--surface-*`, `--text-*`, `--border-*`). Radii use `--r1`. No hardcoded colors, no off-scale values.

### Security

1. **URL encoding for path parameters.** `useBlockResolution.ts` lines 54/57: `encodeURIComponent(hostId)` used for both bet and knowledge_item URLs. Prevents path traversal.

2. **Access control delegated to existing endpoints.** Block resolution fetches from `GET /api/bets/:id` and `GET /api/knowledge/:id` which enforce their own scope/access. No new endpoints = no new attack surface.

3. **No secrets exposed.** No credentials, tokens, or sensitive data in the new code.

4. **Input validation at the boundary.** The Zod schema validates block refs with `min(1)` on blockId and hostId, and `z.enum(BLOCK_HOST_KINDS)` on hostKind. Empty strings and invalid host kinds are rejected.

### Adversarial

1. **Module-level cache never invalidates.** `useBlockResolution.ts` line 38: `bodyCache` is a module-level `Map` that persists for the page session. If a user edits a knowledge item in one tab and then views the CoC thread in another tab (without page reload), stale content renders. Acceptable for v1 per architecture section 5, but worth noting.

2. **DOM query excerpt extraction is fragile.** `handleShareBlock` in WorkBet (line 896) and KnowledgeDetail (line 396) uses `document.querySelector('[data-block-id="${blockId}"]')` to get text content. If the DOM attribute changes format or the element is not rendered (e.g., virtualized list), the excerpt falls back to the blockId string. This is a cosmetic degradation (label quality), not a correctness issue.

3. **No deduplication of attached refs.** A user can attach the same block ref multiple times by clicking "+" repeatedly. The chip renders with the same key (React will warn but not crash). Not a data correctness issue — the refs array will contain duplicates, which is harmless but noisy.

4. **Race condition on retry.** `useBlockResolution` evicts the cache and increments `retryCount` (lines 136-137). If two retries fire rapidly, both evict + re-fetch, producing two parallel fetches that both set `bodyCache`. The Map prevents actual duplication (second set overwrites), so this is safe in practice.

### Simplification

1. **`renderRefEmbedsForCoc` and `renderRefEmbedsForConversations` are identical.** CocOverlay.tsx line 34 and Conversations.tsx line 44 define the same function with different names. Could be a shared utility. Low severity — two instances is not severe duplication, and colocation with the consumer is arguably clearer.

2. **`hostKindLabel` switch in useBlockResolution** (lines 82-97) covers all BlockHostKind values but only `"bet"` and `"knowledge_item"` can ever reach the resolved state (others return null earlier). The unreachable cases are harmless documentation of future host kinds.

3. **`satisfies` assertion in CocOverlay** (line 113) is purely for developer documentation — `satisfies` does not change runtime behavior or narrow types. It could be removed without functional change. Low value but also low cost.

### Slop

1. **No dead code detected.** All new functions and types are consumed.

2. **No unused imports.** Each import is referenced in the file.

3. **No `console.log` or placeholder TODO comments in production code.** All `@lore` comments document actual decisions.

4. **No AI tells detected.** Naming is honest and specific. No over-commenting. No unnecessary abstractions. No defensive null checks for non-nullable types.

## Verdict: DONE

All seven acceptance criteria pass with test evidence. The architecture critique findings from Phase 2 were explicitly addressed. Type safety is maintained (zero typecheck errors). Tests are comprehensive: unit tests for types and schemas, component tests for all states, integration tests for wire serialization and chip rendering, page-level tests for both surfaces (WorkBet, KnowledgeDetail), and an E2E Playwright test.

### Minor observations (non-blocking):

1. **Missing dedicated unit test for `blockExcerptFromPayload`.** The utility is exercised indirectly through page-level tests but lacks a direct test for edge cases (empty payloads, long text truncation, each payload kind). Recommend adding in a follow-up.
2. **Duplicate `renderRefEmbeds` function** in CocOverlay.tsx and Conversations.tsx. Could be extracted to a shared utility if more ThreadShell consumers adopt it.
3. **Stories render state visuals directly** rather than mounting the real component with mocked hooks. Acceptable given framework constraints but limits visual regression detection.
