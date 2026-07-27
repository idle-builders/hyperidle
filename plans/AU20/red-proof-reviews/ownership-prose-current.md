# AU20 F8 ownership prose static-red review

VERDICT: accept

Reviewed `.pipeline/work/AU20/probes/validate-ownership-prose.mjs` at SHA-256
`3682edd915912afc61fe6737ddaf81a2e7eeacf405ea527ab6cd1dff1923c330`.

- `node --check .pipeline/work/AU20/probes/validate-ownership-prose.mjs`: exit 0.
- `node .pipeline/work/AU20/probes/validate-ownership-prose.mjs`: exit 1,
  truthfully naming only the two F8 target paths.
- Stable claim IDs report four inventoried obsolete claims and two missing
  exact positive replacement statements.
- Historical occurrences are path-bound and allowlisted. Any remaining
  deleted-owner occurrence fails after exact obsolete and historical inventory
  subtraction.
- TypeScript AST checks ignore comments and strings and bind both replacement
  owners to exported production entrypoints and unconditional live
  registration paths.
- No product or census files changed. Fresh census remains 23 services,
  231 methods, 181 types, 412 total.

The static red proof is accepted. Write-code authorization may change ownership
comments only in:

1. `packages/agent-orchestration/src/index.ts`
2. `packages/core-api/src/services/durable-agent-queue.ts`

The validator, review, product behavior, exports, and census are frozen.
