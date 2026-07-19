/**
 * @lore AU20 Ag6b: single-entry public wiring for the notifications delivery
 * chain. The adapter + digest + mute/silence + PII-redact + SSRF-guard
 * delivery chain is entirely absorbed behind `installNotifications` and the
 * wrapper functions exported here. The composition root (server-factory / app)
 * calls these; nothing in the delivery chain is re-exported from the barrel.
 *
 * This module is the ONLY module in the notifications package that may reach
 * for delivery-chain internals. Everything else in `src/**` stays untouched —
 * the composition-boundary-guard still bans `@hyperidle/*` imports here.
 */

import type { HyperIdleDb } from "@hyperidle/db";
import { defaultNotificationAdapterFactory } from "./adapter-factory.js";
import {
	loadNotificationConfig,
	pickRecipient,
	readNotificationConfig,
	redactNotificationConfig,
	updateNotificationConfig,
	type NotificationConfig,
	type NotificationConfigPatch,
	type SafeNotificationConfig,
	sanitizeCron,
	sanitizeEmail,
	sanitizeNtfyUrl,
	sanitizeSmtpCredential,
	sanitizeSmtpHost,
	sanitizeTopic,
} from "./config.js";
import { dispatchDigest, flushQueue, registerNotificationDispatcher } from "./dispatcher.js";
import type { AlertPreferences } from "./dispatcher.js";
import type { DigestResult } from "./digest.js";
import { startNotificationDrain } from "./drain.js";
import { getMutedTypeKeys, defaultMutePreferenceReader, defaultMutePreferenceWriter } from "./mute.js";
import { registerNotificationListener } from "./notification-listener.js";
import type {
	NotificationsConfigDeps,
	NotificationsDeps,
	NotificationsMuteDeps,
	NotificationsSilenceDeps,
} from "./ports.js";
import type {
	EventBus,
	Logger,
	NotificationTypeKey,
} from "@hyperidle/shared";
import type { NotificationAdapter, NotificationChannel } from "./types.js";

// ---------------------------------------------------------------------------
// Helpers: extract sub-dep bags from the collapsed NotificationsDeps
// ---------------------------------------------------------------------------

function toConfigDeps(deps: NotificationsDeps): NotificationsConfigDeps {
	return {
		serverConfig: deps.serverConfig,
		credentialCipher: deps.credentialCipher,
		credentialStore: deps.credentialStore,
	};
}

function toMuteDeps(deps: NotificationsDeps): NotificationsMuteDeps {
	return { serverConfig: deps.serverConfig };
}

function toSilenceDeps(deps: NotificationsDeps): NotificationsSilenceDeps {
	return {
		serverConfig: deps.serverConfig,
		users: deps.users,
		teams: deps.teams,
	};
}

// ---------------------------------------------------------------------------
// Public: installNotifications
// ---------------------------------------------------------------------------

/**
 * Boot all three notification delivery workers in one call:
 *   1. Dispatcher — event-bus subscriber (item_created / cost_cap / routine_fired)
 *   2. Listener   — notification event → typed in-app row
 *   3. Drain      — 1-minute interval that flushes pending queue rows
 *
 * Returns a single disposer that tears down all three.
 *
 * @lore AU20 Ag6b: replaces the three separate
 * `registerNotificationDispatcher` / `registerNotificationListener` /
 * `startNotificationDrain` calls in server-factory.ts. The opts bag passes
 * alert-preference reader, adapter factory override (for tests), now() provider,
 * and logger without exposing any internal types in the public interface.
 */
export function installNotifications(
	db: HyperIdleDb,
	bus: EventBus,
	deps: NotificationsDeps,
	opts?: {
		/** Override the adapter factory. Tests inject a FakeAdapter here. */
		adapterFactory?: (cfg: NotificationConfig) => NotificationAdapter;
		/**
		 * Inject alert preferences reader. Fail-open: if not provided or throws,
		 * dispatcher defaults to all-alerts-ON.
		 */
		readAlertPreferences?: () => Promise<AlertPreferences>;
		now?: () => Date;
		logger?: Logger;
	},
): () => void {
	const factory = opts?.adapterFactory ?? defaultNotificationAdapterFactory;
	const configDeps = toConfigDeps(deps);
	const silenceDeps = toSilenceDeps(deps);
	const muteDeps = toMuteDeps(deps);

	const disposeDispatcher = registerNotificationDispatcher(db, bus, {
		adapterFactory: factory,
		readAlertPreferences: opts?.readAlertPreferences,
		notificationsConfig: configDeps,
		silencePolicy: silenceDeps,
		work: deps.work,
		now: opts?.now,
		logger: opts?.logger,
	});

	const muteReader = defaultMutePreferenceReader(db, muteDeps);
	const disposeListener = registerNotificationListener(db, bus, {
		mute: muteReader,
		work: deps.work,
		now: opts?.now,
	});

	const disposeDrain = startNotificationDrain(db, factory, {
		notificationsConfig: configDeps,
		silencePolicy: silenceDeps,
		now: opts?.now,
	});

	return (): void => {
		disposeDrain();
		disposeListener();
		disposeDispatcher();
	};
}

// ---------------------------------------------------------------------------
// Public: config wrappers
// ---------------------------------------------------------------------------

/** Read + redact the notification config. Never exposes raw secrets. */
export async function readConfig(
	db: HyperIdleDb,
	deps: NotificationsDeps,
): Promise<SafeNotificationConfig> {
	const cfg = await readNotificationConfig(db, toConfigDeps(deps));
	return redactNotificationConfig(cfg);
}

type SanitizeFn = (input: string) => { ok: true } | { ok: false; reason: string };

const PATCH_SANITIZERS: ReadonlyArray<{
	field: keyof NotificationConfigPatch;
	sanitize: SanitizeFn;
}> = [
	{ field: "recipientEmail", sanitize: sanitizeEmail },
	{ field: "recipientNtfyTopic", sanitize: sanitizeTopic },
	{ field: "ntfyBaseUrl", sanitize: sanitizeNtfyUrl },
	{ field: "smtpHost", sanitize: sanitizeSmtpHost },
	{ field: "smtpFrom", sanitize: sanitizeEmail },
	{ field: "smtpUsername", sanitize: sanitizeSmtpCredential },
	{ field: "smtpPassword", sanitize: sanitizeSmtpCredential },
	{ field: "digestCron", sanitize: sanitizeCron },
];

/**
 * Validate, persist, and return the updated (redacted) config.
 * Throws a plain `Error` tagged `code: "NOTIFICATIONS_VALIDATION_ERROR"` when
 * a field fails sanitization — the caller can discriminate and return 400.
 */
export async function updateConfig(
	db: HyperIdleDb,
	patch: NotificationConfigPatch,
	deps: NotificationsDeps,
): Promise<SafeNotificationConfig> {
	for (const { field, sanitize } of PATCH_SANITIZERS) {
		const value = patch[field as keyof typeof patch];
		if (value === undefined || value === null) continue;
		if (typeof value !== "string") continue;
		const r = sanitize(value);
		if (!r.ok) {
			throw Object.assign(new Error(r.reason), {
				code: "NOTIFICATIONS_VALIDATION_ERROR" as const,
			});
		}
	}
	if (
		(patch as Record<string, unknown>).smtpIgnoreTls === true &&
		process.env.NODE_ENV === "production"
	) {
		throw Object.assign(new Error("smtpIgnoreTls is not permitted in production"), {
			code: "NOTIFICATIONS_VALIDATION_ERROR" as const,
		});
	}
	const updated = await updateNotificationConfig(db, patch, toConfigDeps(deps));
	return redactNotificationConfig(updated);
}

// ---------------------------------------------------------------------------
// Public: mute preference wrappers
// ---------------------------------------------------------------------------

/** Return the list of currently-muted notification type keys. */
export async function readPreferences(
	db: HyperIdleDb,
	deps: NotificationsDeps,
): Promise<NotificationTypeKey[]> {
	return getMutedTypeKeys(db, toMuteDeps(deps));
}

/** Set mute state for a single notification type key. */
export async function updatePreferences(
	db: HyperIdleDb,
	typeKey: NotificationTypeKey,
	muted: boolean,
	deps: NotificationsDeps,
): Promise<void> {
	const writer = defaultMutePreferenceWriter(db, toMuteDeps(deps));
	await writer.setMuted(typeKey, muted);
}

// ---------------------------------------------------------------------------
// Public: flush (drain-on-demand)
// ---------------------------------------------------------------------------

/**
 * Flush all pending queue rows through their adapters, respecting silence policy.
 * Calls `recoverStuckLeases` internally at the start of every flush.
 *
 * Returns `{ flushed, failed, deferred }` when enabled, or
 * `{ flushed: 0, failed: 0, deferred: 0, disabled: true }` when notifications
 * are disabled.
 *
 * @lore AU20 Ag6b: replaces the `loadNotificationConfig` + `flushQueue` two-step
 * that used to appear in the /flush route and in test code.
 */
export async function flush(
	db: HyperIdleDb,
	deps: NotificationsDeps,
	opts?: {
		/**
		 * Override the adapter. Tests inject a FakeAdapter here; production
		 * omits this and uses defaultNotificationAdapterFactory.
		 */
		adapterOverride?: NotificationAdapter;
		now?: Date;
	},
): Promise<{ flushed: number; failed: number; deferred: number; disabled?: true }> {
	const configDeps = toConfigDeps(deps);
	const cfg = await loadNotificationConfig(db, configDeps);
	if (!cfg) {
		return { flushed: 0, failed: 0, deferred: 0, disabled: true };
	}
	const now = opts?.now ?? new Date();
	const factory = opts?.adapterOverride
		? () => opts.adapterOverride as NotificationAdapter
		: defaultNotificationAdapterFactory;
	return flushQueue(db, factory, cfg, now, toSilenceDeps(deps));
}

// ---------------------------------------------------------------------------
// Public: runDigest (admin dispatch)
// ---------------------------------------------------------------------------

/**
 * Trigger the daily digest dispatch immediately (e.g. from POST /digest).
 *
 * @lore AU20 Ag6b: wraps `dispatchDigest` which was previously exported
 * directly from the dispatcher.
 */
export async function runDigest(
	db: HyperIdleDb,
	deps: NotificationsDeps,
	opts?: {
		adapterOverride?: NotificationAdapter;
		now?: Date;
	},
): Promise<DigestResult> {
	const configDeps = toConfigDeps(deps);
	return dispatchDigest(
		db,
		{
			adapterFactory: opts?.adapterOverride
				? () => opts.adapterOverride as NotificationAdapter
				: defaultNotificationAdapterFactory,
			notificationsConfig: configDeps,
			silencePolicy: toSilenceDeps(deps),
			work: deps.work,
		},
		opts?.now,
	);
}

// ---------------------------------------------------------------------------
// Public: sendTest (admin test-send)
// ---------------------------------------------------------------------------

/**
 * Send a test notification through the configured adapter.
 * Does NOT write to the queue — this is a fire-and-verify path only.
 *
 * @lore AU20 Ag6b: wraps the POST /test route logic so the route no longer
 * needs to import internal `readNotificationConfig`/`pickRecipient`/
 * `AdapterFactory`. The `adapterOverride` seam keeps the route testable
 * without injecting a full factory.
 */
export async function sendTest(
	db: HyperIdleDb,
	channel: NotificationChannel | undefined,
	deps: NotificationsDeps,
	adapterOverride?: NotificationAdapter,
): Promise<{ ok: boolean; channel: NotificationChannel; sentAt?: string; error?: string; retriable?: boolean }> {
	const cfg = await readNotificationConfig(db, toConfigDeps(deps));
	const ch: NotificationChannel = channel ?? cfg.primaryChannel;
	const recipient = pickRecipient(cfg, ch);
	if (!recipient) {
		return {
			ok: false,
			channel: ch,
			error: `recipient not configured for channel '${ch}'`,
			retriable: false,
		};
	}
	const adapter = adapterOverride ?? defaultNotificationAdapterFactory({ ...cfg, primaryChannel: ch });
	try {
		const result = await adapter.send(recipient, {
			title: "HyperIdle notification test",
			body: "This is a test notification from HyperIdle.",
			severity: "digest",
			timestamp: Date.now(),
		});
		// result is SendResult (internal) — spread it to avoid re-exporting the type
		return result.ok
			? { ok: true, channel: result.channel, sentAt: result.sentAt }
			: { ok: false, channel: result.channel, error: result.error, retriable: result.retriable };
	} catch (err) {
		return {
			ok: false,
			channel: ch,
			error: err instanceof Error ? err.message : String(err),
			retriable: true,
		};
	}
}
