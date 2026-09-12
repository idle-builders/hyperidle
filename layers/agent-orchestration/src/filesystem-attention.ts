/**
 * BA5 §2.6/§4.3/§4.5 — the ONE writer-and-emitter for a filesystem's
 * `needs_attention` transition. Every caller that discovers a broken
 * filesystem — a placement failure, a failing `Check`, a failing check at
 * registration — goes through this, never the registry writer directly, so
 * the once-per-episode notice rule lives in exactly one place.
 *
 * `markFilesystemNeedsAttention`'s conditional update already tells us
 * whether this call is the transition INTO the state (`entered: true`) or
 * only a reason refresh on a row already there; only the former publishes.
 */
import type { HyperIdleDb } from "@hyperidle/db";
import type { EventBus } from "@hyperidle/event-bus";
import { getFilesystem, markFilesystemNeedsAttention } from "@hyperidle/filesystems";
import { redactSecrets } from "./redact-secrets.js";

interface ParsedResourceRef {
	readonly kind?: string;
	readonly repo?: string;
	readonly folder?: string;
}

/** The label a notice/event names the filesystem by: its repo URL/path, or its folder path. */
function filesystemLabel(id: string, rawResourceRef: string): string {
	try {
		const ref = JSON.parse(rawResourceRef) as ParsedResourceRef;
		if (ref.kind === "code" && typeof ref.repo === "string") return ref.repo;
		if (ref.kind === "doc_set" && typeof ref.folder === "string") return ref.folder;
	} catch {
		/* fall through to the id */
	}
	return id;
}

export async function recordFilesystemNeedsAttention(
	db: HyperIdleDb,
	eventBus: EventBus | undefined,
	filesystemId: string,
	reason: string,
): Promise<void> {
	const result = await markFilesystemNeedsAttention(db, filesystemId, reason);
	if (!(result?.entered && eventBus)) return;

	const row = await getFilesystem(db, filesystemId);
	const label = row ? filesystemLabel(filesystemId, row.resourceRef) : filesystemId;

	eventBus.emit({
		type: "filesystem_needs_attention",
		streamId: `filesystem:${filesystemId}`,
		filesystemId,
		filesystemLabel: redactSecrets(label, []),
		agentIds: result.agentIds,
		reason: redactSecrets(reason, []),
		timestamp: Date.now(),
	});
}
