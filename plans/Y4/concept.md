# Y4 Concept: Knowledge Triage Improvements

**Verdict: No new concepts. Refinement of existing triage tab.**

Y4 introduces no new primitives, no reshaped domain nouns, and no load-bearing vocabulary changes. Every concept it touches already exists:

- **Triage tab** -- exists in KnowledgeList.tsx, filters `status=draft`.
- **Attention score** -- exists in `knowledgeStrategyFabric.attentionScore`, computed by the attention service in `packages/fabric/src/services/attention-service.ts`.
- **`needs_human` status** -- already defined in `KNOWLEDGE_STATUSES` in `packages/fabric/src/types.ts` (the 7-value fabric taxonomy). Not yet used in the kernel DB status column (kernel uses the 3-value `draft | active | archived`), but the concept exists.
- **Count badge** -- a standard UI affordance; no new concept.
- **Rapid processing** -- keyboard navigation and auto-advance are interaction patterns, not domain concepts.

The one observation worth noting: the kernel DB schema uses a 3-value status enum (`draft | active | archived` per `KERNEL_KNOWLEDGE_STATUSES` in `@hyperidle/shared`), while the fabric layer defines a 7-value enum including `needs_human`. Y4 needs to decide whether `needs_human` lives in the kernel status column or remains a fabric-only concern. The architecture plan addresses this.
