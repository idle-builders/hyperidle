import { type HyperIdleDb, notificationQueue } from "@hyperidle/db";
import { and, asc, eq, inArray } from "drizzle-orm";
import { type NotificationConfig, pickRecipient } from "./config.js";
import { scrubErrorMessage } from "./redact.js";
import type { Notification, NotificationAdapter } from "./types.js";

export interface DigestResult {
	status: "sent" | "noop" | "error";
	notificationsIncluded: number;
	error?: string;
}

interface DigestBuild {
	subject: string;
	body: string;
	count: number;
}

/** Pure — builds the message body from raw queue rows. */
function buildDigestMessage(
	rows: ReadonlyArray<{ title: string; severity: string; createdAt: string }>,
): DigestBuild {
	const count = rows.length;
	const subject = count === 1 ? "HyperIdle digest: 1 item" : `HyperIdle digest: ${count} items`;
	const lines = rows.map((row) => `- [${row.severity}] ${row.title} (${row.createdAt})`);
	const body = [
		`You have ${count} accumulated notifications since the last digest.`,
		"",
		...lines,
	].join("\n");
	return { subject, body, count };
}

/**
 * Drain every pending row → single batched notification. Claims every
 * included row (status=sending) BEFORE the adapter call so a crash
 * after send-before-update requeues only once; on adapter success we
 * mark all included rows `sent` in a single update; on failure we
 * revert their status to `pending` so the next digest picks them up.
 */
export async function runDailyDigest(
	db: HyperIdleDb,
	adapter: NotificationAdapter,
	cfg: NotificationConfig,
	now: Date,
): Promise<DigestResult> {
	const pending = await db
		.select()
		.from(notificationQueue)
		.where(eq(notificationQueue.status, "pending"))
		.orderBy(asc(notificationQueue.createdAt));
	if (pending.length === 0) {
		return { status: "noop", notificationsIncluded: 0 };
	}

	const recipient = pickRecipient(cfg, adapter.name, "digest");
	if (!recipient) {
		return {
			status: "error",
			notificationsIncluded: 0,
			error: "no recipient configured for digest channel",
		};
	}

	// Atomic batch claim: flip all observed pending ids to `sending` with
	// an identical claimedAt stamp. Concurrent dispatchers or flushes
	// will see them as already-claimed and skip.
	const ids = pending.map((r) => r.id);
	const claimedAt = now.toISOString();
	await db
		.update(notificationQueue)
		.set({ status: "sending", claimedAt })
		.where(and(inArray(notificationQueue.id, ids), eq(notificationQueue.status, "pending")));

	const rows = await db
		.select()
		.from(notificationQueue)
		.where(and(inArray(notificationQueue.id, ids), eq(notificationQueue.status, "sending")));

	if (rows.length === 0) {
		return { status: "noop", notificationsIncluded: 0 };
	}

	const { subject, body, count } = buildDigestMessage(rows);
	const notification: Notification = {
		title: subject,
		body,
		severity: "digest",
		timestamp: now.getTime(),
	};

	let result: Awaited<ReturnType<NotificationAdapter["send"]>>;
	try {
		result = await adapter.send(recipient, notification);
	} catch (err) {
		// Adapter threw — revert claimed rows back to pending so the
		// next digest (or flush) can retry.
		await db
			.update(notificationQueue)
			.set({ status: "pending", claimedAt: null })
			.where(inArray(notificationQueue.id, ids));
		return {
			status: "error",
			notificationsIncluded: 0,
			error: scrubErrorMessage(err instanceof Error ? err.message : String(err), {
				smtpUsername: cfg.smtp.username,
				smtpPassword: cfg.smtp.password,
				ntfyAuthToken: cfg.ntfy.authToken,
			}),
		};
	}

	if (!result.ok) {
		const scrubbed = scrubErrorMessage(result.error, {
			smtpUsername: cfg.smtp.username,
			smtpPassword: cfg.smtp.password,
			ntfyAuthToken: cfg.ntfy.authToken,
		});
		// Adapter returned failure — revert claimed rows so the next
		// run retries.
		await db
			.update(notificationQueue)
			.set({ status: "pending", claimedAt: null, lastError: scrubbed })
			.where(inArray(notificationQueue.id, ids));
		return {
			status: "error",
			notificationsIncluded: 0,
			error: scrubbed,
		};
	}

	// Cross-row transition: every claimed row now sent.
	await db
		.update(notificationQueue)
		.set({
			status: "sent",
			sentAt: claimedAt,
			claimedAt: null,
		})
		.where(inArray(notificationQueue.id, ids));
	return { status: "sent", notificationsIncluded: count };
}
