/**
 * @lore The queue is persistent (`notification_queue`) so a process
 * restart during a silence hold does not lose a blocking notification.
 * A pure in-memory buffer would violate the UX-3 guarantee that blocking
 * items surface to a human.
 *
 * @lore At-least-once delivery: rows are claimed (status=sending,
 * claimedAt=now) in a single update BEFORE the adapter runs. After
 * adapter success we flip to `sent`; on adapter failure we mark
 * `failed`. If the process dies mid-send, a subsequent flush detects
 * the stuck lease (status=sending older than `LEASE_TIMEOUT_MS`) and
 * requeues back to `pending`. This still means an operator-visible
 * second attempt if the adapter actually succeeded but we crashed
 * before recording it — at-least-once, not exactly-once, and ntfy/SMTP
 * servers do not dedupe, so the operator may see two rows. The
 * alternative (exactly-once) requires adapter-side idempotency keys,
 * which neither transport provides.
 *
 * @lore R8: Event-to-notification subscription mapping.
 * Events the dispatcher subscribes to:
 *   item_created       → classifyItem (blocking→push, high→push, medium→digest, low→drop)
 *   cost_cap_breached  → classifyCostBreach (hard→push+bypass_silence, soft→digest)
 *   cost_cap_warning   → classifyCostWarning (critical→push, warning→digest)
 *   routine_fired      → daily_digest trigger only (not a notification)
 *
 * Events the dispatcher does NOT subscribe to (intentionally silent):
 *   task_state_changed  → WS "work" topic for UI updates only
 *   bet_state_changed   → WS "work" topic for UI updates only
 *   Thread/session/knowledge events → WS per-topic for UI updates only
 */

import * as crypto from "node:crypto";
import type { HyperIdleDb, Item } from "@hyperidle/db";
import {
	type CostCapBreachedEvent,
	type CostCapWarningEvent,
	createLogger,
	type EventBus,
	type ItemCreatedEvent,
	type Logger,
	type RoutineFiredEvent,
} from "@hyperidle/shared";
import { loadNotificationConfig, type NotificationConfig, pickRecipient } from "./config.js";
import { type DigestResult, runDailyDigest } from "./digest.js";
import {
	claimForSend,
	insertNotification,
	listPending,
	listPendingDigest,
	listStuckLeases,
	queueCountByStatus,
	requeueLease,
	updateStatus,
} from "./notification-queue.js";
import type {
	NotificationsConfigDeps,
	NotificationsSilenceDeps,
	NotificationsWorkReader,
} from "./ports.js";
import { scrubErrorMessage } from "./redact.js";
import { isFactorySilenced, isInSilenceWindow, readSilenceWindow } from "./silence-policy.js";
import type {
	Classification,
	Notification,
	NotificationAdapter,
	NotificationChannel,
	NotificationSeverity,
	QueueReason,
	Recipient,
	SendResult,
} from "./types.js";

/**
 * @lore R8: Alert preferences read from server_config. All default true so
 * the system is fail-open: if the config is missing or unparseable, all
 * alerts are delivered. Hard cost breaches bypass all preferences — they
 * are safety-critical and cannot be disabled by operator configuration.
 */
export interface AlertPreferences {
	readonly blockerAlerts: boolean;
	readonly costAlerts: boolean;
	readonly reviewAlerts: boolean;
	readonly quietHoursEnabled: boolean;
	readonly quietHoursStart: string;
	readonly quietHoursEnd: string;
}

const ALERT_PREFS_DEFAULTS: AlertPreferences = {
	blockerAlerts: true,
	costAlerts: true,
	reviewAlerts: true,
	quietHoursEnabled: false,
	quietHoursStart: "22:00",
	quietHoursEnd: "08:00",
};

/**
 * Apply alert preferences to determine if an event should be dropped.
 *
 * Returns true when the event should be dropped (not delivered).
 *
 * Rules:
 * - blockerAlerts=false → drop blocking items (severity="blocking")
 * - costAlerts=false → drop cost-related events (isCostEvent=true), EXCEPT hard cost breaches
 * - reviewAlerts=false → drop events where itemKind="review"
 * - Hard cost breaches (isHardCostBreach=true) ALWAYS push — safety override.
 *
 * @lore R8: Quiet hours is a silence/enqueue operation (not a drop) — it is
 * handled separately in route() using the existing enqueueNotification path.
 * This function is pure drop logic only.
 */
export function applyAlertPreferences(
	classification: Classification,
	prefs: AlertPreferences,
	meta: { isHardCostBreach?: boolean; isCostEvent?: boolean; itemKind?: string },
): boolean {
	// Hard cost breaches bypass ALL preferences — safety override.
	if (meta.isHardCostBreach) return false;

	// costAlerts=false: drop cost-related events (non-hard-breach)
	if (!prefs.costAlerts && meta.isCostEvent) return true;

	// reviewAlerts=false: drop review-kind items
	if (!prefs.reviewAlerts && meta.itemKind === "review") return true;

	// blockerAlerts=false: drop blocking items (severity="blocking")
	if (
		!prefs.blockerAlerts &&
		classification.kind === "push" &&
		classification.severity === "blocking"
	)
		return true;

	return false;
}

export type AdapterFactory = (cfg: NotificationConfig) => NotificationAdapter;

export interface DispatcherDeps {
	adapterFactory: AdapterFactory;
	now?: () => Date;
	logger?: Logger;
	/**
	 * Inject alert preferences reader. Fail-open: if not provided or if it
	 * throws, the dispatcher defaults to all-alerts-ON.
	 *
	 * @lore R8: Option A from the architecture plan — inject readAlertPreferences
	 * via DispatcherDeps so app-runtime does not read server_config directly (avoiding
	 * a dependency inversion violation). The server package provides the
	 * implementation in bootstrapAppRuntime via readServerConfig(db).
	 */
	readAlertPreferences?: () => Promise<AlertPreferences>;
	/**
	 * @lore AU19 Increment 1g: `settings`/`users`/`org` DI ports (Mechanism C) —
	 * `loadNotificationConfig`/`isFactorySilenced`/`readSilenceWindow` used to
	 * import `@hyperidle/settings`/`@hyperidle/users`/the raw `teamMembers`
	 * table directly; now injected. `packages/server` wires the real
	 * functions, zero behavior change.
	 */
	notificationsConfig: NotificationsConfigDeps;
	silencePolicy: NotificationsSilenceDeps;
	/**
	 * @lore AU19 Increment 1g: `work` DI port (Mechanism C) — the
	 * `item_created` handler used to raw-query the foreign `items` table
	 * (`work`-owned) directly; now injected (`getItemById`), wired to
	 * `@hyperidle/work`'s real export.
	 */
	work: NotificationsWorkReader;
}

interface FloodState {
	windowStart: number;
	count: number;
}

const QUEUE_CAP = 10_000;
const LEASE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes — rollback stuck "sending" rows

function classifyItem(item: Pick<Item, "blocking" | "riskTier">): Classification {
	if (item.blocking) return { kind: "push", severity: "blocking" };
	if (item.riskTier === "high") return { kind: "push", severity: "blocking" };
	if (item.riskTier === "medium") return { kind: "digest", severity: "digest" };
	return { kind: "drop", reason: "low-risk non-blocking item" };
}

function classifyCostBreach(event: CostCapBreachedEvent): Classification {
	if (event.level === "hard") return { kind: "push", severity: "cost_breach" };
	return { kind: "digest", severity: "digest" };
}

function classifyCostWarning(event: CostCapWarningEvent): Classification {
	if (event.level === "critical") return { kind: "push", severity: "cost_breach" };
	return { kind: "digest", severity: "digest" };
}

function buildItemNotification(
	item: Item,
	severity: NotificationSeverity,
	now: Date,
): Notification {
	const title = item.title.slice(0, 140);
	const body = item.body ?? "No body provided.";
	return {
		title,
		body: body.slice(0, 10_000),
		severity,
		deepLink: `/conversations/item/${item.id}`,
		tags: severity === "blocking" ? ["blocking"] : undefined,
		timestamp: now.getTime(),
	};
}

function buildCostBreachNotification(
	event: CostCapBreachedEvent,
	severity: NotificationSeverity,
	now: Date,
): Notification {
	const title = `Cost cap ${event.level}: ${event.capLevel} ${event.entityId}`;
	const body = `Spend ${event.spend} exceeded cap ${event.cap} on ${event.capLevel} '${event.entityId}'.`;
	return {
		title: title.slice(0, 140),
		body,
		severity,
		tags: ["cost_cap", event.level],
		timestamp: now.getTime(),
	};
}

function buildCostWarningNotification(
	event: CostCapWarningEvent,
	severity: NotificationSeverity,
	now: Date,
): Notification {
	const title = `Cost cap ${event.level}: ${event.capLevel} ${event.entityId}`;
	const body = `Spend ${event.spend} / ${event.cap} on ${event.capLevel} '${event.entityId}'.`;
	return {
		title: title.slice(0, 140),
		body,
		severity,
		tags: ["cost_cap", event.level],
		timestamp: now.getTime(),
	};
}

export async function enqueueNotification(
	db: HyperIdleDb,
	params: {
		eventType: string;
		subjectId: string | null;
		severity: NotificationSeverity;
		title: string;
		body: string;
		reason: QueueReason;
		channel: NotificationChannel | null;
		now: Date;
		// AF8: in-app notification model fields (all optional for back-compat)
		typeKey?: string | null;
		urgency?: string | null;
		sourceLink?: string | null;
	},
	cap: number = QUEUE_CAP,
): Promise<void> {
	// Defense-in-depth queue cap. Digest rows are silently dropped when
	// the queue is full so blocking + cost_breach always have room. If
	// we cannot evict a digest row, we still must not exceed the cap —
	// drop the incoming non-digest row and surface a last-error entry
	// through the adapter retry path instead.
	while ((await queueCountByStatus(db, "pending")) >= cap) {
		if (params.severity === "digest") return;
		const [oldestDigest] = await listPendingDigest(db);
		if (!oldestDigest) {
			// No digest row to evict. Drop the oldest pending row of any
			// severity rather than exceed the cap.
			const [oldest] = await listPending(db);
			if (!oldest) break; // queue empty somehow — insert safely
			await updateStatus(db, oldest.id, { status: "dropped" });
			continue;
		}
		await updateStatus(db, oldestDigest.id, { status: "dropped" });
	}
	await insertNotification(db, {
		id: crypto.randomUUID(),
		eventType: params.eventType,
		subjectId: params.subjectId,
		severity: params.severity,
		title: params.title,
		body: params.body,
		reason: params.reason,
		channel: params.channel,
		status: "pending",
		attempts: 0,
		createdAt: params.now.toISOString(),
		// AF8: in-app notification model — persisted at enqueue, never reconstructed at render
		typeKey: params.typeKey ?? null,
		urgency: params.urgency ?? null,
		sourceLink: params.sourceLink ?? null,
	});
}

async function sendWithAdapter(
	adapter: NotificationAdapter,
	recipient: Recipient,
	notification: Notification,
	cfg: NotificationConfig,
): Promise<SendResult> {
	try {
		return await adapter.send(recipient, notification);
	} catch (err) {
		const raw = err instanceof Error ? err.message : String(err);
		return {
			ok: false,
			channel: adapter.name,
			error: scrubErrorMessage(raw, {
				smtpUsername: cfg.smtp.username,
				smtpPassword: cfg.smtp.password,
				ntfyAuthToken: cfg.ntfy.authToken,
			}),
			retriable: true,
		};
	}
}

/**
 * Requeue rows that were claimed (status=sending) more than
 * LEASE_TIMEOUT_MS ago — typically a process crash mid-send. Runs at
 * the top of every flush so a restart can recover stuck work.
 */
export async function recoverStuckLeases(db: HyperIdleDb, now: Date): Promise<number> {
	const cutoff = new Date(now.getTime() - LEASE_TIMEOUT_MS).toISOString();
	const stuck = await listStuckLeases(db, cutoff);
	for (const row of stuck) {
		await requeueLease(db, row.id);
	}
	return stuck.length;
}

/**
 * Atomically claim a pending row for delivery. Transitions pending →
 * sending and sets claimedAt. Returns true when the claim succeeded.
 * The WHERE clause guards against a concurrent flush claiming the same
 * row.
 */
async function claimRow(db: HyperIdleDb, rowId: string, now: Date): Promise<boolean> {
	const claimed = await claimForSend(db, rowId, now);
	return claimed !== undefined;
}

/**
 * Resolve the adapter to use for a queued row. Prefers the row's
 * `channel` column (stable from enqueue time); falls back to the
 * configured primary/digest channel when the column is null (older rows
 * or dispatch paths that didn't record a channel).
 */
function adapterForRow(
	factory: AdapterFactory,
	cfg: NotificationConfig,
	rowChannel: string | null,
	severity: NotificationSeverity,
): { adapter: NotificationAdapter; channel: NotificationChannel } {
	const channel: NotificationChannel =
		rowChannel === "console" || rowChannel === "ntfy" || rowChannel === "smtp"
			? rowChannel
			: severity === "digest"
				? cfg.digestChannel
				: cfg.primaryChannel;
	const adapter = factory({ ...cfg, primaryChannel: channel });
	return { adapter, channel };
}

/**
 * Drain pending queue rows through their respective adapters. Called on
 * silence lift and (optionally) by admin `/flush`. Rows marked `sent`
 * on success or `failed` + `lastError` on permanent failure.
 *
 * @lore AF8: COST-BREACH SILENCE SPLIT (concept hard rule #8).
 * The old implementation collapsed factory silence AND quiet-hours into one
 * isSilenced() boolean, then exempted cost_breach from ALL of it. This
 * violated rule #8: a cost breach during quiet hours would page the founder.
 *
 * The fix — two independent predicates read once per tick:
 *   factorySilenced = silence_mode=true OR per-product silence (no window check)
 *   inQuietHours = silence_window_start/end covers now
 *
 * Per-row decision:
 *   cost_breach: bypass factorySilenced (BYPASSES factory kill switch),
 *                respect inQuietHours (DEFERS during founder's sleep window)
 *   blocking:    defer on EITHER factorySilenced OR inQuietHours
 *   digest:      always flush (non-interruptive)
 *
 * isSilenced() is kept for backward-compat with the route() blocking path
 * inside registerNotificationDispatcher; it is NOT used here anymore.
 */
export async function flushQueue(
	db: HyperIdleDb,
	factory: AdapterFactory,
	cfg: NotificationConfig,
	now: Date,
	silencePolicy: NotificationsSilenceDeps,
): Promise<{ flushed: number; failed: number; deferred: number }> {
	await recoverStuckLeases(db, now);
	const rows = await listPending(db);
	let flushed = 0;
	let failed = 0;
	let deferred = 0;

	// Read the two predicates once per tick (not per row) — they are config-level.
	const factorySilenced = await isFactorySilenced(db, { sourceAgentId: null }, silencePolicy);
	const silenceWindow = await readSilenceWindow(db, silencePolicy);
	const inQuietHours = silenceWindow
		? isInSilenceWindow(silenceWindow.start, silenceWindow.end, now)
		: false;

	for (const row of rows) {
		const severity = row.severity as NotificationSeverity;

		// AF8 cost-breach split: two independent predicates.
		if (severity === "cost_breach") {
			// cost_breach BYPASSES factory silence (rule #8), RESPECTS quiet hours.
			if (inQuietHours) {
				deferred += 1;
				continue;
			}
			// fall through → flush (bypassing factory silence)
		} else if (severity === "blocking") {
			// blocking defers on EITHER factory silence OR quiet hours.
			if (factorySilenced || inQuietHours) {
				deferred += 1;
				continue;
			}
		}
		// digest: always flush (non-interruptive) — no silence check.
		if (!(await claimRow(db, row.id, now))) {
			// A concurrent flush took this row; skip.
			continue;
		}
		const { adapter, channel } = adapterForRow(factory, cfg, row.channel, severity);
		const recipient = pickRecipient(cfg, channel, severity === "digest" ? "digest" : "push");
		if (!recipient) {
			await updateStatus(db, row.id, {
				status: "failed",
				lastError: `no recipient configured for channel '${channel}'`,
				attempts: row.attempts + 1,
				claimedAt: null,
			});
			failed += 1;
			continue;
		}
		const notification: Notification = {
			title: row.title,
			body: row.body ?? "",
			severity,
			timestamp: now.getTime(),
		};
		const result = await sendWithAdapter(adapter, recipient, notification, cfg);
		if (result.ok) {
			await updateStatus(db, row.id, {
				status: "sent",
				sentAt: now.toISOString(),
				attempts: row.attempts + 1,
				claimedAt: null,
			});
			flushed += 1;
		} else {
			await updateStatus(db, row.id, {
				status: "failed",
				lastError: scrubErrorMessage(result.error, {
					smtpUsername: cfg.smtp.username,
					smtpPassword: cfg.smtp.password,
					ntfyAuthToken: cfg.ntfy.authToken,
				}),
				attempts: row.attempts + 1,
				claimedAt: null,
			});
			failed += 1;
		}
	}
	return { flushed, failed, deferred };
}

interface DispatcherState {
	disposed: boolean;
	flood: FloodState;
	adapterCache: { cfgKey: string; adapter: NotificationAdapter } | null;
}

export function tryFloodReserve(
	state: FloodState,
	max: number,
	windowMs: number,
	now: number,
): boolean {
	if (now - state.windowStart >= windowMs) {
		state.windowStart = now;
		state.count = 0;
	}
	if (state.count >= max) return false;
	state.count += 1;
	return true;
}

/**
 * Identity key for the memoized adapter. Changes in the SMTP host/port/
 * secure/username/password OR the ntfy base URL / auth token force a
 * rebuild (and `.close()` on the previous transporter when present).
 * Channel is included so switching primary channel also rebuilds.
 */
function cfgAdapterKey(cfg: NotificationConfig): string {
	return JSON.stringify({
		channel: cfg.primaryChannel,
		ntfy: { base: cfg.ntfy.baseUrl, tokenSet: cfg.ntfy.authToken ?? null },
		smtp: {
			host: cfg.smtp.host,
			port: cfg.smtp.port,
			secure: cfg.smtp.secure,
			username: cfg.smtp.username,
			// Identity uses a short hash of the password so a secret
			// compare does not leak timing; we only care about change
			// detection.
			passwordHash: cfg.smtp.password ? shortHash(cfg.smtp.password) : null,
			from: cfg.smtp.from,
			ignoreTls: cfg.smtpIgnoreTls,
		},
	});
}

function shortHash(value: string): string {
	return crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function getCachedAdapter(
	state: DispatcherState,
	factory: AdapterFactory,
	cfg: NotificationConfig,
): NotificationAdapter {
	const key = cfgAdapterKey(cfg);
	if (state.adapterCache && state.adapterCache.cfgKey === key) {
		return state.adapterCache.adapter;
	}
	// Close the previous transporter if the adapter exposes a close hook.
	if (state.adapterCache?.adapter?.close) {
		try {
			state.adapterCache.adapter.close();
		} catch {
			// Ignore — teardown is best effort.
		}
	}
	const adapter = factory(cfg);
	state.adapterCache = { cfgKey: key, adapter };
	return adapter;
}

/**
 * Read alert preferences via the injected reader, failing open to all-alerts-ON
 * defaults if the reader is not provided or throws.
 *
 * Extracted from route() to reduce its cognitive complexity.
 */
async function readPrefs(
	readAlertPreferences: (() => Promise<AlertPreferences>) | undefined,
): Promise<AlertPreferences> {
	if (!readAlertPreferences) return ALERT_PREFS_DEFAULTS;
	try {
		return await readAlertPreferences();
	} catch {
		// Fail-open: treat errors as all-alerts-ON defaults.
		return ALERT_PREFS_DEFAULTS;
	}
}

/**
 * Register the dispatcher on the event bus. Returns a disposer that
 * unsubscribes + marks the handler disposed so pending microtasks exit
 * cleanly.
 */
export function registerNotificationDispatcher(
	db: HyperIdleDb,
	bus: EventBus,
	deps: DispatcherDeps,
): () => void {
	const logger = deps.logger ?? createLogger({ pkg: "notifications.dispatcher" });
	const nowFn = deps.now ?? ((): Date => new Date());
	const state: DispatcherState = {
		disposed: false,
		flood: { windowStart: 0, count: 0 },
		adapterCache: null,
	};

	async function dispatchPush(
		cfg: NotificationConfig,
		channel: NotificationChannel,
		notification: Notification,
		eventType: string,
		subjectId: string | null,
	): Promise<void> {
		const adapter = getCachedAdapter(state, deps.adapterFactory, {
			...cfg,
			primaryChannel: channel,
		});
		const recipient = pickRecipient(cfg, channel);
		if (!recipient) {
			// @lore When the recipient is missing we enqueue a `failed` row
			// instead of silently dropping (adversary #6). An operator
			// reviewing `GET /queue?status=failed` can see what was lost
			// and why.
			logger.warn("dispatcher: recipient not configured; persisting as failed", {
				channel,
				eventType,
			});
			await insertNotification(db, {
				id: crypto.randomUUID(),
				eventType,
				subjectId,
				severity: notification.severity,
				title: notification.title,
				body: notification.body,
				reason: "retry",
				channel,
				status: "failed",
				attempts: 0,
				lastError: `no recipient configured for channel '${channel}'`,
				createdAt: nowFn().toISOString(),
			});
			return;
		}
		const result = await sendWithAdapter(adapter, recipient, notification, cfg);
		if (!result.ok) {
			logger.error("dispatcher: adapter send failed", {
				error: scrubErrorMessage(result.error, {
					smtpUsername: cfg.smtp.username,
					smtpPassword: cfg.smtp.password,
					ntfyAuthToken: cfg.ntfy.authToken,
				}),
				retriable: result.retriable,
				channel,
			});
			await enqueueNotification(db, {
				eventType,
				subjectId,
				severity: notification.severity,
				title: notification.title,
				body: notification.body,
				reason: "retry",
				channel,
				now: nowFn(),
			});
		}
	}

	async function route(
		classification: Classification,
		notification: Notification | null,
		eventType: string,
		subjectId: string | null,
		sourceAgentId: string | null,
		prefMeta: { isHardCostBreach?: boolean; isCostEvent?: boolean; itemKind?: string },
	): Promise<void> {
		if (state.disposed) return;
		const cfg = await loadNotificationConfig(db, deps.notificationsConfig);
		if (!cfg) return;
		if (classification.kind === "drop") return;
		if (notification === null) return;

		// Apply alert preferences (fail-open: if not injected or throws, use all-alerts-ON defaults).
		const prefs = await readPrefs(deps.readAlertPreferences);
		if (applyAlertPreferences(classification, prefs, prefMeta)) return;

		const now = nowFn();

		// AF8: COST-BREACH SILENCE SPLIT (concept hard rule #8) — direct-send path.
		// Mirrors the flushQueue split. Two independent predicates:
		//   factorySilenced = silence_mode OR per-product silence (no window)
		//   inQuietHours    = silence_window_start/end covers now
		//
		// @lore AF8: The previous logic (inherited from R8) checked quietHoursEnabled
		// from AlertPreferences and bypassed quiet hours for hard cost breaches, making
		// it safe but coarser (no factory-level window check). The AF8 split aligns
		// the direct-send path with the drain's logic: cost_breach respects quiet hours
		// from `server_config.notifications.silence` (not just AlertPreferences
		// quietHoursEnabled). AlertPreferences quietHoursEnabled check is kept as an
		// additional gate because it may be set independently (e.g. by users who have
		// not set a factory window).
		//
		// Decision precedence:
		//   1. AlertPreferences quiet hours (R8 gate)
		//   2. server_config.notifications.silence window (AF8 gate — read once from DB;
		//      AU18: re-backed off the retired factory_settings.silence_window_* KV keys)
		// Either gate triggers deferral for non-breach rows.
		// cost_breach defers on quiet hours from either source; bypasses factory silence.

		const factSilenced = await isFactorySilenced(db, { sourceAgentId }, deps.silencePolicy);
		const silenceWin = await readSilenceWindow(db, deps.silencePolicy);
		const inQuietHoursFactory = silenceWin
			? isInSilenceWindow(silenceWin.start, silenceWin.end, now)
			: false;
		const inQuietHoursPrefs =
			prefs.quietHoursEnabled && isInSilenceWindow(prefs.quietHoursStart, prefs.quietHoursEnd, now);
		const inQuietHours = inQuietHoursFactory || inQuietHoursPrefs;

		if (prefMeta.isHardCostBreach) {
			// cost_breach: bypass factory silence, RESPECT quiet hours
			if (inQuietHours) {
				await enqueueNotification(db, {
					eventType,
					subjectId,
					severity: classification.severity,
					title: notification.title,
					body: notification.body,
					reason: "silence",
					channel: null,
					now,
				});
				return;
			}
			// fall through → dispatch (bypasses factory silence)
		} else if (factSilenced || inQuietHours) {
			// non-breach: defer on factory silence OR quiet hours
			await enqueueNotification(db, {
				eventType,
				subjectId,
				severity: classification.severity,
				title: notification.title,
				body: notification.body,
				reason: "silence",
				channel: null,
				now,
			});
			return;
		}

		if (classification.kind === "digest") {
			await enqueueNotification(db, {
				eventType,
				subjectId,
				severity: "digest",
				title: notification.title,
				body: notification.body,
				reason: "digest",
				channel: cfg.digestChannel,
				now,
			});
			return;
		}

		const allowed = tryFloodReserve(
			state.flood,
			cfg.flood.maxPerMinute,
			cfg.flood.coalesceWindowMs,
			now.getTime(),
		);
		if (!allowed) {
			await enqueueNotification(db, {
				eventType,
				subjectId,
				severity: classification.severity,
				title: notification.title,
				body: notification.body,
				reason: "flood_coalesce",
				channel: cfg.primaryChannel,
				now,
			});
			return;
		}

		void dispatchPush(cfg, cfg.primaryChannel, notification, eventType, subjectId);
	}

	const unsubItemCreated = bus.on("item_created", (event: ItemCreatedEvent): void => {
		if (state.disposed) return;
		void (async () => {
			const item = await deps.work.getItemById(db, event.itemId);
			if (!item) return;
			const classification = classifyItem(item);
			const notification =
				classification.kind === "drop"
					? null
					: buildItemNotification(item, classification.severity, nowFn());
			await route(classification, notification, "item_created", event.itemId, item.sourceAgentId, {
				// item.kind is string | null from DB; route expects string | undefined.
				itemKind: item.kind ?? undefined,
			});
		})();
	});

	const unsubCostBreach = bus.on("cost_cap_breached", (event: CostCapBreachedEvent): void => {
		if (state.disposed) return;
		const classification = classifyCostBreach(event);
		const notification =
			classification.kind === "drop"
				? null
				: buildCostBreachNotification(event, classification.severity, nowFn());
		void route(classification, notification, "cost_cap_breached", event.entityId, null, {
			isCostEvent: true,
			isHardCostBreach: event.level === "hard",
		});
	});

	const unsubCostWarning = bus.on("cost_cap_warning", (event: CostCapWarningEvent): void => {
		if (state.disposed) return;
		const classification = classifyCostWarning(event);
		const notification =
			classification.kind === "drop"
				? null
				: buildCostWarningNotification(event, classification.severity, nowFn());
		void route(classification, notification, "cost_cap_warning", event.entityId, null, {
			isCostEvent: true,
		});
	});

	const unsubRoutine = bus.on("routine_fired", (event: RoutineFiredEvent): void => {
		if (state.disposed) return;
		// @lore Daily digest is triggered by a `routine_fired` event whose
		// routineId embeds `daily_digest`. The seed fixture yields ids like
		// `seed-routine-daily_digest`; substring match keeps us decoupled
		// from the concrete id format.
		if (!event.routineId.includes("daily_digest")) return;
		void (async () => {
			const cfg = await loadNotificationConfig(db, deps.notificationsConfig);
			if (!cfg) return;
			const adapter = getCachedAdapter(state, deps.adapterFactory, cfg);
			queueMicrotask(() => {
				if (state.disposed) return;
				void runDailyDigest(db, adapter, cfg, nowFn()).catch((err) => {
					logger.error("dispatcher: daily digest failed", {
						error: err instanceof Error ? err.message : String(err),
					});
				});
			});
		})();
	});

	return (): void => {
		state.disposed = true;
		unsubItemCreated();
		unsubCostBreach();
		unsubCostWarning();
		unsubRoutine();
		// Release any transporter the cache is holding.
		if (state.adapterCache?.adapter?.close) {
			try {
				state.adapterCache.adapter.close();
			} catch {
				// ignore
			}
		}
		state.adapterCache = null;
	};
}

/**
 * External trigger for the daily digest. Exposed for the route handler
 * (`POST /notifications/digest`) and for the `routine_fired` subscriber.
 */
export async function dispatchDigest(
	db: HyperIdleDb,
	deps: DispatcherDeps,
	nowOverride?: Date,
): Promise<DigestResult> {
	const logger = deps.logger ?? createLogger({ pkg: "notifications.dispatcher" });
	const nowFn = deps.now ?? ((): Date => new Date());
	const now = nowOverride ?? nowFn();
	const cfg = await loadNotificationConfig(db, deps.notificationsConfig);
	if (!cfg) {
		return { status: "noop", notificationsIncluded: 0 };
	}
	const adapter = deps.adapterFactory(cfg);
	try {
		return await runDailyDigest(db, adapter, cfg, now);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		logger.error("dispatcher: runDailyDigest threw", { error: message });
		return { status: "error", notificationsIncluded: 0, error: message };
	}
}
