# AU20 F3 harness-registry MCP-entry amended RED-proof review

Date: 2026-07-24
Reviewer: fresh independent pipeline reviewer
Increment: `harness-registry-mcp-entry`
Finding: F3

## Bound evidence

| Evidence | SHA-256 |
|---|---|
| isolation validator | `2007c4fe44975be2d5b07381ee34ecbd6039bcb82b0acf775f6edc8c933de0ce` |
| amended RED proof | `9f8c60258be9b8ee320aa7388189903cbe7e0d7bd94e247c1fc82aede28a4762` |
| frozen AN2 Haiku test | `075a31f57f22435b11d732ec7e4953459cb7d7680334a8aa629a03c25bce40f3` |
| protected MCP-route test | `115064b9d5408c4fabf07ecff4b91f87c959f17e001bc5a3c3fbd20f6b807a81` |
| protected stateful-bridge test | `f08309f8b88636e82b1b75c5f60480d4ea3cdc690baa4fb8a95dcbf24973de11` |

The exact seven amendment paths are the validator, proof record, and five
core-api MCP tests. Each test changes only its `createMcpToolBridge` import to
`@hyperidle/harness-registry/mcp`; its other main-entry imports remain intact.
All five hashes match the proof record.

All seven partial-product hashes also match the proof record. No product code
changed during this amended write-tests phase.

## Proof audit

- The validator writes a temporary ESM `.mts` module and runs it with
  `node --import tsx`; package subpath resolution therefore executes rather
  than failing on an invalid eval/top-level-await mechanism.
- Probe exit `43` proves the resolved namespace already owns a function-valued
  `createMcpToolBridge` export (exits 41/42 were bypassed) and intentionally
  fails because `returnStatusTool` is not yet an own `/mcp` export.
- The esbuild metafile shows MCP implementation, MCP SDK, and Hono are absent
  from the main runtime graph. Its only remaining graph violation is Zod via
  `src/return-status-tool.ts`.
- The current intended RED is therefore precise: move the existing
  `returnStatusTool` implementation/export to `/mcp` and remove it from main;
  do not add a duplicate.
- The AN2 test remains hash-frozen, invokes Claude with `--model haiku`, and
  hard-fails every missing/invalid Claude, Codex, OpenCode, or GitHub
  prerequisite. It contains no credential skip path.
- The prior live AN2 result remains bound by the unchanged hash: Codex,
  OpenCode, and GitHub passed; Claude Haiku made three attempts and received
  HTTP 429 each time.
- The old accepted-review binding is expected to mismatch until this amended
  review SHA replaces it. That gate-state mismatch is not a RED-contract
  defect.

## Acceptance evidence

| Acceptance criterion | Result |
|---|---|
| Exact seven amendment paths | PASS |
| Five bridge tests import bridge from `/mcp` only | PASS |
| ESM runtime probe executes real package resolution | PASS |
| Own `createMcpToolBridge` function resolves | PASS |
| Missing own `returnStatusTool` produces intended RED | PASS |
| Main graph has only Zod/return-status violation | PASS |
| Partial product frozen during write-tests phase | PASS |
| AN2 remains Haiku and hard-fail-only | PASS |
| Protected MCP route behavior | PASS: 5/5 |
| Protected stateful bridge behavior | PASS: 2/2 |
| Migrated unit tests | PASS: 7/7 |
| Typecheck | PASS |
| Service surface | PASS: 23 services / 231 methods / 181 types / 412 total |

## Commands observed

- `node .pipeline/work/AU20/probes/validate-harness-mcp-isolation.mjs`
  → exit 1; Zod main-graph violation plus runtime probe exit 43.
- Focused three migrated unit files → exit 0; 7 passed.
- Protected MCP-route file → exit 0; 5 passed.
- Protected stateful-bridge integration file → exit 0; 2 passed.
- `npm run check` → exit 0.
- `npx tsx scripts/surface-census.ts --json`
  → exit 0; 23 services, 231 methods, 181 types, 412 total.
- `git diff --check` → exit 0.

RED-PROOF VERDICT: accept

EXTERNAL BLOCKER: Claude account monthly spend limit (HTTP 429); release
real-harness lane remains red until quota is restored and the unchanged Haiku
proof passes without relaxation.
