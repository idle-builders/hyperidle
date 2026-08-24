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
 *
 * @lore AU44 AU20-fd: `framework/factory-defaults` dissolved into @hyperidle/org.
 * `defaultFactoryRoster` / `COMMUNITY_DISPLAY_NAMES` were imported from factory-defaults;
 * those values are inlined here now that factory-defaults no longer exists. The facilitator
 * loop is preserved — those five agents still seed from core (the plugin that takes them
 * over in AU20 Ruling 3 does not exist yet; removing them now would be a silent capability
 * loss on fresh installs).
 */

import type { HyperIdleDb } from "@hyperidle/db";
import { insertUserIfAbsent, listFactoryAgents } from "@hyperidle/users";

// ── Inlined from framework/factory-defaults/src/factory-roster.ts ──────────────
// @lore AU44 AU20-fd: factory-defaults dissolved; these literals were COMMUNITY_DISPLAY_NAMES
// and defaultFactoryRoster. The facilitator-plugin track (AU20 Ruling 3) will supersede
// them when the plugin is built; until then, core continues to seed them.

const COMMUNITY_DISPLAY_NAMES: Record<string, string> = {
	build: "Build",
	product: "Product",
	growth: "Growth",
	ops: "Ops",
	facilitation: "Facilitation",
};

const FACILITATORS = [
	{ community: "build", role: "facilitator", idHint: "seed-agent-pf-build" },
	{ community: "product", role: "facilitator", idHint: "seed-agent-pf-product" },
	{ community: "growth", role: "facilitator", idHint: "seed-agent-pf-growth" },
	{ community: "ops", role: "facilitator", idHint: "seed-agent-pf-ops" },
	{ community: "facilitation", role: "facilitator", idHint: "seed-agent-pf-facilitation" },
] as const;

const SYSTEM_ASSISTANT = { role: "assistant", idHint: "seed-agent-cos" } as const;

// ────────────────────────────────────────────────────────────────────────────────

/**
 * Apply core-api's half of the factory bootstrap: the propagation user, the
 * roster users, the agentCategory backfill, and the factory knowledge seed.
 * Idempotent — safe on every launch. Returns the roster agents' `{id, role}`
 * for the agent-orchestration face's run-config backfill.
 */
export async function applyFactoryCoreState(
	db: HyperIdleDb,
): Promise<ReadonlyArray<{ readonly id: string; readonly role: string }>> {
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

	// ── System Agent singleton — inlined from defaultFactoryRoster.systemAssistant ──
	// @lore AD8a: seed-agent-cos renamed from "Chief of Staff" to "System Agent".
	// @lore AD8b: chief_of_staff role renamed to assistant; agentCategory: individual.
	await insertUserIfAbsent(db, {
		id: SYSTEM_ASSISTANT.idHint,
		kind: "ai",
		name: "System Agent",
		role: "assistant",
		agentCategory: "individual",
		status: "active",
		createdAt: now,
	});

	// ── Facilitator agents — inlined from defaultFactoryRoster.facilitators ──
	// @lore AD8c: renamed from "Practice Facilitator" (role: practice_facilitator) to
	// "Facilitator" (role: facilitator). System prompt file: facilitator.md.
	// Factory agents: agentCategory="strategy", team_id=null.
	// @lore AU44 AU20-fd: AU20 Ruling 3 says facilitators leave core and are re-provided
	// as a plugin. Until that plugin is built, these stay here — removing them now would
	// silently break fresh installs (no plugin to take over). Track BA owns the removal.
	for (const f of FACILITATORS) {
		const displayName = COMMUNITY_DISPLAY_NAMES[f.community] ?? f.community;
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
	const rosterAgentIds: string[] = [SYSTEM_ASSISTANT.idHint];
	for (const f of FACILITATORS) {
		rosterAgentIds.push(f.idHint);
	}
	return listFactoryAgents(db, rosterAgentIds);
}
