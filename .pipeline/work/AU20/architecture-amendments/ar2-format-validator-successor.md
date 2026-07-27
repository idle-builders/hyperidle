# AU20 architecture amendment — AR2 format validator successor state

## Decision

The AR2 format validator intentionally pinned the then-pending Cursor lifecycle
architecture and old structural probe. That successor is now committed with refreshed
architecture and a reproducible probe, so the formatter validator rejects legitimate
final state before reaching its own clean-commit scope check.

Update only the formatter validator to bind the committed lifecycle receipt and final
hashes. Its green scope state must accept clean committed `[]`, historical exact AR2
candidate, or exact validator-self correction candidate. Read staged/unstaged paths
separately and reject any overlap or other scope. Preserve formatter diff, semantic
tokens, idempotency, target test hash, guards, registry, package, lock, and census.

Final lifecycle receipt is exact:

- commit `d1d4fc799a098fef6f4634301ff28021abb86164`
- tree `11655200ad7877d2f1c5086bdd28b012b620863e`
- parent `ec9f7b39409baadc3b732e269cef7cdcfc51ec32`
- subject `AU20: make Cursor guard evidence reproducible`
- architecture `89f4664538ed4069092140bea4ff1163a81ddb81c78babd8a6a12afce77c3f35`
- feasibility `3af1378776c9544d0e372a6dbb152f03e8aed0de5be4ade33c233de63b2beeac`
- direct probe `852e6d63e6ca14fa372f6def10be2ac42e8b039015092c154639f85b53c43779`
- state validator `8fc986e259148c2d570935dddb092e14f9dbb93f7e7fb9d478ad1171e2991ad6`
- state evidence `448bcad2b10d618a6f2df83ba719612cbc4c78e200e320e53b8cc85c2f94b360`
- committed progress `1665ac08ff6d77c6b9adbb77b943d13d72a91fc683902cbcee3267c420cc0615`

Validator checks the named immutable commit object with
`git show d1d4fc799a098fef6f4634301ff28021abb86164`, not `HEAD` and not only
mutable files. Current `HEAD === d1d4fc...` is required only in the old/missing-seams
red branch. The committed progress hash is computed from
`git show d1d4fc...:.pipeline/work/AU20/progress.json`; live progress may advance
during finalization without invalidating the historical receipt.

## Acceptance criteria

- Static red pins HEAD `d1d4fc799a098fef6f4634301ff28021abb86164`, exact stale
  lifecycle hash diagnostic, and final successor receipt/hashes.
- Validator exports side-effect-free `readScopeState(cwd)`,
  `classifyGreenScope(scope)`, `classifyValidationState(contentState, scopeState)`,
  and `main()`. The combined classifier is the single SUT seam implementing the
  content×scope table; red proof calls it directly for every row. Import performs no
  reads, hashes, Git, Biome, output, or exit. Source AST permits top-level imports,
  literal/pure declarations, function declarations, and the sole is-main conditional;
  all operational calls must be inside exported functions or `main`. Direct execution uses
  `import.meta.url === pathToFileURL(resolve(process.argv[1])).href`.
- Content/scope table is exact: baseline+clean => historical red exit1;
  formatted+clean => pass; formatted+AR2-only => historical candidate pass;
  formatted+validator-self => correction candidate pass; every unknown hash, overlap,
  or other combination => exit2.
- Disposable Git matrix independently asserts staged paths, unstaged paths, union, and
  intersection. It proves clean, AR2 all-staged, AR2 all-unstaged, self, partial,
  unrelated, self-combinations, partial-stage same-path overlap, and staged
  cancellation. Any intersection rejects before union classification. The state proof
  feeds every resulting scope plus exact baseline/formatted/unknown content states into
  the exported combined classifier; it must never validate only a local mirror.
- Corrected validator, Biome, targeted 71, check/lint/test, and census 23/231/181/412
  are green. No test, guard, registry, product, gate, package, lock, or census change.

## Technical task tree

#### `pin-successor-drift`
- **Kind:** implementation
- **Owns:** `file:.pipeline/work/AU20/probes/validate-ar2-format-validator-state.mjs`, `file:.pipeline/work/AU20/red-proofs/ar2-format-validator-state.json`
- **Consumes:** formatter validator, committed lifecycle receipt
- **Verify:** red only for exact stale successor binding/current clean failure
- **Parallel:** no

#### `bind-final-successor`
- **Kind:** implementation
- **Depends on:** `pin-successor-drift`
- **Owns:** `file:.pipeline/work/AU20/probes/validate-cursor-ar2-format.mjs`
- **Consumes:** accepted state proof
- **Verify:** state validator + formatter validator + focused/full gates green
- **Parallel:** no

## Contracts

Historical frozen bytes are: format architecture
`12978af87828fc6c442db32fe6527e30684c87fbedbe90b84c0faa687691183a`,
feasibility `4838899422a5be6c09331692dda0bdef487e3e1cfa862160be55f5eec42996a`,
proof `927f904cfe5f6e4830b98340e3f3a167965972ddf07b049afbc54467d74726cb`,
baseline AR2 `b75a3367d137dcd56a11969ee0fb91422fdfa935e7381d276cb95ddd8ec796be`,
formatted AR2 `40637c22d91d495e1b91d2176200974be65bf89386cd1a8849761d2e1c557e02`,
the unique fragment transform, semantic-token equivalence, two-pass Biome
idempotency, and exact focused-red diagnostic. Only obsolete successor hashes and
validator lifecycle wiring may change.

## Security and abuse

Validation infrastructure only; runtime security categories are N/A.
