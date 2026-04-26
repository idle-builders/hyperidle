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
import { and, eq, ne, sql } from "drizzle-orm";

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
 *
 * @lore L1 review M3: first-set (no prior `agent_skills` row) is silent.
 * The helper writes the row + a `from_level=null` audit entry, but does
 * NOT create a review thread/item or emit an `item_created` event.
 * Rationale: bulk-seeding 10 agents x 50 skills would otherwise dump 500
 * zero-information review items at boot. "From null" is a default being
 * made explicit — not an autonomy *change* — so founders only get a
 * review thread when an actual L→L transition happens.
 *
 * @lore L1 review B1+B2: all DB writes commit inside a single
 * `db.transaction((tx) => {...})`, the level-changed gate is enforced via
 * `INSERT ... ON CONFLICT DO UPDATE ... WHERE excluded.level <> table.level
 * RETURNING ...` (atomic — two concurrent writers cannot both observe
 * "level differs" and both write audit rows). Events emit AFTER commit.
 *
 * @lore L1 review I1 pattern: `eventBus.emit` runs post-commit because
 * subscribers (policy engine, push notifications) must not observe a row
 * that does not yet exist on disk if the transaction later rolls back.
 */
export function applyAutonomyChange(
	db: HyperIdleDb,
	eventBus: EventBus,
	params: ApplyAutonomyChangeParams,
): ApplyAutonomyChangeResult {
	const { agentId, skillId, level, rationale, changedBy } = params;
	const now = new Date().toISOString();

	// Captured inside tx, emitted after commit.
	let itemCreatedEvent: ItemCreatedEvent | null = null;

	const result = db.transaction((tx): ApplyAutonomyChangeResult => {
		// Read prior state inside the tx so the snapshot is consistent with
		// the upsert below. We need `previousLevel` for the response and
		// the `existed` flag to discriminate first-set from change.
		const existing = tx
			.select()
			.from(agentSkills)
			.where(and(eq(agentSkills.agentId, agentId), eq(agentSkills.skillId, skillId)))
			.get();

		const fromLevel: AutonomyLevel | null = existing ? existing.autonomyLevel : null;

		// Upsert with `setWhere`: the UPDATE branch only fires when the new
		// level actually differs from the existing one. Returning gives us
		// the row when an actual write happened (insert OR update). If the
		// row is absent, the level was unchanged — no-op.
		//
		// Two concurrent writers cannot both pass this gate: SQLite/Postgres
		// serialize the upsert; the second one observes the first's
		// already-written `excluded.autonomy_level == agent_skills.autonomy_level`
		// (because the first already wrote it) and the conditional update
		// returns no row.
		const writtenRows = tx
			.insert(agentSkills)
			.values({
				agentId,
				skillId,
				autonomyLevel: level,
				updatedAt: now,
				updatedBy: changedBy,
			})
			.onConflictDoUpdate({
				target: [agentSkills.agentId, agentSkills.skillId],
				set: { autonomyLevel: level, updatedAt: now, updatedBy: changedBy },
				setWhere: ne(agentSkills.autonomyLevel, sql`excluded.autonomy_level`),
			})
			.returning()
			.all();

		const wroteRow = writtenRows.length > 0;

		if (!wroteRow) {
			// Same level: caller pinned no-op semantics. Return existing
			// state. The select above gave us the row to project from.
			//
			// `existing` is guaranteed non-null here: the upsert returned no
			// row only if the conflict path took the `setWhere`-rejected
			// branch, which requires a row to exist.
			if (!existing) {
				// Unreachable; defensive throw avoids a non-null assertion.
				throw new Error("invariant: no existing row but upsert returned nothing");
			}
			return {
				skillId,
				level,
				updatedAt: existing.updatedAt,
				updatedBy: existing.updatedBy,
				previousLevel: fromLevel,
			};
		}

		// Level actually changed (or first-set). Always write the audit row.
		tx.insert(agentSkillAutonomyAudit)
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

		// First-set is silent (no thread/item/event). See @lore at top.
		if (existing) {
			// Real L->L transition: review thread + item + post-commit event.
			const threadId = crypto.randomUUID();
			tx.insert(threads)
				.values({
					id: threadId,
					kind: "review",
					participants: JSON.stringify([agentId]),
					createdAt: now,
				})
				.run();

			const itemId = crypto.randomUUID();
			const fromLabel = fromLevel === null ? "unset" : String(fromLevel);
			tx.insert(items)
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

			itemCreatedEvent = {
				type: "item_created",
				streamId: threadId,
				itemId,
				conversationId: threadId,
				kind: "autonomy_change",
				timestamp: Date.now(),
			} satisfies ItemCreatedEvent;
		}

		return {
			skillId,
			level,
			updatedAt: now,
			updatedBy: changedBy,
			previousLevel: fromLevel,
		};
	});

	// Post-commit emit. If the tx rolled back this is unreachable.
	if (itemCreatedEvent) {
		eventBus.emit<"item_created">(itemCreatedEvent);
	}

	return result;
}
