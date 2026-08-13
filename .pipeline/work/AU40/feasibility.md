# AU40 — Feasibility

**Date:** 2026-08-13. **Tree:** `origin/main` / HEAD
`fe723ab876f444be00e1b6761d7dd56d488318fc`. **Verdict:** GO, with causal gating.

## Current no-isolate evidence

Command, without editing the tree:

```sh
/usr/bin/time -p npx vitest run --config vitest.integration.config.ts \
  --project service --no-isolate --reporter=json \
  --outputFile=/tmp/au40-architecture-repro.json
```

| measure | result |
|---|---:|
| wall | 106.86s |
| total | 2,865 |
| passed | 2,836 |
| failed | 25 |
| pending | 4 |
| failing files | 14 |

Ten failing files were in AU38's 23-file union. Two additional failures had the same request-row/drain shape.
Two failures (`filesystem-local-diff-sources`, `git-worktree-live-proof`) coincided with local `ENOSPC` and are
excluded from AU40 causal claims. The run again shows the ~3× local wall prize and an order-dependent bounded
cluster while per-test truncate remains active. It is not completion evidence.

Source census corrected one earlier false claim: exactly three service files have actual top-level
`vi.mock(...)` calls—`factory-run-config`, `server-disposal`, and
`agent-and-team-creation-atomicity`. Two other search hits are comments saying “No `vi.mock`.” Vitest documents
that module reset does not clear the mock registry, so local reset plus explicit unmock is feasible if a
focused pair proves one of these files leaks.

## Maintainer ruling and causal gap

Option A is binding: AU40 fixes only owners proven causal by a no-isolate owner→victim reproduction. It does
not provide production-wide quiescence or require every async app owner to join before database close. Broad
shutdown cleanup is separate scope.

Current AU38/current JSON identifies failing victims, not the file that completed immediately before each
victim on the same worker. Source inspection shows plausible gaps in lifecycle projection, run runtime,
routine scheduler, app disposal, and dropped server promises, but none is a confirmed AU40 owner without the
focused pair. Therefore the exact confirmed owner set is currently **zero** and the missing predecessor map is
the sole evidence blocker—not a feasibility blocker, because the plan already requires reproduce → fix →
re-run.

The implementation must first add temporary worker/file-order reporting, then enforce one worker and exact
owner→victim order for three red repeats. A candidate enters scope only when the victim alone is green and the
ordered pair fails. After the smallest cleanup, the same pair must pass three times. Full repeated and shuffled
runs discover any remaining owners.

## Scope and size

Unconditional work is the service config flip plus lore/rule corrections. Candidate repairs are bounded to
the proven predecessor file and the shortest cleanup path it exercises. Removed from the design absent proof:

- worker-global app-owner registry and 167-call `createTestApp` census;
- routine-scheduler stop/join;
- global async `disposeApp`/boot/server propagation;
- eval scenarios, unit-only runtime helpers, O3 constructors, and blanket direct-owner rewrites;
- any claim that all production drains finish before DB close.

Expected total is **250–650 LOC**, including focused tests and likely file-local mock cleanup, below the
repository's 1,000 LOC complexity stop. If proven causal repairs approach 1,000 LOC, stop for maintainer split.

## Feasibility verdict

GO. The performance prize and bounded failure cluster reproduce on current HEAD; per-test database cleanup
does not need to change. The narrow causal loop can distinguish owners from victims before production code is
touched. No new dependency, schema, route, UI, or security mechanism is needed.
