# AU20 feasibility amendment — production Knip test reachability

## Probe

`rg -a` found direct static importers for every file reported by
`knip:production`:

- `cli-adapter-fixtures.ts`: 6 importers
- `dispatch-test-helpers.ts`: 7 importers
- `run-orchestration-test-runtime.ts`: 4 importers
- `worker-runtime-test-helper.ts`: 3 importers

The current script is
`npx knip --production --include files,dependencies,unlisted,binaries`.
Normal `npm run knip` exits zero, while this production-mode file analysis reports
the four helpers. The differing entry reachability explains the result.

## Alternatives

1. **Delete or inline helpers — rejected.** It destroys shared test capability or
   duplicates it across twenty importing tests.
2. **Ignore test helpers — rejected.** It hides real dead files matching the ignore.
3. **Drop production file analysis — rejected after critique.** A production module
   imported only by tests is green in the ordinary graph but correctly red in the
   production graph.
4. **Scoped result classification — selected.** Run both file graphs. In the production
   result, a Knip preprocessor removes only test-owned `files` findings and adjusts the
   matching counter; it leaves production-source findings and every non-file issue
   intact. Ordinary file analysis remains responsible for dead test helpers.

## Verdict

**GO-WITH-CHANGE.** Add the scoped preprocessor and amend the validation command. Pin
the exact helper/importer graph, issue/counter transformation, and adversarial fixtures
for both a dead test helper and production code reachable only from tests before
write-code.
