# AU4 — One trigger path for every LLM-capable event

Shipped. Every LLM-capable event family becomes a typed *trigger occasion*, is resolved through one
trigger resolver, and is then converted into an `AgentSessionRequest`. Task dispatch, assistant turns,
routine fires, decomposition, knowledge actions and grant re-engagement no longer each pick an agent
and a prompt in local code.

**Vocabulary.** A *trigger occasion* is the normalised typed event+scope payload the agent layer can
resolve — not the raw `KernelEvent`. A *trigger rule* is an active `trigger`-kind configuration item
that matches an occasion. An *execution binding* supplies the chosen agent, optional prompt template or
override, and priority/specificity metadata. *Fallback attach* is what happens when nothing matches:
the default eligible agent, with no event-specific prompt. The *resolver result* — occasion, matched
rule or fallback, chosen agent, prompt source, reason — is captured with the request as evidence.

## Where resolution happens, and why not elsewhere

Resolution runs at each source, immediately **before** request creation, and passes the chosen agent
and prompt evidence into the existing AU1 boundary.

- Resolving *inside* `consumeAgentSessionRequest` (letting `agentId` be missing) was rejected: the
  schema and shared contract require `agentId`, cost and concurrency admission expect an agent, and
  failures would then surface late with worse source-family semantics.
- Storing trigger history only in `payloadJson` was rejected: AU5 and the read model need to query by
  source, request and session, and a JSON-only audit regresses silently.

## Constraints

- **The resolver must not grow into a policy engine.** Matching, default attach, prompt binding and
  audit only — no authorization or gating.
- **`promptSource: "none"` does not mean promptless.** The base session prompt still applies; only the
  event-specific trigger prompt is absent. Document it that way wherever it surfaces.
