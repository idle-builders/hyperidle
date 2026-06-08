## 3. The Two Categories

### 3.1 Central Agents (Factory-Wide)

These agents serve all products. They're the shared infrastructure and coordination layer.

| Agent | Role | Key responsibility |
|-------|------|--------------------|
| **assistant** | COO brain. L4 facilitator. | Routes work, compiles portfolio-level retros, manages the assistant thread with founders, proposes changes to PRINCIPLES.md and FOCUS.md. Owns cross-product routines (portfolio cost sentinel, monthly retros). |
| **Practice Facilitators** (one per community of practice) | L3 facilitators. | Run practice "meetings," synthesize findings into knowledge, curate the practice tree, score items for human attention. Communities: building, product, growth, ops, facilitation. |
| **Infra Agent** | SRE. | Maintains shared infrastructure — servers, networking, monitoring, backups. Serves all products. |
| **Platform Agent** | DX engineer. | Maintains shared tools, templates, CI/CD, design system. Makes product teams more productive. |
| **Scout** | Analyst. | Finds and evaluates market opportunities. Produces structured idea briefs for the Work view. |

Practice Facilitators are special: they're central agents (one per community, serving all products) but they participate in every product team that has members in their community. The Build Practice Facilitator is connected to every Builder across all teams. This is how knowledge flows across products without explicit cross-team coordination.

### 3.2 Product Team Agents

Each product has a persistent team (see `PROCESS_LAYER.md` §4). The team's agents are:

| Agent | Role | Key responsibility |
|-------|------|--------------------|
| **Product Manager** | Team lead. L2 facilitator. | Shapes pitches, coordinates cycles, decomposes bets (integrating the team's proposed tasks), resolves handoffs, unblocks the team, drafts retros. |
| **Builder** (one or more) | Engineer. | Implements features, writes code, tests, deploys. May specialize (frontend, backend, full-stack). |
| **Growth Agent** | Marketer. | Landing pages, content, email, SEO, community, analytics. Distributes and measures. |
| **Ops Agent** | SRE + support. | Deploys, monitors, handles support, incident response. |

The roster is not fixed. It flexes with the product's lifecycle phase. Specialist capabilities (security review, brand-voice check, accessibility audit) are skills invoked within sessions — possibly via sub-agents — not separate top-level agents on the team.

---
