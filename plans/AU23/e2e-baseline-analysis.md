# AU23 baseline — why the Playwright suite is not end-to-end

## Decision

Playwright must exercise the real HyperIdle frontend, server, API, and migrated database. Internal
`/api/**` requests may not be intercepted or fulfilled by Playwright. Deterministic agent behavior
belongs inside the harness adapter only.

This supersedes the uncommitted AU20 fixture-routing and centralized-response-contract experiment.
That experiment must not be committed.

## Committed baseline

Measured at the AU20 committed `HEAD` before cleanup:

| Measure | Count |
|---|---:|
| Playwright spec files | 89 |
| Specs containing `page.route()` | 81 |
| Files containing `page.route()` | 82 |
| `page.route()` calls | 616 |
| `.fulfill()` calls | 613 |
| `/api/` string occurrences in E2E sources | 772 |

The rejected AU20 working candidate still had 81 intercepting specs, 606 route calls, and 604
fulfillments. AU20 did not introduce the underlying practice; it attempted to centralize it, which
remained the wrong proof boundary.

## Current trustworthy conclusion

The repository has no complete truthful real-backend Playwright command today. The default config
starts Vite without the complete backend. The AH1 configuration approaches a real API/PGlite path
but covers only its profile and was blocked before collection by transitional lane infrastructure.
Running the existing full suite would measure the mocked-route system rather than the real product.

Therefore no honest feature-broken versus test-broken count exists yet:

| Classification | Count |
|---|---:|
| Product/feature broken | 0 observed |
| Test broken | 0 observed |
| External prerequisite | 0 observed |
| Test infrastructure blocker | 1 |
| Unclassified attempted identities | 0 |
| Identities truthfully attempted | 0 |

The first AU23 architecture/build increment must establish the real application substrate. Only
then can every identity run and receive a trustworthy classification.

## Migration inventory

- Migrate all 81 intercepting specs.
- Retain and verify the remaining 8 specs.
- Preserve all 89 spec identities at registration; architecture must build the test-level identity
  closure before migration.
- Migrate in batches of at most 10 specs, with red proof, implementation, independent review, and
  a separate commit per batch.
- Preserve AU20's Service census baseline: 231 methods, 181 types, 412 total.

## Prior evidence to carry forward

- AU20 corrective review:
  `/Users/tg/hyperidle/.worktrees/AU20-review/.pipeline/work/AU20/review.md`
- AU20 founder-reset architecture review:
  `plans/AU20/register-reviews/real-backend-e2e-founder-reset.md`
- AU20 committed proof inventory:
  commit `cf8bee1a` on `pipeline/AU20`

The first two paths originate in the AU20 worktrees and must be copied or summarized into durable
AU23 architecture artifacts before those worktrees are retired.
