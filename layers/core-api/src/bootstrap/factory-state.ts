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
 * @lore AU44 AU20-fd: `framework/factory-defaults` dissolved. Facilitator seeding
 * removed from core — the five facilitator agents move to a "practice-communities"
 * plugin (AU20 Ruling 3; plugin WP not yet written). Core seeds only the system
 * assistant singleton. `defaultFactoryRoster` / `COMMUNITY_DISPLAY_NAMES` imports
 * gone; assistant seed inlined.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import { insertUserIfAbsent, listFactoryAgents } from "@hyperidle/users";

/** The single load-bearing core agent id: coach.ts:43, knowledge factory-seed:31, portfolio-retro. */
const SYSTEM_ASSISTANT_ID = "seed-agent-cos";

/**
 * Apply core-api's half of the factory bootstrap: the propagation user and the
 * system assistant singleton. Idempotent — safe on every launch. Returns the
 * roster agents' `{id, role}` for the agent-orchestration face's run-config backfill.
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

	// ── System Agent singleton (seed-agent-cos) ──
	// @lore AD8a: seed-agent-cos renamed from "Chief of Staff" to "System Agent".
	// @lore AD8b: chief_of_staff role renamed to assistant; agentCategory: individual.
	// @lore AU44 AU20-fd: inlined from defaultFactoryRoster.systemAssistant.
	await insertUserIfAbsent(db, {
		id: SYSTEM_ASSISTANT_ID,
		kind: "ai",
		name: "System Agent",
		role: "assistant",
		agentCategory: "individual",
		status: "active",
		createdAt: now,
	});

	// ── Resolve and return the roster agents: {id, role}, from the queried rows ──
	// Returning the QUERIED row (not the literal) preserves upgrade-path semantics:
	// an existing row's actual role decides which template it gets.
	return listFactoryAgents(db, [SYSTEM_ASSISTANT_ID]);
}
