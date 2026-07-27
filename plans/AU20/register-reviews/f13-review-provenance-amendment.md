# AU20 F13 review-provenance amendment critique

Date: 2026-07-24
Reviewer: independent pipeline-reviewer, round 2

## Immutable inputs

| Input | SHA-256 |
|---|---|
| `.pipeline/work/AU20/architecture-amendments/f13-review-provenance.md` | `58a073b727f7ffec13f28fe61ca5a4b0194583cfff222acae2355074ae98d101` |
| `.pipeline/work/AU20/feasibility-amendments/f13-review-provenance.md` | `2f9bcd4c0ae191c629fbf415523ef447ca0f03f9f4085b6c1bb0892c6a9927a6` |
| `plans/AU20/register-reviews/final-ship-correction-architecture.md` | `5194f0382f53cfe12cd40014413750bd18907819527520f37d261cc23cc87ae9` |
| `plans/AU20/red-proof-reviews/review-finding-ledger.md` | `cc04e8563635b2e9ff3726b751293e586ba0a29ef490f4f776c4aacffcf10f0e` |
| `.pipeline/work/AU20/review.md` | `48360d3d1bf65c33c371fcfd48c7659a50acaee4159b4a802a9d52f2a9ac57e0` |
| `.pipeline/work/AU20/probes/validate-review-findings.mjs` | `18ccc6dcf277de1bc575c4fa6d278eaee44bfd5eedfc8c6e64bf0dd32819e7b5` |
| `.pipeline/work/AU20/progress.json` (pre-amendment) | `1be04b7a6f79891f7ec0f3c73f10f8a3328efe3ebd80a9ec25d4f39c585e2ecd` |
| `.pipeline/work/AU20/probes/generate-corrective-change-map.mjs` (current) | `ed9db78e79625213c0a73c14b3b062c5eade8936044373d6485415ad3c72f470` |
| `.pipeline/work/AU20/probes/validate-corrective-change-map.mjs` (current) | `2fb6fe988b20bf2632d93ae3ac5741d471c08acabf96acebb59889f809f73930` |
| `plans/AU20/corrective-change-map.json` (current) | `66dc053060f9d6ecafc0d3c86aa32c7de2532035bd47893cb9c4907bc37e55bd` |

## Architecture Critique: AU20 F13 review provenance

ARCHITECTURE-SCORE: 9/10  rounds=2  score-line: SA:9 IM:9 LI:10 AC:8 DM:9 N:9 MD:9 FMC:9 S:9 V:9 FE:9

### CRITICAL

None.

### WARNING

None.

### SUGGESTION

- [plan §Executable validation seam] Keep the two stale-map fixtures in the final review evidence with their exact commands, exit codes, and stderr. They need not become package tests because this amendment deliberately locks product/tests, but durable captured output will make AC4 auditable.

### What's Working Well

- Historical and current review provenance are now genuinely independent. Historical truth comes from two hash-pinned immutable review artifacts with exact, unique semantic extraction; current truth comes from live bytes plus a separately hash-pinned validator and independently parsed counts/IDs.
- The stale-cache proof is executable and adversarial: `--map` varies only candidate JSON, never trusted artifact or executable paths, and the internally self-consistent stale fixture distinguishes live-byte validation from cache consistency.
- Prior history is a closed four-object set. Independent recomputation confirms all stated canonical hashes exactly: `8fdbe10c…`, `b2422c38…`, `353e6eaf…`, and `7c3a751c…`; nested artifact-byte checks remain mandatory.
- The complete amendment gate and five-step transition remove the previous self-binding ambiguity. Pre-amendment progress is a literal historical field; current post-binding progress is never misrepresented as that evidence.
- Determinism, subprocess behavior, exact stdout, failure messages, F13-only authorization, product lock, and next-increment lock are concrete enough for execution without builder decisions.
- Scope remains planner-owned evidence only. No product source, package test, service census, or AU23 surface is authorized.

VERDICT: accept
