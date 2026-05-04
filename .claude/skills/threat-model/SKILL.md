---
name: threat-model
description: "Combined skill: security threat model. Launches reviewer with security focus + trust boundary context."
argument-hint: "[feature name, component, or 'full' for system-wide]"
user-invocable: true
min_tool_calls: 12
---

# Threat Model

**Why:** HyperIdle runs autonomous AI agents with access to code, data, and external services. Every trust boundary is an attack surface. Threat modeling before shipping catches security issues that are expensive to fix after deployment.

## Steps

| Step | Launch agent | With skill | Purpose |
|------|-------------|-----------|---------|
| 1 | **reviewer** | `/contract-review` (security lens focus) | STRIDE analysis with agent-specific focus |

Give the reviewer the relevant code, the architecture plan (`plans/<workpackage-id>/architecture.md`) — its **Required reading** section names the specific docs — and the trust boundaries below.

### Trust boundaries in HyperIdle

- Human Interface <> API Layer
- API <> Meta Layer
- Meta <> Agent Runtime
- Knowledge Fabric <> Agent Context
- Agent <> Workspace
- Factory <> External Services

### Focus areas

- Agent-specific threats: workspace escape, prompt injection, cost amplification
- Knowledge layer integrity: L0-L4 poisoning, cross-product leakage
- Multi-tenancy isolation

Produce a risk matrix (Impact x Likelihood) with recommended mitigations.

## Target

$ARGUMENTS
