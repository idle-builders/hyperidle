# AU20 Knip production test reachability — implementation review

**VERDICT: accept**

Reviewed candidate:

- `package.json#scripts.knip:production`: 1 addition / 1 deletion
- `scripts/knip-production-test-files.mjs`: 24 additions
- total implementation: +25 / -1

The command is exactly:

```text
npx knip --include files &&
npx knip --production --include files,dependencies,unlisted,binaries \
  --preprocessor ./scripts/knip-production-test-files.mjs
```

The classifier matches only the structural `/__tests__/` path segment. It maps only
`options.issues.files`, preserves non-test file records, recomputes only
`counters.files`, and preserves every other issue lane, counter, and metadata field.

Independent focused evidence:

- accepted validator: exit 0
- candidate output SHA-256:
  `ecef6355f2353a544776655a786f6589d33676c03bcb61306fb526f72624df8a`
- `npm run knip:production`: exit 0, no actionable findings
- package SHA-256:
  `3613b72b689f045bbf0d0ff0f4e22e07672c22a66390034d628c432bebb52cf7`
- preprocessor SHA-256:
  `834cb07a0ff55edb350bd5ceecdf076c95d320c78d7a11fafa1400b539a00b01`
- frozen validator SHA-256:
  `c4d8f6fba44782007e4d3ad5381d9dbb2f4d8a730fd13385f63cad7bc0d7c48e`
- frozen red proof SHA-256:
  `473b22824b508aa75455972e0e851f54f6c5ea6428f2b9998e644a3f347ff0e1`

`scripts/surface-census.ts`, `knip.json`, package locks, product code, and product tests
are unchanged. `git diff --check` is clean. Builder-recorded aggregate checks:
check 0; lint 0; unit/component test 0 (356 files / 3561 tests); census 0 at
23 services / 231 methods / 181 types / 412 total.

No findings.
