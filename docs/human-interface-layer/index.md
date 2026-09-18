# Human Interface Layer

The contracts, primitives, and interaction patterns that define how humans and agents meet inside the app.

- [overview.md](./overview.md) — why the layer exists, what it ships, delivery/shell posture, trust surfaces, and what it refuses to own
- [the-three-views.md](./the-three-views.md) — Conversations / Work / Knowledge as a concept; the one-door principle and 15-second decidability
- [thread-primitive.md](./thread-primitive.md) — Thread/Message types, HOST_KINDS, idempotency, closure discipline, and the 5-verdict grammar
- [part-model.md](./part-model.md) — Part model authority for Conversation and Session view rendering; AM1/AM3 vocabulary
- [open-contract.md](./open-contract.md) — OpenTarget / createOpenHandler / resolveHostRoute / SplitView: the surface-agnostic seam for opening any reference
- [review-primitive.md](./review-primitive.md) — 9 review canvas families, AnchorRef, OutcomeBand, and the trust-gating surface (approval-rate × riskTier)
- [notification-primitive.md](./notification-primitive.md) — notification type registry, egress queue/digest, muting, and cadence discipline
- [block-primitive.md](./block-primitive.md) — thin HIL pointer to docs/blocks/; layer-specific render and anchor facts only
- [content-examples-for-design-reference.md](./content-examples-for-design-reference.md) — realistic fictional content samples for populating designs
- [decisions.md](./decisions.md) — settled HIL-scoped decisions with code pointers
