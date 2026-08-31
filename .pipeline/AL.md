# Track AL: Review Experience

The founder's stated USP is a review experience that eclipses anything on the market — "review for anything," pulling the human in only where guidance matters. The foundation is real and shipped: thread-native review with five binding verdicts posts and resolves live, live session dial-in works, the proof-family canvases and the composition surface exist, and AL7's review→act execution loop is merged. What remains is the async-polish layer that separates "good" from "best ever."

**Key narrative.** No tool does this well today, and the non-code review space — design, marketing, docs, data — is unmapped territory.

**Constraint.** The review *experience* only: the interaction layer over the existing thread/verdict/artifact system. No changes to verdict semantics, the thread model, or the work loop.

**Shipped foundation.** AL1–AL4, AL6 and AL7 are merged.

---

## Work package registry

| ID | Title | Type | Complexity | Depends | Status |
|---|---|---|---|---|---|
| AL5 | Tool-tailored review canvases: a tool or a third party supplies a tailored canvas for a specific tool's output, replacing the generic family canvas | frontend | L | AL3 (shipped) | unbuilt — carried from the legacy track file; the branch that reached verify-attestation was never merged to `main`. "Review for anything across every tool" cannot scale if HyperIdle builds every tool's canvas — the override tiers let the long tail be covered by the tool vendor (MCP Apps) or the community (a template registry). **Constraints:** the family canvas is always the floor — any override is additive and a missing or failed override degrades to it; contributed and tool-shipped canvases are sandboxed with a trust tier; selection order is deterministic (tool-shipped > community template > family floor). |
| AL8 | Reversibility-driven auto-flow for staged operations: an agent's *reversible* staged operations flow without per-item approval while irreversible ones still gate | backend | L | AL7 (shipped) | unbuilt — carried from the legacy track file. This is the other half of AL7's founding principle (ETHOS §3): *never put a human in front of a reversible one.* AL7 shipped only the gated arm, so the system interrupts the human for reversible work too — the exact approval fatigue the ethos warns against. The policy engine already auto-resolves high-trust low-risk review *items*, but staged operations bypass it entirely; this wires the two together so earned trust actually reduces the human's load. |
| AL9 | Trust-model consolidation: remove the vestigial per-skill autonomy data, routes and types | backend | M | — | unbuilt — carried from the legacy track file. AD4 replaced per-skill autonomy in the policy engine with the verdict-history approval-rate signal, but left the `autonomyLevel` CRUD endpoint, settings field and types in place — stored and editable, consumed by nothing for gating. **This dead code has already caused a concrete failure:** an audit, and nearly an AL7 follow-up planning pass, mistook the vestigial CRUD for the live trust model. AD4 is done; this finishes its cleanup. |

## Dependency graph

- `AL5` → `AL3` (shipped): there must be a review surface with a canvas slot and a family floor to override.
- `AL8` → `AL7` (shipped): consumes the staged-operation model and its execution path; it cannot be built or verified without them.
- `AL9` depends on nothing — AD4 is done and this closes its cleanup. Sequence it before or alongside AL8 so the trust model AL8 reasons about has one spelling.
- `AL5`, `AL8` and `AL9` are independent of each other.
