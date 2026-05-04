# L16 — Architecture

## Goal

Replace the `<pre>` fallback at `packages/web/src/pages/WorkBet.tsx:262-267` with the L2 Block primitive view. Rename `MockBetDetail.body → pitch`. Move the four MOCK_BETS pitch strings to a stories-only fixtures location, with the boundary enforced by an ESLint `no-restricted-imports` rule (§F). Wire `useBet(betId)` as the page's runtime data path — there is **no `MOCK_BETS` runtime fallback** (the runtime page reads exclusively from the API hook or from the `overrideBet` prop). Keep `bun run check` + `bun run lint` + `bun run test` green; full e2e suite stays green.

## Non-goals

- Wiring `BlockHandle` / `BlockActionsPopover` (deferred to L18 — per-block discussion).
- Editing pitches in-page.
- A markdown editor.
- Any mobile sheet adaptation (no popover wired).
- A `Bet` data layer abstraction beyond what L16 itself wires (`useBet` hook is local to L16; future stories may evolve it).

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
// packages/web/src/pages/WorkBet.tsx — runtime page
interface BetDetail {
  id: string;
  title: string;
  product: string;
  team: string;
  status: BetStatus;
  appetite: string;
  progress: { done: number; total: number };
  pitch: string;       // was: body
  tasks: Array<{ id: string; title: string; owner: string; state: TaskState; cost: string }>;
  comments: BetComment[];
}
```

The fixture-side type is the same shape, defined in the fixtures file (§B). `BetComment.body` keeps its name (out of scope; that's a Message-layer rename owned by L18).

## File-level changes

### A. `packages/web/src/pages/WorkBet.tsx` — render bets-as-blocks

1. **Delete** the inline `MOCK_BETS`, `FALLBACK_BET`, `MockBetDetail`, and `MockBetComment` definitions from this file. They move to `__fixtures__/work-bet-fixtures.ts` (§B), with `body` renamed to `pitch`. The runtime page MUST NOT import from `__fixtures__/` (enforced by ESLint — see §F).
2. **Add** a new `useBet(betId)` hook (§H) that calls `GET /api/bets/:id` and returns `{ data, loading, error }`. Wire it as the runtime data source — replace `const bet = (betId && MOCK_BETS[betId]) || FALLBACK_BET;` with the hook. The `MOCK_BETS` runtime fallback is removed; if the fetch errors or yields nothing, the page renders `<ErrorState …/>` (see step 8).
3. **Add** `overrideBet?: BetDetail` prop on `WorkBetProps`. When set, the page short-circuits the hook and uses the prop directly. This is the ONLY supported path for stories/tests to inject fixture bets without the page importing from `__fixtures__/`. The existing `overrideBetId` prop is **removed** — it was a fixture-registry lookup that no longer makes sense once `MOCK_BETS` leaves the page module.
4. Delete the `@lore J5` comment block (lines 9-19) — it's now stale; the rationale (`react-markdown not a dep`) no longer applies.
5. Replace lines 256-268 with:
   ```tsx
   <BetPitch pitch={bet.pitch} betId={bet.id} />
   ```
   where `BetPitch` is a small inlined component in this same file — see §C.
6. Update the inline-comment `@lore` to a one-liner pointing at L2: `@lore L16: bet pitch renders via L2 Block primitive (deriveBlocks → <Block />). On-disk format is markdown; blocks are derived at render time.`
7. Add `useMemo` wrapping the `deriveBlocks` call inside `BetPitch` (§C).
8. **Loading and error paths.** The existing `loading?: boolean` prop is preserved (used by stories). When `useBet` returns `loading=true`, render the same `SkeletonCard + SkeletonList` block as today. When `useBet` returns `error`, render `<ErrorState …/>` (already imported from `@hyperidle/design-system`). When `overrideBet` is set, neither path is exercised.

### B. New file: `packages/web/src/pages/__fixtures__/work-bet-fixtures.ts` — stories/tests only

Move `MOCK_BETS` and `FALLBACK_BET` (values) here, exported. Field renamed `body → pitch`. **The `BetDetail` and `BetComment` *types* do NOT live here** — they live in `packages/web/src/types/bet.ts` (see §H "Type location") so the runtime page and the hook can import them without crossing the `__fixtures__/` boundary. The fixtures file `import type { BetDetail }`s from `../../types/bet`. Type flows page-side → fixtures; values flow fixtures → stories/tests. No cycle.

**Permitted importers:**
- `packages/web/src/pages/WorkBet.stories.tsx`
- Any `*.test.ts` / `*.test.tsx` file under `packages/web/src/__tests__/`
- Any `*.spec.ts` Playwright file under `packages/web/e2e/`

**Forbidden importers:** all other production source files in `packages/web/src/`. The forbiddance is enforced structurally by an ESLint `no-restricted-imports` override (§E), not by string grep.

`@lore` on `__fixtures__/work-bet-fixtures.ts`: **"L16 AC-3: any production module that imports values from this directory is a bug. The ESLint override at `eslint.config.js` (the `__fixtures__` block) enforces this. Type-only imports are allowed (TS-erased; no runtime coupling)."**

Stories invoke the page via `<WorkBet overrideBet={MOCK_BETS.b1} />`. The page module never reads from `__fixtures__/` — see §A step 3 and §H.

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

- Import `MOCK_BETS` (and a small set of inline-built fixtures for the new states) from `../__fixtures__/work-bet-fixtures.ts`.
- Switch every story from `overrideBetId="…"` to `overrideBet={MOCK_BETS.b1}` (or the relevant fixture). The `overrideBetId` prop no longer exists (§A step 3).
- Add three new exports:
  - `WithRichPitch` — fixture bet whose pitch contains H1, H2, paragraph, unordered list, fenced code block, blockquote.
  - `EmptyPitch` — fixture bet whose pitch is `""`.
  - `MalformedPitch` (optional polish per reviewer suggestion) — fixture bet whose pitch contains an mdast node that maps to `kind: "unknown"` (e.g., a YAML frontmatter block) so the visual fallback path is exercised. Sized small (under the 256 KB cap; the body-too-large path is not exercised here — too expensive to render in stories).
- Existing exports (`KnownBet`, `ShapedBet`, `UnknownBet`, `Loading`) keep their names; their data source moves to the fixtures file and they pass `overrideBet` instead of `overrideBetId`.

### E. New Vitest: `packages/web/src/__tests__/WorkBet.pitch.test.tsx`

Mounts `WorkBet` with `overrideBet` (or — for the pure-derive case — calls `deriveBlocks` directly, no React render) and asserts:

1. **`renders pitch with no '#' symbols visible`** — render fidelity. Render a fixture bet whose pitch contains heading+paragraph+list+quote+code+table+divider. Assert the heading text appears inside a real `<h1>`/`<h2>` (not as raw text), and that no literal `#` (line-leading), `**`, or ```` ``` ```` markers appear in `textContent` outside `[data-ds-kind="code"]` or `[data-ds-kind="unknown"]` regions. Assert each expected kind renders as a `[data-ds-kind="<k>"]` Block element. *(Covers AC-1 at the consumer surface and AC-5's intent at the unit layer. DOM-only — does not exercise the structural lossless contract; that's case 2.)*

2. **`preserves all kinds round-trip via deriveBlocks`** — structural round-trip lossless, no DOM. Pure call to `deriveBlocks(pitch, { kind: "bet", id: "b1" })`. Feed a pitch that contains every supported non-`unknown` `BlockKind` (heading, paragraph, list, blockquote, code, table, divider, html). Assert `deriveBlocks(pitch).blocks.map(b => b.payload.kind)` covers every input kind without loss — i.e. for every kind in the input set, at least one output block carries that kind, and the order of distinct kinds in the output matches the order of the input markdown's top-level nodes. *(This is the AC-4 contract: "round-trip is lossless for supported block types." It does NOT touch the DOM.)* If `id-stability.test.ts` or `round-trip.test.ts` in `packages/shared/src/__tests__/blocks/` already prove this for the same fixture, cite that test in a header comment and SHRINK case 2 to just the "all expected kinds appear" assertion (avoid duplication of L2's golden suite). Builder confirms by reading `packages/shared/src/__tests__/blocks/round-trip.test.ts` at the start of the red phase.

3. **Block ids stable across re-parse.** Render the page twice with the same pitch; collect all `data-block-id` attributes; assert identical ordered arrays. *(Covers AC-2 at the consumer surface.)*

4. **Editing one block leaves OTHER block ids unchanged.** Render with a 4-block pitch; rerender with the same pitch except block #2's text appended ` foo`; assert blocks #1, #3, #4 retain their ids. Block #2's id changes. *(Covers AC-4's "editing one block leaves others unchanged" at the consumer level.)*

5. **Empty pitch renders nothing.** With `pitch: ""`, no `[data-testid="bet-pitch"]` element exists.

6. **Whitespace-only pitch renders nothing.** With `pitch: "   \n\n  "`, ditto.

7. **Malformed pitch renders `unknown` payload without crashing.** Render with a pitch whose body triggers the `unknown` fallback (e.g. an mdast node-type the L2 derivation does not recognise, such as YAML frontmatter, or content sized just over `MAX_BODY_BYTES` to exercise the `body-too-large` reason). Assert the `<section data-testid="bet-pitch">` mounts, contains at least one `[data-ds-kind="unknown"]` element, and the test does not throw. *(Optional polish per reviewer suggestion; defends `UnknownPayload` against regression and is the unit-layer mate of the `MalformedPitch` story.)*

8. **API hook is the runtime data source (positive AC-3 path).** Mount `WorkBet` WITHOUT `overrideBet`, mocking `useBet` (Vitest module mock on `../hooks/useBet`) to return `{ data: shapedBet, loading: false, error: null }`. Assert the rendered pitch matches `shapedBet.pitch`'s derived blocks (e.g. the first block's text content matches the first heading of `shapedBet.pitch`). *(Proves runtime data flows from the API hook, not from a smuggled fixture import. Pairs with §F's ESLint rule — which proves the negative — to fully cover AC-3.)*

### F. ESLint rule — enforce `__fixtures__/` is stories/tests-only

Edit `eslint.config.js`. Add a new override block AFTER the existing `packages/web/src/**/*.{ts,tsx}` blocks:

```js
{
  // L16 AC-3: production code in packages/web/src/ must NOT import values
  // from any __fixtures__/ directory. Stories (*.stories.tsx) and tests
  // (*.test.ts, *.test.tsx) are exempt; they're whitelisted by file pattern
  // in the override below.
  files: ["packages/web/src/**/*.{ts,tsx}"],
  ignores: [
    "packages/web/src/**/*.stories.tsx",
    "packages/web/src/**/*.test.ts",
    "packages/web/src/**/*.test.tsx",
    "packages/web/src/**/__fixtures__/**",
  ],
  rules: {
    "no-restricted-imports": ["error", {
      patterns: [{
        group: ["**/__fixtures__/**", "**/__fixtures__"],
        message:
          "Production code must not import from __fixtures__/. Fixtures are stories/tests only (L16 AC-3). Use props (e.g. overrideBet) to inject test data.",
      }],
    }],
  },
}
```

This enforces AC-3 at the toolchain layer: any `import { … } from "../__fixtures__/work-bet-fixtures"` (or any aliased / re-exported / dynamic-string path that resolves through `__fixtures__/`) in a non-story, non-test file in `packages/web/src/` is a `bun run lint` failure.

**Why this beats a substring test.** A `fs.readFileSync` substring grep against `WorkBet.tsx` only catches the specific strings (`# Problem`, `## Appetite`) the author thought to search for; renaming a fixture string silently bypasses it. The ESLint rule catches the structural violation — *any* `__fixtures__/` import edge — regardless of the symbols at either end. It also catches the violation at lint time (every commit) rather than only when the unit suite is run.

**Type-only imports.** TypeScript erases `import type { … }` at build time. The rule above blocks them as well (it runs on the `import` AST node, not just runtime imports). To allow the runtime page to import `BetDetail` *as a type*, define the type in `packages/shared` or in a non-`__fixtures__/` location, OR add `allowTypeImports: true` to the rule (supported by `no-restricted-imports` since ESLint v9 / `@typescript-eslint/no-restricted-imports`). The simpler choice — and the one this architecture takes — is to define the runtime `BetDetail` type alongside the runtime page (or in a dedicated `packages/web/src/types/bet.ts`), and let the fixtures file IMPORT that type. Type flows page → fixtures, values flow fixtures → stories/tests. No cycle.

**Test for the rule itself.** None added. ESLint's own self-test suite plus a smoke test (intentionally add a forbidden import, run `bun run lint:eslint`, observe the failure, revert) is sufficient. We do not commit a "lint rule works" test.

### G. New Playwright: `packages/web/e2e/L16-bet-pitch.spec.ts`

1. Navigate to `/work/bet/b1` (or whatever bet route exists in `router.tsx` — confirm during build).
2. Wait for `[data-testid="bet-pitch"]` to be visible.
3. Assert the pitch's first heading renders as a real `<h1>` or `<h2>` whose `textContent` does NOT start with `#`.
4. Assert no visible text inside `[data-testid="bet-pitch"]` matches `/^#\s/m` (line-leading hash + space — the markdown heading syntax). `[data-ds-kind="code"]` blocks are excluded since `#` may legitimately appear in code.
5. Assert at least one `[data-ds-component="block"]` exists inside the pitch section.
6. Assert the legacy `<pre data-testid="bet-pitch-body">` is NOT present anywhere on the page (positive structural removal guard, mirrors L15's drag-removal pattern).

### H. Required (L14 has not landed): data-fetch wiring — `useBet` hook

**Verified at design time:** `git log --oneline | grep -iE "L14|bet.*fetch|useBet"` returns zero hits on `main`. `WorkBet.tsx:194` still reads from inline `MOCK_BETS`. L16 owns the wiring; this section is **required**, not conditional.

New file: `packages/web/src/hooks/useBet.ts`.

```ts
import { useEffect, useState } from "react";
import type { BetDetail } from "../types/bet";

export interface UseBetResult {
  data: BetDetail | null;
  loading: boolean;
  error: Error | null;
}

export function useBet(betId: string | undefined): UseBetResult {
  const [state, setState] = useState<UseBetResult>({
    data: null,
    loading: betId !== undefined,
    error: null,
  });
  useEffect(() => {
    if (!betId) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    let cancelled = false;
    setState({ data: null, loading: true, error: null });
    fetch(`/api/bets/${encodeURIComponent(betId)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Bet fetch failed: ${res.status}`);
        return res.json() as Promise<BetDetail>;
      })
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            data: null,
            loading: false,
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [betId]);
  return state;
}
```

Page wiring in `WorkBet.tsx`:

```tsx
const { betId: routeBetId } = useParams<{ betId: string }>();
const fetched = useBet(overrideBet ? undefined : routeBetId);
const bet = overrideBet ?? fetched.data;

if (loading || (!overrideBet && fetched.loading)) {
  return <SkeletonCard …/> + <SkeletonList …/>;
}
if (!overrideBet && fetched.error) {
  return <ErrorState …/>;
}
if (!bet) {
  return <ErrorState title="Bet not found" …/>;
}
// … rest of the existing render path, using `bet`.
```

`@lore` on `useBet.ts`: **"L16: thin one-shot fetch hook for `GET /api/bets/:id`. No caching, no retry, no SWR — when a real data layer (React Query, RSC, etc.) lands track-wide, replace this hook in one edit. The hook is intentionally local to `packages/web/src/hooks/` rather than a shared service so the replacement diff is contained."**

**Type location.** `BetDetail` lives in a NEW file `packages/web/src/types/bet.ts` (not in `__fixtures__/`, not in `WorkBet.tsx`, not in `packages/shared` — it's a page-shape type, not a wire type). The fixtures file imports the type from there. The runtime page imports the type from there. The hook imports the type from there. All non-fixture imports are clean of `__fixtures__/`.

`@lore` on `types/bet.ts`: **"BetDetail is the shape the WorkBet page consumes. It MIRRORS — but is not literally — the `bets` row from the API; if the wire shape diverges, this type is the page-side normalisation surface."**

## Test plan

### Vitest (red phase)

| File | Covers AC |
|---|---|
| `packages/web/src/__tests__/WorkBet.pitch.test.tsx` (NEW) | AC-1, AC-2, AC-4, partial AC-5 |
| `packages/web/src/__tests__/useBet.test.ts` (NEW) | AC-1 (data path), AC-6 (no regressions) |

The fixture-isolation invariant (AC-3) is enforced by the ESLint rule in §F, NOT by a Vitest test. The previous draft proposed a `fs.readFileSync` substring grep against `WorkBet.tsx`; that proposal is **dropped** because (a) it only catches the specific strings the author thought to search for and is silently bypassed by any rename, and (b) ESLint already covers the structural invariant ("any `__fixtures__/` import edge from production code") at lint time on every commit.

`useBet.test.ts` covers the new hook in isolation: mocks `fetch`, asserts loading→data, loading→error, and cancellation on betId change.

### Stories (review surface)

| Story | What it proves |
|---|---|
| `WithRichPitch` | Visual proof of all common kinds rendering. |
| `EmptyPitch` | Empty case renders nothing. |
| `MalformedPitch` (optional) | `unknown` block fallback path renders without crashing. |
| Existing `KnownBet` / `ShapedBet` | Migration didn't regress. |
| `Loading` (existing) | Skeleton path still works after `useBet` wiring. |

### Playwright (e2e)

| File | Covers AC |
|---|---|
| `packages/web/e2e/L16-bet-pitch.spec.ts` (NEW) | AC-5 |

The existing `block-render.spec.ts` (currently `test.fixme`d, deferred under L2-FU-8) is **not** un-fixme'd by L16 — that spec is for the design-system viewer route and remains its own follow-up. L16's spec is independent and tests the production WorkBet page (which now serves real data via `useBet`).

The Playwright spec needs a real bet row in the seed DB. `packages/db/src/seed.ts:174` already seeds at least one bet with a `pitch` field — confirm the seeded bet's id and use it as the route param. If the seeded pitch is too sparse to exercise multiple block kinds, ADD a richer pitch to the seed (separate commit, but blocked-into the same PR — the seed change is small and bounded). The seed change is the only DB-touch in L16; it's still under "no schema changes" because it edits seed values, not migrations.

## Acceptance criteria → test mapping

| AC | Verification |
|---|---|
| AC-1: pitch renders as styled blocks; `<pre>` replaced | `WorkBet.pitch.test.tsx` case 1 (asserts `[data-ds-kind=*]` blocks present, no markdown markers visible); `L16-bet-pitch.spec.ts` step 6 (asserts `<pre data-testid="bet-pitch-body">` is absent). |
| AC-2: block ids stable per L2 | `WorkBet.pitch.test.tsx` case 3. |
| AC-3: hardcoded pitch fixtures only in stories/tests | ESLint `no-restricted-imports` rule (§F) — enforced at every `bun run lint` invocation; CI (`bun run verify`) is the gate (negative invariant). `WorkBet.pitch.test.tsx` case 8 — proves `useBet` is the runtime data source (positive invariant). |
| AC-4: round-trip lossless on supported kinds | `WorkBet.pitch.test.tsx` case 2 — structural assertion that `deriveBlocks(pitch).blocks` covers every supported kind in the input pitch. If `packages/shared/src/__tests__/blocks/round-trip.test.ts` already proves this for the same fixture pitch, case 2 cites it and shrinks to a "kinds present" check. |
| AC-4: ids stable across re-parse | `WorkBet.pitch.test.tsx` case 3 (consumer-level) + L2's `id-stability.test.ts` (unit-level). |
| AC-4: editing one block leaves others unchanged | `WorkBet.pitch.test.tsx` case 4. |
| AC-5: open a bet → pitch renders with no `#` symbols | `L16-bet-pitch.spec.ts` steps 3, 4, 5; `WorkBet.pitch.test.tsx` case 1 covers the same intent at the unit layer. |
| Optional polish: malformed pitch falls back to `UnknownPayload` without crashing | `WorkBet.pitch.test.tsx` case 7; `MalformedPitch` story (visual proof). |
| AC-6: check + lint + test green; e2e suite green | `bun run verify` + full `bun run e2e`. |

## Ordered task breakdown for builder

1. **Read L2's existing test surface.** Open `packages/shared/src/__tests__/blocks/round-trip.test.ts` and `id-stability.test.ts`. Decide whether case 2 in §E shrinks to a "kinds present" assertion (if L2 already covers structural lossless on the same kinds) or adds a full structural deep-equal (if L2's fixtures don't overlap). Record the decision in the PR description.
2. **Red phase — Vitest + Playwright.** Write `WorkBet.pitch.test.tsx`, `useBet.test.ts`, and `L16-bet-pitch.spec.ts` before any source change. Confirm all three fail (Vitest cases fail because page still uses `<pre>`; e2e fails because seed bet's pitch is sparse OR because the legacy `<pre>` is still present).
3. **Add ESLint rule.** Edit `eslint.config.js` per §F. Run `bun run lint:eslint` — should still pass (no `__fixtures__/` exists yet, so no edge to flag).
4. **Add `BetDetail` type module.** Create `packages/web/src/types/bet.ts` carrying `BetDetail` and `BetComment` types (renamed `body → pitch`).
5. **Move fixtures.** Create `packages/web/src/pages/__fixtures__/work-bet-fixtures.ts`. Migrate `MOCK_BETS` + `FALLBACK_BET` here; the file `import type`s `BetDetail` from `../types/bet`. Rename the type imports in `WorkBet.tsx` to `import type { BetDetail } from "../types/bet"` (still importing the values from the local `MOCK_BETS` constant for now). Run `bun run lint:eslint` — should still pass (page imports the type from `types/bet`, not from `__fixtures__/`).
6. **Add `useBet` hook.** Create `packages/web/src/hooks/useBet.ts` per §H. Run `useBet.test.ts` — green.
7. **Runtime page swap.** In `WorkBet.tsx`:
   - Delete inline `MOCK_BETS` and `FALLBACK_BET` (the migration to `__fixtures__/` is now complete).
   - Remove the `overrideBetId` prop; add `overrideBet?: BetDetail` prop.
   - Wire `useBet(routeBetId)`; add the `loading` and `error` branches (existing `SkeletonCard`/`SkeletonList` for loading; `ErrorState` for error and not-found).
   - Replace `<pre>` block at lines 256-268 with `<BetPitch pitch={bet.pitch} betId={bet.id} />`.
   - Add the `BetPitch` helper per §C. Add the `Block` and `deriveBlocks` imports.
   - Run `bun run lint:eslint` — should still pass; if it flags an `__fixtures__/` import edge, the cleanup wasn't complete (the rule is doing its job).
   - Run `bun run check` — green.
8. **Update stories.** Edit `WorkBet.stories.tsx` per §D: import from `__fixtures__/`, switch to `overrideBet`, add `WithRichPitch`, `EmptyPitch`, and (optional) `MalformedPitch`. Update `Loading` story to keep working with the new prop shape.
9. **Update seed (if needed).** If the existing seeded bet's `pitch` doesn't exercise multiple block kinds, edit `packages/db/src/seed.ts` (and `seed-pg.ts`) to use a richer markdown pitch on at least one bet. Re-seed locally (`bun run db:migrate` or equivalent) and confirm `/work/bet/<seeded-id>` shows the new pitch.
10. **Run Vitest.** All cases of `WorkBet.pitch.test.tsx` and `useBet.test.ts` green.
11. **Run Playwright.** L16 spec green; existing e2e suite (`bun run e2e`) green.
12. **Verify gate.** `bun run verify` — zero check / lint / test failures.
13. **Visual proof.** Open `/designsystem` → navigate to `Page: Work/Bet` → screenshot `WithRichPitch`. Confirm no `#`, no `<pre>` rectangle, no double-card chrome. Then open the running app at `/work/bet/<seeded-id>` and screenshot the live render to prove the data path (not just the story override) works.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| `useMemo` deps churn — `bet.pitch` from a fresh fetch may produce a new string every render even when content is identical | The hash inside `deriveBlocks` is content-keyed; `useMemo` only avoids the parse cost. Even if it re-parses, the block ids are deterministic, so the DOM doesn't churn (React keys match). Acceptable. |
| 256 KB pitch parsed on every render of an unmemoised consumer | `useMemo` keyed on pitch+betId. ⚠️ UNVERIFIED parse cost at the cap; acceptable per L2's existing benchmarking gap. |
| Unknown block kinds render as `[data-ds-kind="unknown"]` and the e2e regex `/^#\s/m` accidentally hits the raw text inside a fallback | The fallback renders `raw.slice(0, 500)` inside `<UnknownPayload>` which is a `<pre>` per L2. The e2e step 4 excludes both `[data-ds-kind="code"]` AND `[data-ds-kind="unknown"]`. Captured in §G step 4. |
| ESLint `no-restricted-imports` rule blocks legitimate type-only imports | The architecture takes the cleaner path: `BetDetail` lives in `packages/web/src/types/bet.ts`, so no production module needs to type-import from `__fixtures__/`. Fixtures import the type from `types/bet`, not the other way around. No exemption needed. |
| BetComment field rename leaks scope | Out of scope. Comments stay `body`. Test assertions only touch the pitch field. |
| Story/fixture barrel adds an `index.ts` that gets imported by accident | Use a single non-barrel module; do not export from `packages/web/src/pages/index.ts` (which doesn't exist). The fixtures file path is the only entry. |
| L18's eventual `BlockHandle` wiring requires Block prop changes that are awkward to retrofit | Block already exposes `slots.gutterLeading`, `onOpenActions`, `onCopyPermalink` (`Block.tsx:55-71`). L18 adds props at the WorkBet call site without changing Block's signature. No retrofit risk. |
| `useBet` is a one-shot fetch — no caching, no revalidation | Acceptable for v1. The `@lore` on `useBet.ts` flags this as a deliberate placeholder for a future shared data layer. |
| `useBet` cancels stale responses but doesn't deduplicate concurrent fetches across multiple consumers | L16 has exactly one consumer (`WorkBet`). Concurrent dedup is a future concern. |
| Seed pitch update could break an existing test that asserts on the seeded pitch text | Grep `packages/web/e2e/` and `packages/server/src/routes/__tests__/` for the current seed pitch strings BEFORE editing. If any test asserts on the literal pitch, update the assertion in the same commit. |

## Rollback / migration concerns

- **Renaming `body → pitch` on `BetDetail`** has zero external consumers (the type was previously `MockBetDetail` and local to `WorkBet.tsx`). Safe.
- **Removing `overrideBetId`** has one external consumer: `WorkBet.stories.tsx`. Updated atomically in step 8 (stories switch to `overrideBet`).
- **Moving `MOCK_BETS` to `__fixtures__/`** has one external consumer: `WorkBet.stories.tsx`. Updated atomically in step 8. The ESLint rule will catch any regression that re-introduces a fixture import in production code.
- **The `<pre data-testid="bet-pitch-body">` selector** is referenced by no current test (`grep -r 'bet-pitch-body' packages/web/` confirms). Safe to delete. The new selector `[data-testid="bet-pitch"]` is introduced fresh.
- **`useBet` introduction.** Net-new file at `packages/web/src/hooks/useBet.ts`. No existing consumer; nothing to migrate. When a track-wide data layer lands (React Query, RSC, etc.), the hook is replaced in one edit; the page-level call site (`useBet(routeBetId)`) is the only touchpoint.
- **L18 forward compatibility.** L18 will pass `onOpenActions` / `onCopyPermalink` / `slots.gutterLeading={<BlockHandle … />}` from `BetPitch`. The L18 diff is additive — no L16 line dies in L18.

## Open questions parked for the reviewer

1. **`UnknownPayload` raw rendering.** If the fallback renders `raw.slice(0, 500)` containing `# Problem`, the e2e regex `/^#\s/m` would false-positive against an `unknown`-kind block. The mitigation excludes `[data-ds-kind="unknown"]` from the assertion (§G step 4). Reviewer should confirm that's the right behavior, or flag if "unknown blocks must also strip markdown markers" — which would imply a deeper change in `UnknownPayload`.
2. **Seed pitch ownership.** Step 9 may edit `packages/db/src/seed.ts` if the existing seed bet's pitch is too sparse to exercise multiple kinds. The seed change is small and bounded but does cross a package boundary. Reviewer confirms scope.

(Resolved during this revision pass: §G/§H scope — `useBet` is required, not conditional; `overrideBet` chosen over `overrideBetId`; fixtures-isolation enforced by ESLint not by substring grep; round-trip test split from render-fidelity test.)
