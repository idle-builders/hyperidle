# AZ7 measurement — the instruments, not their output

These four scripts are the reproducible method behind AZ7's numbers. **Their output is deliberately not
committed.** An earlier revision of this branch committed ~10,000 lines of generated JSON; it mixed
before-AZ7 and after-AZ7 snapshots with nothing marking which was which, so it read as one snapshot and
went stale the moment the code moved.

| Script | What it does | How to run |
|---|---|---|
| `predicates.mjs` | Emits `predicate-sites.json` — every control-chrome and hand-rolled-chip site with file, line, tag and the class string that made it a violation | `node predicates.mjs "$REPO_ROOT" <outDir>` |
| `render-backlog.mjs` | Reads that JSON and renders `migration-backlog.md` | `node render-backlog.mjs <outDir> "$REPO_ROOT"` |
| `scan.mjs` | The broader per-axis population scan (radius spellings, surface fills, status sites, button and input recipes) behind `plan.md` §1 | `node scan.mjs "$REPO_ROOT" <outDir>` |
| `measure.eslint.config.ts` | The standalone config the measurement ran the design rules under | — |

`npm run design:backlog` regenerates the backlog. `npm run design:backlog:check` — wired into
`npm run verify` — re-runs `predicates.mjs` + `render-backlog.mjs` into a throwaway directory and fails if
the committed `migration-backlog.md` no longer matches, so the list cannot drift from the code.

`predicates.mjs` and `render-backlog.mjs` are load-bearing: the gate runs both. Deleting either makes
`npm run verify` fail with "generator script missing".
