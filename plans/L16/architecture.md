# L16 — Architecture

## Goal

Replace the `<pre>` fallback at `packages/web/src/pages/WorkBet.tsx:262-267` with the L2 Block primitive view. Rename `MockBetDetail.body → pitch`. Move the four MOCK_BETS pitch strings to a stories-only fixtures location. Keep `bun run check` + `bun run lint` + `bun run test` green; full e2e suite stays green.

## Non-goals

- Wiring `BlockHandle` / `BlockActionsPopover` (deferred to L18 — per-block discussion).
- Fetching `bet` from `/api/bets/:id` (assumed inherited from L14; conditional task at the bottom of the ordered list).
- Replacing `MOCK_BETS` runtime → real-data path (L14 owns it; L16 only ensures fixture strings live in stories/tests files, never re-imported by runtime page code).
- Editing pitches in-page.
- A markdown editor.
- Any mobile sheet adaptation (no popover wired).

## Source-driven notes

- `unified` / `remark-parse` / `remark-gfm` already in `packages/shared` deps via L2; no new deps in `packages/web`.
- `deriveBlocks` is pure and synchronous (`packages/shared/src/blocks/derive-blocks.ts:294`); safe to call inside `useMemo`. ⚠️ UNVERIFIED: parse cost on a 256 KB body — L2 set the byte cap at 256 KB but did not benchmark. For typical pitch sizes (< 4 KB) the cost is negligible; for the cap, the `useMemo` keyed on `[pitch, betId]` keeps it off the per-render hot path.
- React `useMemo` semantics: re-runs only when deps change identity; `bet.pitch` (string) memoises by value-equality, `betId` (string) likewise. Standard React 18, no UNVERIFIED concerns.
- The Block primitive's lowercase `data-ds-component="block"` and `data-ds-kind` markers are already CI-enforced by `Block.test.tsx`. L16 inherits.
- `BlockHostKind = "bet"` already in the L2 type union (`packages/shared/src/blocks/types.ts:20-28`).

## Type / schema changes

**None** in `packages/shared`, `packages/db`, `packages/server`. The DB column is already named `pitch` (`packages/db/src/schema.ts:66`); the server already returns it (`packages/server/src/routes/bets.ts:97` — `c.json({ ...bet, tasks })`).

The page-local type changes:

```ts
// packages/web/src/pages/WorkBet.tsx
interface MockBetDetail {
  id: string;
  title: string;
  product: string;
  team: string;
  status: BetStatus;
  appetite: string;
  progress: { done: number; total: number };
  pitch: string;       // was: body
  tasks: Array<{ id: string; title: string; owner: string; state: TaskState; cost: string }>;
  comments: MockBetComment[];
}
```

`MockBetComment.body` keeps its name (out of scope; that's a Message-layer rename owned by L18).

## File-level changes

### A. `packages/web/src/pages/WorkBet.tsx` — render bets-as-blocks

1. Rename `MockBetDetail.body → pitch` at the type, all four `MOCK_BETS` entries, and `FALLBACK_BET`.
2. Move the four `MOCK_BETS` definitions and `FALLBACK_BET` out of this file (see §B). The runtime page must NOT reference any inline pitch string. **Step 2 is conditional on L14** — see §G.
3. Delete the `@lore J5` comment block (lines 9-19) — it's now stale; the rationale (`react-markdown not a dep`) no longer applies.
4. Replace lines 256-268 with:
   ```tsx
   <BetPitch pitch={bet.pitch} betId={bet.id} />
   ```
   where `BetPitch` is a small inlined component (in this same file or a sibling) — see §C.
5. Update the inline-comment `@lore` to a one-liner pointing at L2: `@lore L16: bet pitch renders via L2 Block primitive (deriveBlocks → <Block />). On-disk format is markdown; blocks are derived at render time.`
6. Add `useMemo` wrapping the `deriveBlocks` call.

### B. New file: `packages/web/src/pages/__fixtures__/work-bet-fixtures.ts` — stories/tests only

Move `MOCK_BETS` and `FALLBACK_BET` here, exported. Field renamed to `pitch`. **Imported only by:**
- `packages/web/src/pages/WorkBet.stories.tsx`
- Any new Vitest tests that need a fixture bet.

The runtime `WorkBet.tsx` does NOT import this file. To make the runtime page testable in isolation while L14 has not yet wired the data layer, `WorkBet` accepts a `bet` prop (or, equivalently, an `overrideBet` in addition to `overrideBetId`). See §G for the conditional.

`@lore` to add to `__fixtures__/work-bet-fixtures.ts`: **"Fixtures live under `__fixtures__/` so the AC-3 invariant is enforceable by a single grep: any production code that imports from `__fixtures__/` is a bug. The L16 runtime page does NOT import from this directory."**

### C. New helper: `BetPitch` (co-located in `WorkBet.tsx`, NOT a design-system component)

```tsx
interface BetPitchProps {
  pitch: string;
  betId: string;
}

function BetPitch({ pitch, betId }: BetPitchProps): JSX.Element | null {
  const { blocks } = useMemo(
    () => deriveBlocks(pitch, { kind: "bet", id: betId }),
    [pitch, betId],
  );
  if (blocks.length === 0) return null;
  return (
    <section aria-label="Bet pitch" data-testid="bet-pitch">
      {blocks.map((b) => (
        <Block key={b.id} id={b.id} payload={b.payload} />
      ))}
    </section>
  );
}
```

Imports added at top of `WorkBet.tsx`:
- `import { Block } from "@hyperidle/design-system";`
- `import { deriveBlocks } from "@hyperidle/shared";`

`@lore` to add: **"BetPitch is co-located, not a Tier-2 design-system component. It is a single-call-site adapter (deriveBlocks → <Block />) and would not earn its keep as a shared component. L23 (knowledge body) will inline an equivalent adapter at its own call site; if a third consumer appears, promote then."**

### D. `packages/web/src/pages/WorkBet.stories.tsx` — story updates

- Import `MOCK_BETS` from `../__fixtures__/work-bet-fixtures.ts` (renamed field).
- Add two new exports:
  - `WithRichPitch` — fixture bet whose pitch contains H1, H2, paragraph, unordered list, fenced code block, blockquote.
  - `EmptyPitch` — fixture bet whose pitch is `""`.
- Existing exports (`KnownBet`, `ShapedBet`, `UnknownBet`, `Loading`) unchanged in name; their data source moves to the fixtures file.

### E. New Vitest: `packages/web/src/__tests__/WorkBet.pitch.test.tsx`

Mounts `WorkBet` with overrides and asserts:
1. **Round-trip lossless on supported kinds.** Render a fixture bet whose pitch contains heading+paragraph+list+quote+code+table+divider. Assert each kind renders as a `[data-ds-kind="<k>"]` Block, AND no literal `#`/`**`/```` symbols appear in the visible text outside `<pre><code>`.
2. **Block ids stable across re-parse.** Render twice with the same pitch; collect all `data-block-id` attributes; assert identical ordered arrays. (This duplicates `id-stability.test.ts` at the consumer surface — required by AC-2.)
3. **Editing one block leaves OTHER block ids unchanged.** Render with a 4-block pitch; rerender with the same pitch except block #2's text appended ` foo`; assert blocks #1, #3, #4 retain their ids. Block #2's id changes. (This is also covered at the unit layer in `id-stability.test.ts`, but AC-4 explicitly demands it at the consumer level.)
4. **Empty pitch renders nothing.** With `pitch: ""`, no `[data-testid="bet-pitch"]` element exists.
5. **Whitespace-only pitch renders nothing.** With `pitch: "   \n\n  "`, ditto.

### F. New Playwright: `packages/web/e2e/L16-bet-pitch.spec.ts`

1. Navigate to `/work/bet/b1` (or whatever bet route exists in `router.tsx` — confirm during build).
2. Wait for `[data-testid="bet-pitch"]` to be visible.
3. Assert the pitch's first heading renders as a real `<h1>` or `<h2>` whose `textContent` does NOT start with `#`.
4. Assert no visible text inside `[data-testid="bet-pitch"]` matches `/^#\s/m` (line-leading hash + space — the markdown heading syntax). `[data-ds-kind="code"]` blocks are excluded since `#` may legitimately appear in code.
5. Assert at least one `[data-ds-component="block"]` exists inside the pitch section.
6. Assert the legacy `<pre data-testid="bet-pitch-body">` is NOT present anywhere on the page (positive structural removal guard, mirrors L15's drag-removal pattern).

### G. Conditional: data-fetch wiring

If, when L16's red phase begins, `WorkBet.tsx` STILL reads from `MOCK_BETS` at runtime (i.e. L14 has not yet landed the bet-fetch wiring), L16 owns one extra task:

- Add a `useBet(betId)` hook (`packages/web/src/hooks/useBet.ts`) that calls `GET /api/bets/:id` and returns `{ data, loading, error }`.
- Wire `WorkBet` to use the hook; keep the `loading` skeleton path; on error, show `ErrorState`.
- Keep `overrideBetId` working for stories (when set, return a fixture from `__fixtures__/work-bet-fixtures.ts`; this is the ONE permitted edge where stories' fixture path crosses into the page module — guarded by `import.meta.env.DEV` or by being a separate `overrideBet` prop that stories pass directly so the page never imports the fixtures barrel).

If L14 has already wired this, §G is a no-op. The builder runs `git log --oneline | grep -iE "L14|bet.*fetch|useBet"` at task #1 to determine which path to take and records the decision in the PR description.

## Test plan

### Vitest (red phase)

| File | Covers AC |
|---|---|
| `packages/web/src/__tests__/WorkBet.pitch.test.tsx` (NEW) | AC-1, AC-2, AC-4 |
| `packages/web/src/__tests__/WorkBet.fixtures-isolation.test.ts` (NEW) | AC-3 |

`WorkBet.fixtures-isolation.test.ts` is a static-analysis-style test: reads `WorkBet.tsx` source via `fs.readFileSync` and asserts:
- No string literal containing `# Problem` or `## Appetite` in the file body.
- No `import` statement from `__fixtures__/`.

This is the cheapest, most direct way to enforce AC-3's "Hardcoded pitch fixture strings remain ONLY in stories and tests" without manual code review. `@lore` on the test file: **"This is a guard test — if it fails, an inline pitch fixture has been smuggled back into the runtime page module. The test file is intentionally read-only; do NOT relax the assertions to make CI pass."**

### Stories (review surface)

| Story | What it proves |
|---|---|
| `WithRichPitch` | Visual proof of all common kinds rendering. |
| `EmptyPitch` | Empty case renders nothing. |
| Existing `KnownBet` / `ShapedBet` | Migration didn't regress. |

### Playwright (e2e)

| File | Covers AC |
|---|---|
| `packages/web/e2e/L16-bet-pitch.spec.ts` (NEW) | AC-5 |

The existing `block-render.spec.ts` (currently `test.fixme`d, deferred under L2-FU-8) is **not** un-fixme'd by L16 — that spec is for the design-system viewer route and remains its own follow-up. L16's spec is independent and tests the production WorkBet page.

## Acceptance criteria → test mapping

| AC | Verification |
|---|---|
| AC-1: pitch renders as styled blocks; `<pre>` replaced | `WorkBet.pitch.test.tsx` case 1 (asserts `[data-ds-kind=*]` blocks present); `L16-bet-pitch.spec.ts` step 6 (asserts `<pre data-testid="bet-pitch-body">` is absent). |
| AC-2: block ids stable per L2 | `WorkBet.pitch.test.tsx` case 2. |
| AC-3: hardcoded pitch fixtures only in stories/tests | `WorkBet.fixtures-isolation.test.ts`. |
| AC-4: round-trip lossless; ids stable across re-parse; edit-one leaves-others-unchanged | `WorkBet.pitch.test.tsx` cases 1, 2, 3. |
| AC-5: open a bet → no `#` symbols | `L16-bet-pitch.spec.ts` steps 3, 4, 5. |
| AC-6: check + lint + test green; e2e suite green | `bun run verify` + full `bun run e2e`. |

## Ordered task breakdown for builder

1. **Determine §G branch.** `git log --oneline | grep -iE "L14|bet.*fetch|useBet"`. Record outcome in PR description. If no hits, plan §G's hook + ErrorState wire.
2. **Red phase.** Write the three test files (Vitest x2 + Playwright x1) before any source change. Confirm they fail.
3. **Move fixtures.** Create `packages/web/src/pages/__fixtures__/work-bet-fixtures.ts`. Migrate `MOCK_BETS` + `FALLBACK_BET`, rename `body → pitch`. Update `WorkBet.stories.tsx` import. **At this checkpoint, `WorkBet.tsx` still reads from the old inline mock — tests #2 (fixtures-isolation) still failing, but #1/#5 unaffected.**
4. **Runtime page swap.** In `WorkBet.tsx`:
   - If §G branch is "must wire fetch": add `useBet` hook + ErrorState path.
   - If §G branch is "L14 already wired": confirm the page reads from the fetch result, not `MOCK_BETS`.
   - Either way: rename `MockBetDetail.body → pitch`, replace `<pre>` block with `<BetPitch />`, add the inlined `BetPitch` helper, add the imports, delete the inline `MOCK_BETS` if not yet removed.
   - Run `WorkBet.fixtures-isolation.test.ts` — should now pass.
5. **Update stories.** Add `WithRichPitch` + `EmptyPitch` exports.
6. **Run Vitest.** All three Vitest cases green.
7. **Run Playwright.** L16 spec green; existing e2e suite (`bun run e2e`) green.
8. **Verify gate.** `bun run verify` — zero check / lint / test failures.
9. **Visual proof.** Open `/designsystem` → navigate to `Page: Work/Bet` → screenshot `WithRichPitch`. Confirm no `#`, no `<pre>` rectangle, no double-card chrome.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| `useMemo` deps churn — `bet.pitch` from a fresh fetch may produce a new string every render even when content is identical | The hash inside `deriveBlocks` is content-keyed; `useMemo` only avoids the parse cost. Even if it re-parses, the block ids are deterministic, so the DOM doesn't churn (React keys match). Acceptable. |
| §G branch chosen wrong — builder picks "no wire needed" but L14 hasn't actually landed | Step 1 is grep-based; if ambiguous, builder reads `WorkBet.tsx` directly and looks for `MOCK_BETS[betId]` at line ~194. Concrete check, not reputation. |
| 256 KB pitch parsed on every render of an unmemoised consumer | `useMemo` keyed on pitch+betId. ⚠️ UNVERIFIED parse cost at the cap; acceptable per L2's existing benchmarking gap. |
| Unknown block kinds render as `[data-ds-kind="unknown"]` and the e2e regex `/^#\s/m` accidentally hits the raw text inside a fallback | The fallback renders `raw.slice(0, 500)` inside `<UnknownPayload>` which is a `<pre>` per L2. The e2e step 4 excludes `[data-ds-kind="code"]`; should also exclude `[data-ds-kind="unknown"]`. Note this in the spec. |
| Fixture-isolation test is brittle to formatting | The test asserts on substring presence, not on AST structure. The inline pitches are 4-7 lines of distinctive markdown (`# Problem`, `## Appetite`, etc.) — substring match is the right tool. |
| MockBetComment field rename leaks scope | Out of scope. Comments stay `body`. Test assertions only touch the pitch field. |
| Story/fixture barrel adds an `index.ts` that gets imported by accident | Use a single non-barrel module; do not export from `packages/web/src/pages/index.ts` (which doesn't exist). The fixtures file path is the only entry. |
| L18's eventual `BlockHandle` wiring requires Block prop changes that are awkward to retrofit | Block already exposes `slots.gutterLeading`, `onOpenActions`, `onCopyPermalink` (`Block.tsx:55-71`). L18 adds props at the WorkBet call site without changing Block's signature. No retrofit risk. |

## Rollback / migration concerns

- **Renaming `body → pitch` on `MockBetDetail`** has zero external consumers (the type is local to `WorkBet.tsx`). Safe.
- **Moving `MOCK_BETS` to fixtures** has one external consumer: `WorkBet.stories.tsx`. Updated atomically in step 3.
- **The `<pre data-testid="bet-pitch-body">` selector** is referenced by no current test (`grep -r 'bet-pitch-body' packages/web/` confirms). Safe to delete. The new selector `[data-testid="bet-pitch"]` is introduced fresh.
- **L18 forward compatibility.** L18 will pass `onOpenActions` / `onCopyPermalink` / `slots.gutterLeading={<BlockHandle … />}` from `BetPitch`. The L18 diff is additive — no L16 line dies in L18.

## Open questions parked for the reviewer

1. **§G branch.** L14's status when L16 starts is unknown at design time. The architecture handles both branches; the reviewer should confirm the scope expansion (one hook + ErrorState wiring) is acceptable IF L14 has not landed. If the reviewer wants L16 to *not* expand and instead block on L14, that's a process decision.
2. **`overrideBet` prop on `WorkBet` for stories.** Adding a prop that lets stories pass a fixture bet directly avoids the production page importing from `__fixtures__/`. The alternative — `overrideBetId` looking up from a registry — already exists. The new prop is cleaner; the existing prop is conservative. Reviewer call.
3. **Fixture-isolation test approach.** Static-source-grep is unconventional. Alternative: a `dependency-cruiser`-style check, or a TypeScript build-rule. Static-grep is the cheapest; reviewer should weigh it against indirection cost.
4. **`UnknownPayload` raw rendering.** If the fallback renders `raw.slice(0, 500)` containing `# Problem`, the e2e regex would false-positive. The mitigation in the Risks table excludes `[data-ds-kind="unknown"]`. Reviewer should confirm that's the right behavior, or flag if "unknown blocks must also strip markdown markers" — which would imply a deeper change in `UnknownPayload`.
