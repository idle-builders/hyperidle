# Z1 Re-Review -- Product Story & Landing Documentation

**Verdict: DONE**

All eight acceptance criteria pass. The four findings from the first review have been addressed. Writing quality remains strong -- direct, opinionated, free of marketing slop. One new minor observation below.

---

## AC Table

| AC | Criterion | Verdict | Evidence |
|----|-----------|---------|----------|
| AC1 | First-time reader can explain what HyperIdle does, why, how it differs | **PASS** | `what-is-hyperidle.md` covers the problem, the meta layer answer, three differentiators, three layers, the Factory app, and target audience. Unchanged from review-1. |
| AC2 | Paperclip/framework reader can articulate human-in-the-loop differences | **PASS** | `human-ai-collaboration.md` "What this is not" and `how-work-flows.md` "What HyperIdle does not have" explicitly address zero-human, DAG orchestration, and crew-per-task. Unchanged from review-1. |
| AC3 | Every core primitive has a concrete example with named entities | **PASS** | Previously failed. Now fixed. **Routine**: Helena example (lines 85-93 of `how-work-flows.md`) -- named agent, named products, specific trigger, specific outcome (flagging Ambrovia's 15% email open rate drop). **Task**: Mika's "Implement Stripe webhook handler" example (lines 51 of `how-work-flows.md`) -- named agent, named dependency, explicit done condition, $12 cost cap, named artifact output. **Agent**: Mika example (lines 11-13 of `human-ai-collaboration.md`) -- named Builder, named product (Nimmly), specific task, handoff to founder with a specific question ("all 27 Stripe event types or scope to the 4 we need for checkout"), practice write-back. All seven primitives (Team, Bet, Task, Session, Routine, Agent, Knowledge) now have concrete examples with named entities. |
| AC4 | Human+AI collaboration model front and center | **PASS** | `human-ai-collaboration.md` covers founders as decision-makers, agents as team members, facilitators as curators at three levels, autonomy levels L1-L4, the verdict grammar, and cost transparency. Unchanged from review-1. |
| AC5 | Features clearly distinguished as designed vs available | **PASS** | Previously failed. Now fixed. `index.md` lines 7-9 add a Status section: "HyperIdle is under active development. The architecture is complete and code is being built workpackage-by-workpackage. These documents describe the product as designed -- the system you will use when each feature ships." This is honest and explicit. The present-tense voice in the documents is appropriate for describing the design; the Status section provides the necessary framing. |
| AC6 | No marketing superlatives | **PASS** | Zero superlatives. Zero buzzwords. Zero AI hype. Unchanged from review-1. |
| AC7 | Each doc under 2000 words | **PASS** | Word counts: `what-is-hyperidle.md` = 1022, `how-work-flows.md` = 1808, `human-ai-collaboration.md` = 1569, `how-knowledge-compounds.md` = 1956, `index.md` = 334. All under 2000. The additions from the fix cycle brought `how-work-flows.md` from ~1665 to 1808 -- still within limit. |
| AC8 | Cross-references consistent with architecture docs | **PASS** | Three-layer model, Kernel/Fabric split, five process primitives, agent categories, knowledge layers L0-L4, canonical store, knowledge lifecycle, autonomy levels, verdict actions, TOON format, cost caps -- all consistent with architecture docs. See minor observation below. |

---

## Fix Verification

| Finding | Status | Verification |
|---------|--------|-------------|
| F-1 (AC3: missing examples for Routine, Agent, Task) | **Fixed** | Concrete named-entity examples added for all three. See AC3 evidence above. |
| F-2 (AC5: no "available now" vs "coming soon" distinction) | **Fixed** | Status section added to `index.md`. Clear, honest framing. |
| F-3 ("four zones" ambiguity) | **Fixed** | `what-is-hyperidle.md` now says "Three views plus a sidebar" (line 39) and "three views and a sidebar" (line 49). Consistent with architecture docs' "three views + the Rail" terminology. |
| F-4 (missing human-initiated conversations) | **Fixed** | `what-is-hyperidle.md` line 49-51 now lists "review threads, chat threads, and founder-initiated conversations" -- matching the architecture doc's three categories. Also adds "but founders can also open a new conversation at any time." |

---

## New Observations (informational, not blocking)

**O-1. Helena's domain mismatch.** `how-work-flows.md` line 87: "Helena, the Practice Facilitator for Building, owns the 'weekly growth metrics review' routine." The architecture docs (`the-two-categories.md`) define separate Practice Facilitators per community: building, product, growth, ops, facilitation. A "weekly growth metrics review" would more naturally be owned by the Growth Practice Facilitator, not the Building one. This does not violate any AC -- the example is concrete and named -- but a future edit could change "for Building" to "for Growth" for tighter consistency.
