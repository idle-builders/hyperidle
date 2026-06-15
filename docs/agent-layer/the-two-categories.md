## 3. The Three Types

Every AI agent has exactly one type. The type is structural — it determines the agent's scope, visibility, and which tool categories are available to it. Type is immutable after creation.

The three types are exhaustive. Adding a fourth requires a concept-doc update.

### 3.1 Team Agents (Product-Scoped)

Team agents are scoped to a single product team. They are the visible workforce of the factory — prominent in the Work view, in session activity, and in review threads. They do the work that ships products.

| Agent | Role | Key responsibility |
|-------|------|--------------------|
| **Product Manager** | Team lead. L2 facilitator. | Shapes pitches, coordinates cycles, decomposes bets (integrating the team's proposed tasks), resolves handoffs, unblocks the team, drafts retros. One per product team. |
| **Builder** (one or more) | Engineer. | Implements features, writes code, tests, deploys. May specialize (frontend, backend, full-stack). |
| **Growth Agent** | Marketer. | Landing pages, content, email, SEO, community, analytics. Distributes and measures. |
| **Ops Agent** | SRE + support. | Deploys, monitors, handles support, incident response. |

The roster is not fixed. It flexes with the product's lifecycle phase. Specialist capabilities (security review, brand-voice check, accessibility audit) are skills invoked within sessions — possibly via sub-agents — not separate top-level agents on the team.

Schema: `users.agentCategory = 'team'`

### 3.2 Strategy Agents (Knowledge-Scoped)

Strategy agents are scoped to knowledge domains. They work behind the scenes — users rarely interact with them directly. Their job is to manage knowledge, surface cross-domain patterns, and maintain the health of knowledge taxonomies. They do not build or ship; they facilitate and curate.

| Agent | Role | Key responsibility |
|-------|------|--------------------|
| **Practice Facilitators** (one per community of practice) | L3 facilitators. | Run practice "meetings," synthesize findings into knowledge, curate the practice tree, score items for human attention. Communities: building, product, growth, ops, facilitation. |

The facilitator role is the first strategy role, but the type accommodates future strategy roles (e.g., analyst, curator) without expanding the type vocabulary.

Practice Facilitators are special in one way: they are strategy agents but they participate in every product team that has members in their community. The Build Practice Facilitator is connected to every Builder across all teams. This is how knowledge flows across products without explicit cross-team coordination.

Schema: `users.agentCategory = 'strategy'`

### 3.3 Individual Agents (User-Scoped)

Individual agents are scoped to one human user. Each human gets exactly one assistant — a personal operator that can act on the user's behalf with guardrails for risky actions.

| Agent | Role | Key responsibility |
|-------|------|--------------------|
| **Assistant** | Personal operator. | Acts on the user's behalf: creates bets, edits blocks, creates tasks, updates task status, submits reviews, queries knowledge, sends messages to other agents. Converses with the user through a pinned thread. |

The assistant is a clean concept — a personal operator, not a factory-wide facilitator. It sees what the user can see and does what the user can do. It does not have factory-wide omniscience. Each user's assistant has its own system prompt, its own thread, and its own session history.

**Lifecycle.** The assistant agent and its thread are created at user registration (or lazily on first overlay open). The thread starts unpinned and pins after the first real response. Once pinned, it stays pinned.

**Guardrails.** Actions are risk-assessed. Low-risk actions execute and report. High-risk actions surface as review messages in the thread — the user approves or rejects before execution.

Schema: `users.agentCategory = 'individual'`

### 3.4 Type is not role

Type is structural: scope + visibility + power. Role is functional: what the agent does within its type.

- A Builder and a Product Manager are both team agents with different roles.
- A facilitator for the build practice and a facilitator for the ops practice are both strategy agents with the same role.
- There is exactly one individual agent role today: assistant.

Type is not a permission system. Tool authorization uses role-based filtering. Type informs which tool categories are available to define per role, but type itself is not a permission check.

Type is not a UI grouping. Team agents are prominent in the Work view; strategy agents are mostly invisible; individual agents surface through the assistant overlay. Each type has its own visibility pattern.

### 3.5 Schema

The `users.agentCategory` column stores the type value for every AI user row (`kind = 'ai'`). Human rows have `agentCategory = null`.

| Type | Schema value | Description |
|------|-------------|-------------|
| Team | `'team'` | Product-scoped. Does visible work. |
| Strategy | `'strategy'` | Knowledge-scoped. Works behind the scenes. |
| Individual | `'individual'` | User-scoped. Personal operator. |

The previous value `'personal'` was renamed to `'individual'` in AD8a. No other values exist or are planned. Adding a fourth type requires a concept-doc update first.

---
