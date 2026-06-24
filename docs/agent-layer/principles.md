## 1. Principles

1. **Agent = system prompt + context + skills.** The system prompt defines who they are. Context is what they know (L0–L4 memory, loaded JIT). Skills are what they can do (packaged scripts calling CLIs/APIs). All three are composable and independently swappable.

2. **Process first, agents second.** Design how work flows, then staff it with agents — not the other way round. An agent exists because a role exists in the process, not because someone wanted to create an agent.

3. **Context is the product.** Agents are disposable. Context survives. The company's real asset is its accumulated context — product knowledge, practice patterns, brand, decisions, customer insights. If every agent is replaced tomorrow, the new ones should be productive within one session because the context is intact.

4. **Hire and fire freely.** Agents spin up and down. A new product hires a team. A sunset dissolves it. A spike in demand temporarily borrows an agent from another team. But agents only leave a team when their work is done (see `PROCESS_LAYER.md` §4.3).

5. **Trust agents; humans own the consequential.** Agents can do everything — they hold their own credentials, run their own tools, and are trusted to work like real employees with broad self-permission. We design to give agents *more* power, not less; we do not design for paranoia or against a hypothetical rogue agent (`ETHOS.md` §4). Humans step in only at the consequential and irreversible moments, via review — a collaboration checkpoint, not a cage. That gate **fades as trust is earned**: autonomy graduates off the review track record (the verdict-history trust signal in `packages/fabric/src/services/policy-engine.ts`, per AD4 — not a manually-set per-skill dial).

---
