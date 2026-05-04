## 2. Agent Identity

An agent is defined by three files:

```
agents/
  nimmly-builder/
    SOUL.md           # system prompt — who this agent is, its personality, its constraints
    SKILLS.md         # list of skill packages this agent can use (references to skill dirs)
    IDENTITY.md       # metadata: name, role, team, practices, max_concurrent_sessions
```

**SOUL.md** is the system prompt. It defines personality, constraints, and the agent's relationship to its role. A Builder's soul knows it's an engineer who thinks → plans → builds → reviews → tests. A Practice Facilitator's soul knows it surfaces patterns and synthesizes, not decides. Souls are short — ideally under 500 tokens — because they're loaded into every session.

**SKILLS.md** references the skill packages the agent is authorized to use. Each skill is a directory with a SKILL.md instruction file, bundled scripts, and resources. Skills call CLIs and APIs directly — no protocol layer. Skill changes require human approval via a review thread.

**IDENTITY.md** carries metadata: which team the agent is on (or teams, if it's on more than one), which practices it belongs to, its role, and operational limits (max concurrent sessions, autonomy levels per skill).

When the Knowledge Fabric builds an L0 session context for this agent, it loads the soul, queries the knowledge layers for the relevant context, and packs it into TOON format. The agent doesn't "know" about layers; it just gets a context pack.

---
