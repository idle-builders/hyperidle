# A blocked session request starves every other agent's queue

## Seed

Found during the ship review of `knowledge-attachment-slot`, and proven against the
real claim query rather than reasoned about.

A session request that can never be admitted — because its agent is at its
concurrency limit — sits at the head of `agent_session_requests` forever and
prevents every other agent's request from ever being claimed.

## Evidence

`claimNextRequestInternal` (`layers/agent-orchestration/session-requests/src/service.ts:170-193`)
selects `WHERE status='pending' OR (status='claimed' AND claim_expires_at < now)`
`ORDER BY created_at ASC LIMIT 1`. There is no not-before gate, no skip, and no
per-agent partition. Releasing a claim
(`requeueClaimedRequestInternal`, `:291-315`) restores `status='pending'` and
refreshes `updatedAt` but leaves `created_at` alone — so the blocked request
returns to the head every time.

`ConcurrencyLimitError` is per-agent (`provisioner.ts:1091` compares
`sessions.agentId` against `runConfig.maxConcurrentSessions`), so a second agent
is fully capable of running and still never drains.

An integration test against the real PGlite fixture seeded two pending requests
for two different agents five seconds apart, then looped claim → release exactly
as `runtime.ts` does on `ConcurrencyLimitError`. The blocked request was claimed
5 times out of 5; the other agent's request was never claimed once.

`reapExpired` does not help — it only deletes terminal intents and starts
(`service.ts:775-811`) and never terminalizes a stuck pending request.

## Why it is being registered rather than fixed inline

It is **pre-existing** — the loop and the release-to-pending are byte-identical at
merge base `870bd0bdc`. Before the busy-loop fix
(`70578c37f`) the same blocked request wedged the whole process synchronously, so
other agents did not drain **and** the health endpoint died. After it, the process
stays healthy and the queue starves quietly.

That is strictly better, but the failure mode is now **silent**, which is the part
worth fixing deliberately. Fixing it properly means changing the claim query —
a not-before gate, a skip, or a per-agent partition — which is a design decision,
not a patch.

## Not yet decided

Whether the answer is a backoff column (mirroring `agent_work_intents`), skipping
a request whose agent is at its limit, partitioning the claim per agent, or
terminalizing a request that has been unadmittable for long enough.

## Related

`.pipeline/work/demo-assistant-session-never-ends/` — the demo seed that triggers
this in practice.
