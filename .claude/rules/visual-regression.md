# Visual Regression: Vitest DOM-Snapshot Net

TSX is the single design source of truth (AJ1). The visual regression gate is a **vitest DOM-snapshot net** — no Playwright, no screenshot PNGs, no Docker, no canonical-Linux platform problem.

## The snapshot net

**File:** `packages/design-system/src/__tests__/catalog-snapshot.test.tsx`

**How it works:**
1. Enumerates all 56 catalogued design-system stories (`src/*.stories.tsx` = 49; `src/kinds/*.stories.tsx` = 7) via `import.meta.glob` + `discoverStories()`.
2. Renders each story variant in jsdom (`createRoot` + `act()`).
3. Serializes the DOM to text: tag + `class` + inline `style` + `data-ds-*` markers + role/aria-* attrs + text. Custom walker — not prettyDOM (avoids truncation and RTL printer coupling).
4. Normalizes nondeterministic ids (`_r_N_` → `__id__`, `:rN:` → `__id__`) and timestamps (ISO 8601 and ms epoch → `__ts__`) so snapshots are cross-run stable.
5. `toMatchSnapshot()` per variant into committed `.snap` files under `__snapshots__/`.

**Runs in:** `npm run test` → `npm run test:all` → `npm run verify`. Zero browser, zero Docker.

**Cross-platform:** Snapshots are serialized DOM text — identical on macOS and Linux/CI. No sub-pixel AA issue.

## What the net catches

- DOM elements added / removed / reordered.
- `className` composition changes — which IS the design-token / spacing / radius / variant signal.
- inline `style` changes.
- `data-ds-*` marker regressions.
- role / aria / structural-id-wiring regressions (ids normalized but presence + cross-reference preserved).

## What the net does NOT catch (honest blind spot)

**Pure-paint regressions with UNCHANGED DOM/class text** — a token CSS value re-mapping behind an unchanged class string, font-rendering shifts, cascade/specificity bugs, real layout geometry. jsdom does not lay out or apply the cascade.

Compensating nets for the blind spot:
- Token re-mapping: `npm run token-guard:check` guards token definitions.
- Off-scale/off-grid/AI-aesthetic: `npm run lint` via `eslint-plugin-design`.
- Removed/renamed variant: `npm run check` (TypeScript strict).
- Painted pixels: the **live TSX viewer at `:8098`** (`npm run ds:serve`) + human `/design` design-critique gate + manual `npx playwright screenshot` of the running app in `/review` and `/product-deep-review` + **PR design-evidence** (`npm run ds:evidence -- --pr <PR>`, run by `/ship` step 6a): before/after Playwright screenshots of changed stories, uploaded to an orphan `pr-evidence/<pr>` branch and linked in the PR body. Local-only, ship-time, not a gate — see `docs/guides/developer/design-system.md#pr-design-evidence-ship-time-local-only`.

## Snapshot location

`packages/design-system/src/__tests__/__snapshots__/catalog-snapshot.test.tsx.snap` — committed to git, text-diffable in PR review.

## When to re-bless

After an intentional component or story change:
1. `npm run test` → snapshot diff shows the changed class/markup with component name.
2. Review the text diff in the PR — confirm it matches the intended change.
3. Re-bless: `npm run ds:bless` (runs `vitest run -u` on the snapshot file) or `npx vitest run -u`.
4. Commit the updated `.snap` in the same PR as the component change.

## Non-negotiable rules

- **Never `-u` without reading the diff.** Blind re-bless degrades the net to noise (see MEMORY: tests must not drive behavior).
- **Never skip the enumeration guard** — `expect(modules.length).toBeGreaterThanOrEqual(56)` must stay. A glob returning `{}` makes the net vacuously green.
- **Never skip the non-empty guard** — `expect(serialized.length).toBeGreaterThan(0)` per variant must stay. A broken serializer must FAIL, not snapshot empty.
- The net runs inside `test:all`; the attestation system records the real exit code. It cannot be bypassed.

## Wiring

- **Local:** `npm run verify` runs `test:all` (includes the snapshot net) as part of the attested suite.
- **CI:** the snapshot net runs via the signed attestation (`scripts/verify-attest.ts` records real exit code; `check-attestation.ts` validates). No dedicated CI step needed — no browser install, no extra CI step.
