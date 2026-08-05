# AU26 — table-ownership census probe (round 3)

Reproduces feasibility §P6 and architecture §D-G. Run from the repo root.

```
npx tsx .pipeline/work/AU26/probes/census/census.ts "$PWD" all
```

- `census.ts` — reimplements the guard's own `checkAccess` (**all three** branches: direct
  `.from/.insert/.update/.delete(identifier)`, value import from `@hyperidle/db`, namespace property
  access) over every `packages/*/src` and `packages/*/*/src` non-test file, with
  `UNOWNED_SHARED_TABLES` deleted and AU26's four new `TABLE_OWNER` rows applied.
  Second arg `closure` restricts the scan to round 2's derived Application-closure scope, which is how
  round 3 showed that scope both pulls in `packages/db/src` and misses `packages/agent-orchestration/src`.
  **Result at `94cc2dfe`: 803 files scanned, 379 findings, 100 file×table pairs, 48 files, 20 tables.**
  This becomes `scripts/table-ownership-census.ts` at increment D0.
- `dependents.mjs` — who depends on whom, and which packages have zero dependents. Shows
  `@hyperidle/agent-orchestration` and `@hyperidle/agent-execution` have **none** at HEAD.
- `owner-closures.mjs` — the transitive `dependencies` closure of each owning Service. Every one is
  exactly `{@hyperidle/db, @hyperidle/shared}`, which is the reachability corollary in §D-G.
