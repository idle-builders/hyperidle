/**
 * AU29 §2.5.2 — the core-api first-boot face.
 *
 * Seeds the system:propagation user and the System Agent singleton.
 * Idempotent — safe on every launch. Returns the roster agents' `{id, role}`
 * for the agent-orchestration face's run-config backfill.
 *
 * @lore AU44 AU20-fd: `framework/factory-defaults` dissolved into @hyperidle/org.
 * @lore BA9d: The five seeded facilitator agents are removed. They are now provided
 * by the knowledge-management plugin (wave 2). Their DB rows on existing installs
 * are migrated to agentCategory="individual" by migration 0065. The
 * COMMUNITY_DISPLAY_NAMES and FACILITATORS constants are gone; the plugin owns them.
 * The "App-managed" lock (UI label for category="strategy") is deleted with the category.
 * The every-launch system-prompt overwrite is no longer a silent surprise:
 * - The factory roster now contains only system:propagation (infra) and the System Agent.
 * - The System Agent's persona is protected by a separate API guard (ast-* prefix check).
 * - Plugin agents use BA9a's detach-and-restore mechanism so user edits win.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import { insertUserIfAbsent, listFactoryAgents } from "@hyperidle/users";

const SYSTEM_ASSISTANT = { role: "assistant", idHint: "seed-agent-cos" } as const;

/**
 * Apply core-api's half of the factory bootstrap: the propagation user and
 * the System Agent singleton. Idempotent — safe on every launch.
 * Returns the roster agents' `{id, role}` for the agent-orchestration face's
 * run-config backfill.
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

	// ── System Agent singleton ──
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

	return listFactoryAgents(db, [SYSTEM_ASSISTANT.idHint]);
}
