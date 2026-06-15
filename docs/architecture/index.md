# ARCHITECTURE

# HyperIdle — Architecture Document

Version 0.2 — April 2026

This document describes the parts of HyperIdle, how they interface with each other, and the technologies underneath them. It is the companion to REQUIREMENTS.md (what the system must do) — this document captures how.

---

---

## Sections

- [System Overview](./system-overview.md)
- [Components](./components.md)
- [The Human Interface: The Factory](./the-human-interface-the-factory.md)
- [Key Interfaces Between Components](./key-interfaces-between-components.md)
- [Technology Summary](./technology-summary.md)
- [Kernel ↔ Strategy split](./kernel-strategy-split.md) — boundary contract + AS-BUILT (AK2): Strategy Port, registry, Fabric adapter, minimal reference Strategy, ESLint guard, deferred AK2b physical-relocation work + AS-BUILT (AK3): decomposition seam, boot wiring, decompositionStatus on bets
- [Deployment Architecture](./deployment-architecture.md)
- [Data Flow Examples](./data-flow-examples.md)
- [What This Architecture Does Not Include](./what-this-architecture-does-not-include.md)
- [Decisions](./decisions.md)
- [Event bus guarantees](./event-bus-guarantees.md)
- [WebSocket push contract](./websocket-push-contract.md)
- [Authorization model](./authorization-model.md)
- [Credential model](./credential-model.md)

