# AU20 F13 review-finding-ledger red-proof review

Date: 2026-07-23

## Binding

- Accepted correction architecture review:
  `plans/AU20/register-reviews/final-ship-correction-architecture.md`
- Accepted review SHA-256:
  `5194f0382f53cfe12cd40014413750bd18907819527520f37d261cc23cc87ae9`
- Static guard:
  `.pipeline/work/AU20/probes/validate-review-findings.mjs`
- Guard SHA-256:
  `18ccc6dcf277de1bc575c4fa6d278eaee44bfd5eedfc8c6e64bf0dd32819e7b5`
- Current review SHA-256:
  `cef525507cfe766356b2084b7d0ba4ba98699835f560dd1b0b2e5b6fa01c683a`

## Review

The guard encodes the exact F1–F13 identity and severity map:

- CRITICAL: F1–F6
- WARNING: F7–F11 and F13
- OBSERVATION: F12

It requires exactly 13 ID-bearing headings, unique IDs, the exact ID set,
severity-correct ownership, one machine-readable footer, and exact equality
between footer and parsed heading counts.

The real current review fails for the intended reason:

```text
AU20 review finding ledger invalid: WARNING footer=6 headings=5
```

Command:
`node .pipeline/work/AU20/probes/validate-review-findings.mjs`

Exit: `1`.

Independent adversarial fixtures produced:

| Case | Expected | Observed |
|---|---:|---:|
| exact valid F1–F13 ledger | 0 | 0 |
| duplicate ID | 1 | 1 |
| missing ID | 1 | 1 |
| unknown ID | 1 | 1 |
| severity-preserving ID swap | 1 | 1 |
| missing heading with matching footer | 1 | 1 |
| duplicate footer | 1 | 1 |
| malformed heading delimiter | 1 | 1 |

`node --check .pipeline/work/AU20/probes/validate-review-findings.mjs`
exited `0`. `npm run check` exited `0` across 37 packages.

Changed-path inspection found no product source, application test,
`scripts/surface-census.ts`, or census-evidence edit in this F13 red increment.
Unrelated pre-existing untracked `plans/AG4`, `AG6`, `AI1`, `AI3`, and `AI4`
remain outside review scope.

## Verdict

VERDICT: accept

The static proof is narrow, fails on the real F13 contradiction, and fails
closed against malformed, duplicate, missing, unknown, and severity-corrupted
ledgers. It authorizes only F13 write-code: assign the stable IDs and add the
missing review-integrity WARNING so headings and footer become exactly
6 CRITICAL + 6 WARNING + 1 OBSERVATION.
