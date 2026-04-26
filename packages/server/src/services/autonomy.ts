/**
 * L1 — Autonomy ladder helper. The single writer of
 * `agent_skills.autonomy_level` after L1; both the new `/autonomy` routes
 * and the legacy `/skills/:skillId` route call through here.
 *
 * @see docs/plans/L1.md Decision 4 + step E.
 */
import {
	agentSkillAutonomyAudit,
	agentSkills,
	type HyperIdleDb,
	items,
	threads,
} from "@hyperidle/db";
import type { AutonomyLevel, EventBus, ItemCreatedEvent } from "@hyperidle/shared";
import { and, eq } from "drizzle-orm";

export interface ApplyAutonomyChangeParams {
	readonly agentId: string;
	readonly skillId: string;
	readonly level: AutonomyLevel;
	readonly rationale: string | null;
	readonly changedBy: string;
}

export interface ApplyAutonomyChangeResult {
	readonly skillId: string;
	readonly level: AutonomyLevel;
	readonly updatedAt: string;
	readonly updatedBy: string | null;
	readonly previousLevel: AutonomyLevel | null;
}

/**
 * Upsert an `agent_skills` row to `level`, write an audit row + emit a
 * review-thread `item_created` event when the level actually changes.
 *
 * Same level → no audit row, no event (matches the existing semantics
 * pinned by `agents.test.ts`).
 */
export function applyAutonomyChange(
	db: HyperIdleDb,
	eventBus: EventBus,
	params: ApplyAutonomyChangeParams,
): ApplyAutonomyChangeResult {
	const { agentId, skillId, level, rationale, changedBy } = params;
	const now = new Date().toISOString();

	const existing = db
		.select()
		.from(agentSkills)
		.where(and(eq(agentSkills.agentId, agentId), eq(agentSkills.skillId, skillId)))
		.get();

	const fromLevel: AutonomyLevel | null = existing ? existing.autonomyLevel : null;

	if (existing) {
		if (existing.autonomyLevel === level) {
			// Same level: caller pinned no-op semantics in agents.test.ts.
			return {
				skillId,
				level,
				updatedAt: existing.updatedAt,
				updatedBy: existing.updatedBy,
				previousLevel: fromLevel,
			};
		}
		db.update(agentSkills)
			.set({ autonomyLevel: level, updatedAt: now, updatedBy: changedBy })
			.where(and(eq(agentSkills.agentId, agentId), eq(agentSkills.skillId, skillId)))
			.run();
	} else {
		db.insert(agentSkills)
			.values({
				agentId,
				skillId,
				autonomyLevel: level,
				updatedAt: now,
				updatedBy: changedBy,
			})
			.run();
	}

	// Audit row — fromLevel is null for first-set.
	db.insert(agentSkillAutonomyAudit)
		.values({
			id: crypto.randomUUID(),
			agentId,
			skillId,
			fromLevel,
			toLevel: level,
			rationale,
			changedBy,
			changedAt: now,
		})
		.run();

	// Review thread + item — preserved from the legacy
	// `PATCH /:id/skills/:skillId` payload shape so the regression test
	// (and any downstream consumer of `item_created`) sees an identical
	// event after the helper extraction.
	const threadId = crypto.randomUUID();
	db.insert(threads)
		.values({
			id: threadId,
			kind: "review",
			participants: JSON.stringify([agentId]),
			createdAt: now,
		})
		.run();

	const itemId = crypto.randomUUID();
	const fromLabel = fromLevel === null ? "unset" : String(fromLevel);
	db.insert(items)
		.values({
			id: itemId,
			sourceAgentId: agentId,
			layer: "meta",
			verb: "review",
			kind: "autonomy_change",
			title: `Autonomy level changed for skill ${skillId}`,
			body: `Autonomy level changed from ${fromLabel} to ${level} for agent ${agentId}, skill ${skillId}`,
			threadId,
			createdAt: now,
		})
		.run();

	eventBus.emit<"item_created">({
		type: "item_created",
		streamId: threadId,
		itemId,
		conversationId: threadId,
		kind: "autonomy_change",
		timestamp: Date.now(),
	} satisfies ItemCreatedEvent);

	return {
		skillId,
		level,
		updatedAt: now,
		updatedBy: changedBy,
		previousLevel: fromLevel,
	};
}
