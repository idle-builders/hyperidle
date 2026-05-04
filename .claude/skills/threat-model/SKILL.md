---
name: threat-model
description: "Security threat model for a feature or component."
argument-hint: "[feature name, component, or 'full' for system-wide]"
user-invocable: true
min_tool_calls: 12
---

# Threat Model

**Why:** HyperIdle runs autonomous AI agents with access to code, data, and external services. Every trust boundary is an attack surface. Threat modeling before shipping catches security issues that are expensive to fix after deployment — especially agent-specific risks like prompt injection and workspace escape.

Spawn a **security-researcher agent** to analyze `<target>`.

Give it the relevant code, the architecture plan (`plans/<workpackage-id>/architecture.md`) — its **Required reading** section names the specific docs this target depends on — and the trust boundaries below. Do not browse `docs/` directly.

Key trust boundaries in HyperIdle: Human Interface ↔ API Layer, API ↔ Meta Layer, Meta ↔ Agent Runtime, Knowledge Fabric ↔ Agent Context, Agent ↔ Workspace, Factory ↔ External Services.

Ask for STRIDE analysis with focus on: agent-specific threats (workspace escape, prompt injection, cost amplification), knowledge layer integrity (L0-L4 poisoning, cross-product leakage), and multi-tenancy isolation.

Produce a risk matrix (Impact x Likelihood) with recommended mitigations.

## Target

$ARGUMENTS
