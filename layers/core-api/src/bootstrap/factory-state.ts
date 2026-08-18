/**
 * AU29 §2.5.2 — the core-api first-boot face.
 *
 * The non-run-config half of the former `framework/db/src/factory-bootstrap.ts`,
 * routed through the owning services instead of writing `users` /
 * `knowledgeItems` / `knowledgeAppProjection` directly from `framework/db` — a
 * framework package structurally cannot import a layer, so this composition
 * could not live there. Values are byte-identical to the pre-move bootstrap;
 * see `.pipeline/work/AU29/probes/first-boot-control.json` for the captured
 * control this reproduces.
 *
 * Called by both production composition roots: the desktop application
 * directly, and the `tools/setup` CLIs through the shared `runFactoryBootstrap`
 * helper — tooling naming a layer face is `reach-across-only-from-a-
 * composition-root`, same as an application naming one.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import {
	COMMUNITY_DISPLAY_NAMES,
	defaultFactoryRoster,
	type FactoryAgentRef,
} from "@hyperidle/factory-defaults";
import { insertUserIfAbsent, listFactoryAgents } from "@hyperidle/users";

/**
 * Apply core-api's half of the factory bootstrap: the propagation user, the
 * roster users, the agentCategory backfill, and the factory knowledge seed.
 * Idempotent — safe on every launch. Returns the roster agents' `{id, role}`
 * for the agent-orchestration face's run-config backfill.
 */
export async function applyFactoryCoreState(db: HyperIdleDb): Promise<readonly FactoryAgentRef[]> {
	const roster = defaultFactoryRoster;
	const now = new Date().toISOString();

	// ── system:propagation — DB infra, ALWAYS written unconditionally ──
	// @lore L20: messages.senderId references users.id. This user must exist
	// before any propagation-triggered review thread can be created.
	// AB0: system users have null agentCategory (they are not real agents).
	await insertUserIfAbsent(db, {
		id: "system:propagation",
		kind: "ai",
		name: "Propagation System",
		role: "system",
		agentCategory: null,
		status: "active",
		createdAt: now,
	});

	// ── System Agent singleton — ROSTER-DRIVEN (iff roster.systemAssistant non-null) ──
	// @lore AD8a: seed-agent-cos renamed from "Chief of Staff" to "System Agent".
	// @lore AD8b: chief_of_staff role renamed to assistant; agentCategory: individual.
	if (roster.systemAssistant !== null) {
		await insertUserIfAbsent(db, {
			id: roster.systemAssistant.idHint,
			kind: "ai",
			name: "System Agent",
			role: "assistant",
			agentCategory: "individual",
			status: "active",
			createdAt: now,
		});
	}

	// ── Facilitator agents — ROSTER-DRIVEN (one per roster.facilitators entry) ──
	// @lore AD8c: renamed from "Practice Facilitator" (role: practice_facilitator) to
	// "Facilitator" (role: facilitator). System prompt file: facilitator.md.
	// Factory agents: agentCategory="strategy", team_id=null.
	for (const f of roster.facilitators) {
		const displayName =
			COMMUNITY_DISPLAY_NAMES[f.community as keyof typeof COMMUNITY_DISPLAY_NAMES] ?? f.community;
		await insertUserIfAbsent(db, {
			id: f.idHint,
			kind: "ai",
			name: `${displayName} Facilitator`,
			role: f.role,
			agentCategory: "strategy",
			teamId: null,
			status: "active",
			createdAt: now,
		});
	}

	// ── Resolve and return the roster agents: {id, role}, from the queried rows ──
	// Scoped to the roster's own agent ids (system:propagation is infra — not
	// roster-driven). Returning the QUERIED rows (not the roster constant)
	// preserves the upgrade-path semantics: an existing row's actual role
	// decides which template it gets.
	const rosterAgentIds: string[] = [];
	if (roster.systemAssistant !== null) {
		rosterAgentIds.push(roster.systemAssistant.idHint);
	}
	for (const f of roster.facilitators) {
		rosterAgentIds.push(f.idHint);
	}
	if (rosterAgentIds.length === 0) return [];
	return listFactoryAgents(db, rosterAgentIds);
}
