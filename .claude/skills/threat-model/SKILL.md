---
name: threat-model
description: Generate a security threat model for a feature, component, or the full system. Spawns the security-researcher agent to analyze attack surface, trust boundaries, and threat vectors.
argument-hint: "[feature name, component, or 'full' for system-wide]"
user-invocable: true
allowed-tools: Read Grep Glob Agent
---

# Threat Model

Generate a security threat model for: **$ARGUMENTS**

## Step 1 — Scope

Determine what we're threat-modeling:
- If `$ARGUMENTS` names a feature or story: read the relevant work package and architecture sections.
- If `$ARGUMENTS` is "full" or "system": model the entire system from `ARCHITECTURE.md`.
- If `$ARGUMENTS` names a file or component: focus on that component's trust boundaries.

Read the relevant source files and architecture documents.

## Step 2 — Identify Assets

List what we're protecting:
- **Data assets:** User data, agent credentials, knowledge items, session artifacts, cost records
- **Compute assets:** Agent workspaces, job queues, database connections
- **Trust assets:** Agent identities, authorization tokens, knowledge integrity

## Step 3 — Map Trust Boundaries

Identify where trust changes:
- Human Interface ↔ API Layer (user authentication boundary)
- API Layer ↔ Meta Layer (authorization boundary)
- Meta Layer ↔ Agent Runtime (agent sandbox boundary)
- Knowledge Fabric ↔ Agent Context (prompt injection boundary)
- Agent ↔ Workspace (container escape boundary)
- Factory ↔ External Services (network boundary)

## Step 4 — Spawn Security Researcher

**Spawn the security-researcher agent:**

> Analyze the security threat landscape for: [scope description]
>
> Context: [relevant architecture sections, code files, data flows]
>
> For each trust boundary in scope, apply STRIDE analysis:
> - Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege
>
> Pay special attention to:
> - Agent trust boundaries (workspace escape, prompt injection via knowledge, cost amplification)
> - Knowledge layer integrity (L0-L4 poisoning, cross-product leakage)
> - Multi-tenancy isolation (product boundary enforcement)
>
> Produce a threat model with: Asset, Threat, Attack Vector, Impact (Critical/High/Medium/Low), Likelihood (High/Medium/Low), and Mitigation for each threat.

## Step 5 — Prioritize

Take the security researcher's output and organize into a prioritized threat model:

### Risk Matrix

| # | Threat | Impact | Likelihood | Risk | Mitigation |
|---|--------|--------|------------|------|------------|
| 1 | ...    | ...    | ...        | ...  | ...        |

**Risk = Impact × Likelihood**

Priority order:
1. Critical impact + High likelihood → **Must address before shipping**
2. Critical impact + Medium/Low likelihood → **Address in current track**
3. High impact + High likelihood → **Address in current track**
4. Everything else → **Track as known risks**

## Step 6 — Output

Produce a `THREAT_MODEL.md` document with:

1. **Scope** — What was analyzed
2. **Trust Boundary Diagram** — ASCII diagram showing boundaries
3. **Threat Inventory** — Full list with STRIDE classification
4. **Risk Matrix** — Prioritized table
5. **Recommended Mitigations** — Ordered by risk priority
6. **Accepted Risks** — Threats we acknowledge but won't address now, with justification
