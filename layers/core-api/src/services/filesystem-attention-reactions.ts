/**
 * @lore: the filesystem-hold's inbox producer.
 *
 * Orchestration is a blind, request-driven executor: it holds zero `-> users`
 * edge and never reads core-api state (architecture.md §4.6). Its one outward
 * act on entering `needs_attention` is the `filesystem_needs_attention` event
 * (`recordFilesystemNeedsAttention`, agent-orchestration layer root) — this
 * reaction is the ONLY subscriber, resolving the agents' names from core's
 * own `users` and turning the event into one `notification_queue` row.
 *
 * Shape copied from `agent-health-session-end-reactions.ts`: a per-eventBus
 * `registeredBuses` WeakSet idempotency guard, the explicit
 * `register*(db, eventBus)` wiring convention, and a direct `enqueue` rather
 * than the `notification` event-listener path (which resolves a *work item*
 * by `targetId` and cannot carry a filesystem).
 *
 * No dedupe lives here — the once-per-episode guarantee is entirely
 * orchestration's own conditional update (`markFilesystemNeedsAttention`'s
 * `WHERE state<>'needs_attention'`): this reaction fires exactly
 * once per event it receives, and orchestration guarantees exactly one event
 * per episode.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import { createLogger } from "@hyperidle/diagnostics";
import type { EventBus, FilesystemNeedsAttentionEvent } from "@hyperidle/event-bus";
import { enqueue } from "@hyperidle/notifications";
import { findUser } from "@hyperidle/users";

const logger = createLogger({ pkg: "core-api.filesystem-attention-reactions" });
const registeredBuses = new WeakSet<EventBus>();

async function resolveAgentNames(db: HyperIdleDb, agentIds: readonly string[]): Promise<string[]> {
	const names: string[] = [];
	for (const agentId of agentIds) {
		const agent = await findUser(db, { id: agentId });
		names.push(agent?.name ?? agentId);
	}
	return names;
}

/** The middle sentence is dropped when the event carries no agents (a failing check at registration, before any agent has the filesystem). */
function describeBody(reason: string, agentNames: readonly string[]): string {
	if (agentNames.length === 0) {
		return `${reason} After fixing it, press Check in Settings → Filesystems.`;
	}
	const names = agentNames.join(", ");
	return `${reason} ${names} won't start work until it's fixed. After fixing it, press Check in Settings → Filesystems.`;
}

async function recordFilesystemAttentionNotice(
	db: HyperIdleDb,
	event: FilesystemNeedsAttentionEvent,
): Promise<void> {
	const agentNames = await resolveAgentNames(db, event.agentIds);
	const now = new Date().toISOString();
	await enqueue(db, {
		id: crypto.randomUUID(),
		eventType: "filesystem_needs_attention",
		subjectId: event.filesystemId,
		severity: "blocking",
		title: `Filesystem needs attention: ${event.filesystemLabel}`,
		body: describeBody(event.reason, agentNames),
		reason: "filesystem_needs_attention",
		channel: null,
		sourceLink: "/settings",
		status: "pending",
		attempts: 0,
		createdAt: now,
	});
}

/**
 * Register core-api's filesystem-attention reaction on `eventBus`. Returns an
 * unsubscribe function. Safe to call more than once with the SAME `eventBus`
 * instance — only the first registration takes effect.
 */
export function registerFilesystemAttentionReactions(
	db: HyperIdleDb,
	eventBus: EventBus,
): () => void {
	if (registeredBuses.has(eventBus)) {
		return () => {};
	}
	registeredBuses.add(eventBus);

	const unsubscribe = eventBus.on("filesystem_needs_attention", (event) => {
		void recordFilesystemAttentionNotice(db, event).catch((error: unknown) => {
			logger.error("filesystem_needs_attention reaction failed", {
				filesystemId: event.filesystemId,
				error: error instanceof Error ? error.message : String(error),
			});
		});
	});

	return () => {
		unsubscribe();
		registeredBuses.delete(eventBus);
	};
}
