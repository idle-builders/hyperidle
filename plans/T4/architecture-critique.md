# T4 Architecture Critique

## Scores

| Dimension | Score | Notes |
|-----------|-------|-------|
| Completeness | 7/10 | All 7 ACs are mapped to tasks. However, the rendering path for block ref embeds only covers ThreadShell consumers (CocOverlay, Conversations) — HostThreadSection is missed. The validation scenario "click Share opens CoC overlay" is mentioned in spec but the plan only describes attaching context when overlay is already open, not opening it. |
| Correctness | 8/10 | Type designs are sound. The discriminated union refactor is well-reasoned. Zod z.discriminatedUnion with z.enum on the discriminator field works in Zod 3.25 (verified). The plan correctly identifies the migration surface area for ref.id consumers. |
| Consistency | 8/10 | Follows established patterns: page-level action construction for BlockActionsPopover, CocAttachButton usage matches existing BetCard pattern, slot-based extension of CommentRow. Option B for CocAttachButton placement is consistent with how the existing attach button works. |
| Feasibility | 7/10 | Mostly buildable without ambiguity. Two gaps: (1) the plan's file change list #12 says "Pass renderRefEmbeds to ThreadShell in HostThreadSection" but HostThreadSection does NOT use ThreadShell — it renders its own message list. The builder will need to figure out the correct wiring for WorkBet thread rendering. (2) ThreadShell consumers that need renderRefEmbeds are actually CocOverlay and Conversations, which are not mentioned in the file change list. |
| Simplicity | 8/10 | The design is lean. The render-prop approach for renderRefEmbeds avoids importing web-layer components into the design-system. The module-level cache in useBlockResolution is simple and fit for purpose. The discriminated union is the natural TypeScript pattern. |
| Safety | 8/10 | Migration cost analysis is accurate — only CocOverlay.refsToSend and ContextChip key access ref.id unconditionally. The plan notes that npm run check will surface any other breakage. Degraded state for missing blocks prevents crashes. |
| Testability | 9/10 | Every AC has a corresponding test file. The plan includes unit tests for types, Zod schemas, hook resolution, component rendering, integration tests for CocOverlay, and an E2E Playwright test. Coverage is thorough. |
| Performance | 8/10 | Module-level cache for host body fetches deduplicates requests across multiple block refs from the same host. N+1 risk acknowledged and mitigated. No unnecessary re-renders — useBlockResolution is a standard fetch-on-mount hook. |
| Extensibility | 9/10 | The "unsupported host" fallback future-proofs for new host kinds. The renderRefEmbeds render prop is generic enough to support future ref types beyond block. Non-goals are clearly delineated. |

**Overall: 8/10** — PASS

## Findings

### Critical (must fix before build)

1. **File change list misidentifies ThreadShell consumers for renderRefEmbeds.**
   - Plan section 6, item #12 states: "WorkBet — Pass renderRefEmbeds to ThreadShell in HostThreadSection."
   - Reality: `HostThreadSection` (`packages/web/src/shell/HostThreadSection.tsx`) does NOT use `ThreadShell`. It renders its own bare message list via a `messages.map()` with a simple `messageText(msg)` function. Adding `renderRefEmbeds` to `ThreadShell` would have zero effect on messages rendered within WorkBet's thread section.
   - The actual `ThreadShell` consumers are: `CocOverlay.tsx` and `Conversations.tsx`.
   - **Fix:** Correct the file change list to wire `renderRefEmbeds` in `CocOverlay.tsx` and `Conversations.tsx` (the real ThreadShell consumers). For HostThreadSection, either (a) leave it unsupported in T4 (block ref embeds only render in full-ThreadShell contexts — acceptable for v1 since block refs primarily flow INTO CoC conversations) or (b) add minimal embed rendering inline in HostThreadSection's message map. Recommend option (a) with a follow-up note, since HostThreadSection is acknowledged as MVP-only (its lore comment says "full ThreadShell convergence is a follow-up").

### Important (should fix)

2. **Validation scenario gap: "Share" action opening the overlay.**
   - The workpackage spec validation scenario 4 states: "when they click Share, then the CoC overlay opens (or focuses if already open) with the block pre-attached."
   - The plan's `handleShareBlock` function calls `attachContext(...)` which adds the ref, but does NOT open the CoC overlay if it is closed. The `CocContext` interface exposes `overlayOpen` (read-only boolean) and `attachContext` (adds a ref) — there is no `openOverlay()` function.
   - **Fix:** Either (a) add an `openOverlay` function to `CocContextValue` (and have the provider call it when a ref is attached while closed), or (b) scope the "Share" action to only appear/be enabled when the overlay is already open (like CocAttachButton, which renders nothing when `overlayOpen === false`), or (c) document that the "Share" action should toggle the overlay open as a side effect — which requires extending the CocContext interface. The plan must explicitly address this.

3. **ContextChip key collision risk on block refs.**
   - Section 4.4 proposes key `${cocRef.kind}-${cocRef.blockId}-${cocRef.hostId}` for block refs.
   - If a user somehow attaches the same block from the same host twice (unlikely but not prevented), keys collide. This is already the case for entity refs (`${kind}-${id}`), so the same deficiency exists there.
   - More importantly: the plan says to branch on `cocRef.kind === "block"` to choose between `cocRef.id` and `cocRef.blockId` for the key. But the current code at line 141 of CocOverlay uses `key={`${cocRef.kind}-${cocRef.id}`}`. After the CocContextRef becomes a discriminated union, accessing `.id` on a block ref will be a type error. The fix is stated in the plan text but NOT reflected in the file change list for item #7 — the builder should handle it under "Update ContextChip key generation" which IS in item #7.
   - **Verdict:** Adequately addressed in section 4.4 and covered by item #7. No action needed — just noting for the builder that this is a type-narrowing exercise.

4. **`blockExcerptFromPayload` placement.**
   - Plan section 4.2 says: "Lives in a shared utility file" and section 6 item #15 places it in `packages/web/src/utils/block-excerpt.ts`.
   - The function needs to import `Block` types from `@hyperidle/shared`. Since it is only consumed by web-layer pages, `packages/web/src/utils/` is correct. However, the plan section 4.1 also uses a different approach (DOM query `blockEl?.textContent?.trim()`) for the "Share" action excerpt. Two different excerpt strategies for the same label is inconsistent.
   - **Fix:** Clarify that `blockExcerptFromPayload` is the canonical approach and the DOM-query variant in handleShareBlock should also use it (the block payload is available from `deriveBlocks` which the page already computes). Alternatively, note that the DOM query is acceptable for the Share action because the block payload is not readily available at that call site (only the blockId is passed to the handler). But this should be an explicit design choice, not an oversight.

### Minor (nice to have)

5. **Zod version mismatch in prose.**
   - Plan section 3 repeatedly references "Zod v3" which is technically correct (runtime is 3.25.76) but the `package.json` declares `"zod": "^4.3.6"`. The lock file resolves to v3 due to the peer dependency range `"^3.25.0 || ^4.0.0"`. This could confuse a builder who checks package.json and expects Zod 4 APIs.
   - **Fix:** Add a one-line note that the installed version is 3.25.x regardless of the declared range, or just reference the actual behavior without naming the major version.

6. **Module-level cache lifetime in useBlockResolution.**
   - The plan acknowledges the cache is "module-level and lives for the page session" and says "if the user edits the source, they would reload anyway." This is true for the knowledge/bet DETAIL pages, but if the user is in the CoC overlay and edits a knowledge item in a separate tab/panel, the cache could serve stale data. This is an acceptable v1 tradeoff but should be documented as a known limitation or follow-up.

7. **`CocAttachButton` prop naming collision with React `ref`.**
   - The existing `CocAttachButtonProps` uses `ref` as a prop name (`ref: CocContextRef`). In React 19+, `ref` is a reserved prop name. The current codebase destructures it as `{ ref: cocRef }` which works, but this is fragile and will emit warnings in future React versions. Not a T4 concern specifically (it pre-exists), but worth noting.

8. **No mention of `Conversations.tsx` in the file change list.**
   - `Conversations.tsx` also renders `ThreadShell` and should pass `renderRefEmbeds` if block ref embeds are to render in the full conversation view. The plan's file change list omits it entirely. The fix from finding #1 should include this file.

## Verdict

**ADVANCE** — with the understanding that the builder must resolve finding #1 (correct the ThreadShell consumer wiring) and finding #2 (clarify the "Share opens overlay" behavior) during implementation. The plan's core type architecture, resolution strategy, and component design are sound. The file change list has routing errors but the underlying design is buildable once the correct consumers are identified.
