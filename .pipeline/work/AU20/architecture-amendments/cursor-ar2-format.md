# AU20 architecture amendment — Cursor AR2 formatting

## Decision

The committed Cursor test correction is behaviorally green but one array literal in
the AR2 test does not match Biome's canonical layout. Apply Biome formatting to that
single file only. Preserve parsed TypeScript structure, test names, fixture strings,
assertion values, and all 71 targeted behaviors.

## Acceptance criteria

- Static red binds exact file/hash and focused Biome exit 1/diff.
- `npx biome format --write packages/db/src/__tests__/ar2-coverage-guard.test.ts`
  is the only write; repeated formatting is byte-idempotent.
- AST/token semantics remain unchanged, proven directly by this format leaf's
  validator. The older Cursor structural probe is known lifecycle-red on both clean
  committed and AR2-only candidate states; it is frozen and explicitly not a format
  gate. Its already-accepted structural assertions are reactivated by the immediately
  following lifecycle correction after the formatted AR2 hash is refreshed.
- Focused Biome exits 0. `npx vitest run
  packages/db/src/__tests__/ar1-honest-harness-guard.test.ts
  packages/db/src/__tests__/ar2-coverage-guard.test.ts` exits 0 with 2 files / 71
  tests. Check/lint/test and census 23/231/181/412 stay green.
- Guard, registry, AR1, product, gates, packages, locks, and census are frozen.

## Technical task tree

#### `pin-ar2-format-red`
- **Kind:** implementation
- **Owns:** `file:.pipeline/work/AU20/probes/validate-cursor-ar2-format.mjs`, `file:.pipeline/work/AU20/red-proofs/cursor-ar2-format.json`
- **Consumes:** AR2 test and Biome
- **Verify:** red only for exact canonical formatter diff
- **Parallel:** no

#### `format-ar2`
- **Kind:** mechanical
- **Depends on:** `pin-ar2-format-red`
- **Owns:** `file:packages/db/src/__tests__/ar2-coverage-guard.test.ts`
- **Consumes:** accepted red proof
- **Verify:** format twice byte-identical; format-leaf validator proves semantic-token identity; exact two-file Vitest command/count above; `npm run check`, `npm run lint`, `npm run test`, and `npx tsx scripts/surface-census.ts --table` exit 0
- **Parallel:** no

## Contracts

No behavior change. Only whitespace/layout emitted by installed Biome is permitted.
Validator compares semantic token stream before/after and rejects any other tracked
path.

The committed Cursor structural probe is frozen, not invoked as a green gate in this
leaf, because its accepted pre-format lifecycle contract requires either both tests
dirty or a future clean-state fix. The next ordered leaf refreshes its frozen AR2 hash
and completes that already-planned lifecycle correction.

**Closeout barrier:** AU20 must remain `in_progress` / `NOT DONE`; aggregate closeout,
final review, retro, and ship are forbidden after the format commit until the dependent
Cursor probe lifecycle leaf is red-reviewed again against the formatted AR2 hash,
implemented, strictly reviewed, and individually committed.

Precondition: prior Cursor leaf is committed and the tracked worktree/index are clean
before red proof and before write-code. Lifecycle evidence may remain untracked; it is
not part of tracked diff scope. If any tracked path other than AR2 is dirty, stop.

## Security and abuse

Formatting only; runtime security categories are N/A.
