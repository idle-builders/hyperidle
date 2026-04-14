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

Determine what to model: a feature/story (read work package + architecture), "full" system (read `docs/ARCHITECTURE.md`), or a specific component (focus on that component's trust boundaries).

## Step 2 — Identify Assets

List what we're protecting: data assets (user data, agent credentials, knowledge items, session artifacts, cost records), compute assets (agent workspaces, job queues, database connections), trust assets (agent identities, authorization tokens, knowledge integrity).

## Step 3 — Map Trust Boundaries

Identify where trust changes: Human Interface ↔ API Layer, API Layer ↔ Meta Layer, Meta Layer ↔ Agent Runtime, Knowledge Fabric ↔ Agent Context, Agent ↔ Workspace, Factory ↔ External Services.

## Step 4 — Spawn Security Researcher

Spawn the security-researcher agent with the scope, context, and trust boundaries. Ask for STRIDE analysis on each boundary, with special attention to agent-specific threats (workspace escape, prompt injection via knowledge, cost amplification), knowledge layer integrity (L0-L4 poisoning, cross-product leakage), and multi-tenancy isolation.

## Step 5 — Prioritize

Organize findings into a risk matrix: Impact × Likelihood. Priority: Critical+High first (must fix before shipping), then High+Medium (address in current track), then track the rest as known risks.

## Step 6 — Output

Produce a `THREAT_MODEL.md` with: scope, trust boundary diagram, threat inventory (STRIDE classified), risk matrix, recommended mitigations, and accepted risks with justification.
