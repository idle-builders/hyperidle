/**
 * The plugin service's record of what each plugin contributed.
 *
 * @lore BA9g: provenance used to be recorded seven ways, each covering a
 * different subset, so no surface could answer "what did this plugin
 * contribute" and the lifecycle operations disagreed with one another. Two of
 * the seven were never read at all. This module is the only answer now.
 *
 * The plugin service says WHICH rows a plugin owns; the service that owns each
 * table does the write. That is why nothing here writes `users`, `routines` or
 * `documents` — it hands their ids to the owner instead. It replaces a
 * `plugin_id` column on `users` and on `routines`, which was the plugin
 * service's provenance sitting in tables it does not own.
 */

import { pluginContributions, type WriteExecutor } from "@hyperidle/db";
import type { PluginContributionKind } from "@hyperidle/domain-model";
import { and, eq, inArray } from "drizzle-orm";

/** One thing a plugin contributed. */
export interface PluginContribution {
	readonly id: string;
	readonly pluginId: string;
	readonly kind: PluginContributionKind;
	readonly entityId: string;
	/** Set when a person edited it — a reinstall leaves their version alone. */
	readonly detachedAt: string | null;
}

/** Deterministic, so recording the same contribution twice is one row. */
function contributionId(pluginId: string, kind: PluginContributionKind, entityId: string): string {
	return `pc_${kind[0]}_${pluginId}_${entityId}`;
}

/**
 * Record that `pluginId` contributed `entityId`.
 *
 * Idempotent: reinstalling re-records the same contribution without disturbing
 * `detachedAt`, so a person's edit survives a reinstall.
 */
export async function recordContribution(
	exec: WriteExecutor,
	input: {
		readonly pluginId: string;
		readonly kind: PluginContributionKind;
		readonly entityId: string;
		readonly ts: string;
	},
): Promise<void> {
	await exec
		.insert(pluginContributions)
		.values({
			id: contributionId(input.pluginId, input.kind, input.entityId),
			pluginId: input.pluginId,
			kind: input.kind,
			entityId: input.entityId,
			detachedAt: null,
			createdAt: input.ts,
		})
		.onConflictDoNothing();
}

/** Everything a plugin contributed, whatever state those rows are in. */
export async function listContributions(
	db: WriteExecutor,
	pluginId: string,
): Promise<readonly PluginContribution[]> {
	const rows = await db
		.select()
		.from(pluginContributions)
		.where(eq(pluginContributions.pluginId, pluginId));
	return rows.map((r) => ({
		id: r.id,
		pluginId: r.pluginId,
		kind: r.kind,
		entityId: r.entityId,
		detachedAt: r.detachedAt,
	}));
}

/** The ids of one kind of thing a plugin contributed — what a lifecycle write needs. */
export async function contributedEntityIds(
	db: WriteExecutor,
	pluginId: string,
	kind: PluginContributionKind,
): Promise<readonly string[]> {
	const rows = await db
		.select({ entityId: pluginContributions.entityId })
		.from(pluginContributions)
		.where(and(eq(pluginContributions.pluginId, pluginId), eq(pluginContributions.kind, kind)));
	return rows.map((r) => r.entityId);
}

/**
 * Mark a contribution as the person's now, so a reinstall leaves it alone.
 *
 * This replaces `documents.updated_by = 'plugin:<id>'`, a sentinel that
 * was written and reset but never read — and which rendered in the knowledge
 * view as a raw `plugin:<id>` author string.
 */
export async function markDetached(
	exec: WriteExecutor,
	input: {
		readonly kind: PluginContributionKind;
		readonly entityId: string;
		readonly ts: string;
	},
): Promise<void> {
	await exec
		.update(pluginContributions)
		.set({ detachedAt: input.ts })
		.where(
			and(
				eq(pluginContributions.kind, input.kind),
				eq(pluginContributions.entityId, input.entityId),
			),
		);
}

/** Hand a detached contribution back to its plugin. */
export async function clearDetached(
	exec: WriteExecutor,
	input: { readonly kind: PluginContributionKind; readonly entityId: string },
): Promise<void> {
	await exec
		.update(pluginContributions)
		.set({ detachedAt: null })
		.where(
			and(
				eq(pluginContributions.kind, input.kind),
				eq(pluginContributions.entityId, input.entityId),
			),
		);
}

/**
 * Forget contributions this plugin no longer declares.
 *
 * Called on install with the ids the manifest currently declares: anything else
 * this plugin used to contribute is stale. The ROWS are the caller's to clean
 * up — this only forgets the ownership claim.
 */
export async function forgetContributionsExcept(
	exec: WriteExecutor,
	input: {
		readonly pluginId: string;
		readonly kind: PluginContributionKind;
		readonly keepEntityIds: readonly string[];
	},
): Promise<readonly string[]> {
	const existing = await exec
		.select({ entityId: pluginContributions.entityId })
		.from(pluginContributions)
		.where(
			and(
				eq(pluginContributions.pluginId, input.pluginId),
				eq(pluginContributions.kind, input.kind),
			),
		);
	const keep = new Set(input.keepEntityIds);
	const stale = existing.map((r) => r.entityId).filter((id) => !keep.has(id));
	if (stale.length === 0) return [];

	await exec
		.delete(pluginContributions)
		.where(
			and(
				eq(pluginContributions.pluginId, input.pluginId),
				eq(pluginContributions.kind, input.kind),
				inArray(pluginContributions.entityId, stale),
			),
		);
	return stale;
}
