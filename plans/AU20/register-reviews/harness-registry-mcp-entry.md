# AU20 F3 harness-registry MCP-entry implementation review

Date: 2026-07-24
Reviewer: fresh independent pipeline reviewer
Increment: `harness-registry-mcp-entry`
Finding: F3

## Findings

No critical, warning, or observation findings.

- The exact authorized product, test, and evidence paths are respected.
- `./mcp` resolves through the package export and owns function-valued
  `createMcpToolBridge` and `returnStatusTool` runtime exports.
- The validator is genuinely green. Its esbuild metafile proves the main entry
  contains no MCP implementation, legacy bridge implementation,
  return-status implementation, MCP SDK, Hono, or Zod input.
- There is one MCP bridge implementation in `src/mcp/index.ts`. The legacy
  `src/mcp-tool-bridge.ts` is only a three-line compatibility re-export used by
  the two frozen internal tests.
- There is one return-status implementation. Its existing definition fields
  remain attached to the callable export; no duplicate implementation or main
  package re-export remains.
- Production consumers use `@hyperidle/harness-registry/mcp` for MCP bridge and
  return-status imports. The five corrected tests use `/mcp` for
  `createMcpToolBridge`; unrelated harness imports remain on the main entry.
- Frozen AN2, MCP-route, stateful-bridge, amended RED proof, validator, RED
  review, and census-tool hashes remain intact.
- The pending candidate/review hash binding is planner evidence work after this
  review, not a product defect.

## Final hashes

| Path | SHA-256 |
|---|---|
| `packages/agent-execution/harness-registry/package.json` | `c969592613f7a0a0caaf828fe1888f159e06b4b3aa567449328013b7783260d8` |
| `packages/agent-execution/harness-registry/src/index.ts` | `dbe88ca2a53862d919428f53b63161eba77cc8b057be07009b6d9911f9483626` |
| `packages/agent-execution/harness-registry/src/mcp-tool-bridge.ts` | `add996f2f150683cf2773602bfb710b9d031fb312847c9d5bfa941d896650118` |
| `packages/agent-execution/harness-registry/src/mcp/index.ts` | `8ed4bc28bf456fa78978785321d834540fcba151611b533b04785aecf8de4a6b` |
| `packages/agent-execution/harness-registry/src/mcp/mcp-bridge.ts` | `4376c6fa0265725cd4e5c955d6474d2ccda71e6dc9c34fff188b24a4a1ef64bb` |
| `packages/agent-execution/harness-registry/src/mcp/mcp-route.ts` | `e6f762d25fbb35bd96028879dfdb2b04fb8fff6d1e6689f6628ad9437dd39e0d` |
| `packages/agent-execution/harness-registry/src/return-status-tool.ts` | `4df8a05503fd7897f75613acc916e182b58fc5da42790441f2f1a0e4b782270b` |
| `packages/core-api/src/server-factory.ts` | `1ae38d5108492be5a5312fbb609cb6674d23502accfcfad241aaf2368db2a6e9` |
| `packages/core-api/src/services/tool-provider-bindings.ts` | `156fac5752e904810a3e83c970e2b1e5ea294852b62fd9c1b646c8bc3f9ab98c` |

## Acceptance evidence

| Acceptance criterion | Result |
|---|---|
| Validator genuinely green | PASS |
| Main package runtime isolation | PASS |
| `/mcp` owns both required runtime exports | PASS |
| One bridge and one return-status implementation | PASS |
| Compatibility path is re-export only | PASS |
| Production consumers migrated | PASS |
| Corrected test consumers migrated | PASS |
| Frozen evidence unchanged | PASS |
| Focused behavior | PASS: 24/24 |
| Protected stateful bridge | PASS: 2/2 |
| Typecheck | PASS: 37/37 packages |
| Lint | PASS |
| Unit/component suite | PASS: 3557/3557 |
| Service integration | PASS: 2869 passed; 7 existing lane-policy skips |
| Service surface | PASS: 23 services / 231 methods / 181 types / 412 total |
| Diff integrity | PASS |

## Commands observed

- `node .pipeline/work/AU20/probes/validate-harness-mcp-isolation.mjs`
  → exit 0; runtime exports and isolated graph reported.
- Focused MCP/return-status tests → exit 0; 24 passed.
- Protected stateful-bridge integration → exit 0; 2 passed.
- `npm run check` → exit 0; 37 packages.
- `npm run lint` → exit 0.
- `npm run test` → exit 0; 3557 passed.
- `npm run test:integration:service` → exit 0; 2869 passed, 7 skipped.
- `npx tsx scripts/surface-census.ts --json`
  → exit 0; 23 services, 231 methods, 181 types, 412 total.
- `git diff --check` → exit 0.

VERDICT: accept

EXTERNAL RELEASE BLOCKER: Claude Haiku remains unavailable because the account
returns HTTP 429 monthly spend-limit responses. This does not invalidate the F3
implementation; the unweakened real-harness release lane must pass after quota
restoration.
