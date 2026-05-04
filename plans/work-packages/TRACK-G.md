# Track G: Facilitator Pipeline

See `docs/work-packages/SHARED.md` for tech stack, shared contracts, and dependency graph.

---

### G1 — Facilitator Agent Infrastructure

**Story.** As the system, I want facilitator agents (Chief of Staff, Practice Facilitators, Product Managers) seeded into the database with their own soul prompts and facilitator-specific tools (route_item, score_attention, promote_knowledge, create_conflict_review), so that facilitation workflows can run autonomously.

**Depends on.** D4, B1.

**Acceptance criteria.**
- After seeding, database contains: 1 Chief of Staff, ≥1 Practice Facilitator, ≥1 Product Manager.
- Each has valid soul_prompt_path.
- Facilitator-specific tools compile and return correct types.
- route_item creates item assigned to correct view.
- promote_knowledge transitions item from CAPTURED to PROVISIONAL.
- Session can be provisioned for facilitator using standard D5 flow.

**Validation scenarios.**
- Given facilitator agent, when session provisioned, then tools available.
- Given promote_knowledge called, when item checked, then status = PROVISIONAL.

**Contracts / constraints.**
- Facilitator agent identities: Chief of Staff (factory-wide), Practice Facilitators (per community), Product Managers (per product).

**Effort.** S (~1d)

---

### G2 — Attention Scoring Engine

**Story.** As knowledge items accumulate, I want an attention scoring algorithm that factors novelty, impact, conflict, repetition, confidence, taste sensitivity, recency, and usage frequency, so that items crossing a threshold are surfaced to humans automatically.

**Depends on.** G1, B1.

**Acceptance criteria.**
- Item conflicting with existing scores higher than non-conflicting.
- Brand-voice item scores higher than technical detail.
- Recently reviewed item scores lower than never-reviewed.
- Threshold crossing (0.7) triggers item_created event.
- Scoring deterministic: same inputs → same output.
- 1000 items scored in <1 second.

**Validation scenarios.**
- Given item with conflict, when scored, then score > item without conflict.
- Given item score crosses 0.7, when event checked, then item_created fired.

**Contracts / constraints.**
- Scoring factors and weights configurable per deployment.
- Recomputed periodically (facilitator routines) or on-demand.

**Effort.** S (~1d)

---

### G3 — Knowledge Promotion Pipeline

**Story.** As the system, I want knowledge to flow through a promotion lifecycle (CAPTURED → PROVISIONAL → VALIDATED → ACTIVE → STALE → ARCHIVED) with automatic promotion on cross-product repetition and layer-precedence conflict detection, so that knowledge quality improves over time and stale items are archived.

**Depends on.** G2, B5.

**Acceptance criteria.**
- Facilitator promotion: CAPTURED → PROVISIONAL status updates.
- Auto-promotion: same finding in 5+ sessions → VALIDATED (no human needed).
- Contradiction check: proposed L3 contradicting L4 principle → flagged for human review (NOT auto-promoted).
- Stale detection: ACTIVE unused >90 days → STALE.
- Open conflict prevents promotion past PROVISIONAL.
- 3-turn practice meeting: turn 1 (proposals) → turn 2 (reactions) → turn 3 (synthesis) creates/updates items.

**Validation scenarios.**
- Given same finding in 5 sessions, when promotion checked, then status = VALIDATED.
- Given proposed practice contradicting L4 principle, when checked, then flagged for review (not promoted).

**Contracts / constraints.**
- Automatic promotion only on strong signal (5+ repetitions, no contradictions).
- Layer precedence: L4 > L3 > L2 > L1 (higher layers override lower).

**Effort.** M (~2d)

---

### G4 — Built-in Routines

**Story.** As the factory, I want five core routines (Cost Sentinel, Practice Meeting, Post-Bet Retro, Monthly Portfolio Retro, Knowledge Decay Check) seeded and running on schedule, so that facilitator work, learning, and monitoring happen automatically.

**Depends on.** G3, C5.

**Acceptance criteria.**
- Cost Sentinel: 15-min heartbeat, monitors burn rate, emits warnings/breaches.
- Practice Meeting: weekly, runs 3-turn conversation, produces reflection items.
- Post-Bet Retro: event-triggered on bet_shipped, compares hypothesis vs reality.
- Portfolio Retro: first Monday, monthly, cross-product patterns.
- Knowledge Decay: daily, finds items unused >90 days, transitions to STALE.
- All routines created during factory init with correct config.
- Can be manually triggered via API for testing.
- Disabling routine (active=false) prevents firing.

**Validation scenarios.**
- Given routine fire time reached, when scheduler checks, then routine fires.
- Given Cost Sentinel at warning threshold, when incremented, then warning event emitted.

**Contracts / constraints.**
- Routines seeded during factory initialization.
- E7 integration: Policy Engine respects autonomy levels for routine outputs.

**Effort.** M (~2d)

---
