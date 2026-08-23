/**
 * @lore AU20 Stage 2: full delivery-chain mega-merge.
 *
 * This module absorbs the 11 files deleted in Stage 2:
 *   config.ts, adapter-factory.ts, console-adapter.ts, ntfy-adapter.ts,
 *   smtp-adapter.ts, redact.ts, mute.ts, notification-listener.ts, drain.ts,
 *   digest.ts, dispatcher.ts.
 *
 * @lore AU44 batch 4: dispatcher, drain, digest, flood cap, alert preferences,
 * ntfy/console adapters, and the adapter abstraction all removed.
 * Only the notification listener (inbox enqueue) and SMTP test-send survive.
 * installNotifications now registers a single event listener. deliver() only
 * handles the "test" kind. Config/prefs CRUD is SMTP-only.
 *
 * Census surface after AU44 (6m / 4t):
 *   6 methods: installNotifications, deliver, readConfig, updateConfig,
 *              readPreferences, updatePreferences
 *   4 types:   DeliverySpec, DeliveryResult, NotificationConfigPatch,
 *              SafeNotificationConfig
 */

import * as crypto from "node:crypto";
import type { HyperIdleDb, NewNotificationQueueRow } from "@hyperidle/db";
import { ERROR_TOKEN_PATTERNS, REDACTED_TAG } from "@hyperidle/diagnostics";
import type {
	NotificationEvent,
	NotificationTypeKey,
	NotificationUrgency,
} from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";
import type { Transporter } from "nodemailer";
import nodemailer from "nodemailer";

import { enqueue } from "./notification-queue.js";
import type { NotificationsDeps } from "./ports.js";

// ---------------------------------------------------------------------------
// Private sub-bag aliases (Pick from the single public NotificationsDeps)
// ---------------------------------------------------------------------------

type ConfigDeps = Pick<NotificationsDeps, "serverConfig" | "credentialCipher" | "credentialStore">;
type MuteDeps = Pick<NotificationsDeps, "serverConfig">;

// ---------------------------------------------------------------------------
// Private types
// ---------------------------------------------------------------------------

const SMTP_PASSWORD_CREDENTIAL_NAME = "notifications_smtp_password";

const REDACTED = "***" as const;

// @lore AU44 batch 4: NotificationConfig is now SMTP-only. primaryChannel,
// digestChannel, ntfy, flood, testMaxPerHour, smtpIgnoreTls, digestCron all
// removed — dispatcher and ntfy adapter are dead code.
interface NotificationConfig {
	readonly enabled: boolean;
	readonly smtp: {
		readonly host: string | null;
		readonly port: number;
		readonly secure: boolean;
		readonly username: string | null;
		readonly password: string | null;
		readonly from: string | null;
	};
}

type NotificationSeverity = "blocking" | "digest";

// ---------------------------------------------------------------------------
// Public exported types (4 types counted by census)
// ---------------------------------------------------------------------------

/**
 * Discriminated spec for `deliver`.
 * @lore AU44 batch 4: flush and digest removed — deliver is test-send only.
 */
export type DeliverySpec = { kind: "test" };

/**
 * Discriminated result from `deliver`.
 * @lore AU44 batch 4: only the test variant remains.
 */
export type DeliveryResult = {
	kind: "test";
	ok: boolean;
	sentAt?: string;
	error?: string;
	retriable?: boolean;
};

/**
 * Partial patch for notification config.
 * @lore AU44 batch 4: ntfy, flood, testMaxPerHour, smtpIgnoreTls, digestCron,
 * primaryChannel, digestChannel, recipientEmail, recipientNtfyTopic, ntfyAuthToken removed.
 */
export interface NotificationConfigPatch {
	enabled?: boolean;
	smtpHost?: string | null;
	smtpPort?: number;
	smtpSecure?: boolean;
	smtpUsername?: string | null;
	smtpPassword?: string | null;
	smtpFrom?: string | null;
}

/**
 * External wire shape: NotificationConfig with SMTP password replaced by REDACTED when set.
 */
export type SafeNotificationConfig = {
	readonly enabled: boolean;
	readonly smtp: {
		readonly host: string | null;
		readonly port: number;
		readonly secure: boolean;
		readonly username: string | null;
		readonly password: typeof REDACTED | null;
		readonly passwordSet: boolean;
		readonly from: string | null;
	};
};

// ---------------------------------------------------------------------------
// Private: credential helpers
// ---------------------------------------------------------------------------

async function readSecret(db: HyperIdleDb, name: string, deps: ConfigDeps): Promise<string | null> {
	const row = await deps.credentialStore.findByName(db, name);
	if (!row) return null;
	return deps.credentialCipher.decryptCredentialValue(row.encryptedValue);
}

/**
 * @lore AU20 Am4: encryptCredentialValue now throws MISSING_ROOT_SECRET when
 * no secret is set; we catch that code and no-op, preserving prior behaviour.
 */
async function writeSecret(
	db: HyperIdleDb,
	name: string,
	value: string | null,
	now: string,
	deps: ConfigDeps,
): Promise<void> {
	if (value === null || value.length === 0) {
		await deps.credentialStore.deleteByName(db, name);
		return;
	}
	let encryptedValue: string;
	try {
		encryptedValue = deps.credentialCipher.encryptCredentialValue(value);
	} catch (error) {
		if (
			typeof error === "object" &&
			error !== null &&
			"code" in error &&
			error.code === "MISSING_ROOT_SECRET"
		) {
			return;
		}
		throw error;
	}
	await deps.credentialStore.upsert(db, {
		name,
		encryptedValue,
		validationState: "present_untested",
		lastValidatedAt: null,
		updatedAt: now,
	});
}

function normalizeEmptyToNull(value: string | null | undefined): string | null | undefined {
	if (value === undefined) return undefined;
	if (value === null || value.length === 0) return null;
	return value;
}

async function readNotificationConfig(
	db: HyperIdleDb,
	deps: ConfigDeps,
): Promise<NotificationConfig> {
	const { notifications } = await deps.serverConfig.read(db);
	const smtpPassword = await readSecret(db, SMTP_PASSWORD_CREDENTIAL_NAME, deps);
	return {
		enabled: notifications.delivery.enabled,
		smtp: {
			host: notifications.delivery.smtpHost,
			port: notifications.delivery.smtpPort,
			secure: notifications.delivery.smtpSecure,
			username: notifications.delivery.smtpUsername,
			password: smtpPassword,
			from: notifications.delivery.smtpFrom,
		},
	};
}

async function updateNotificationConfig(
	db: HyperIdleDb,
	patch: NotificationConfigPatch,
	deps: ConfigDeps,
): Promise<NotificationConfig> {
	const now = new Date().toISOString();
	await deps.serverConfig.update(db, {
		notifications: {
			delivery: {
				...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
				...(patch.smtpHost !== undefined ? { smtpHost: normalizeEmptyToNull(patch.smtpHost) } : {}),
				...(patch.smtpPort !== undefined ? { smtpPort: patch.smtpPort } : {}),
				...(patch.smtpSecure !== undefined ? { smtpSecure: patch.smtpSecure } : {}),
				...(patch.smtpUsername !== undefined
					? { smtpUsername: normalizeEmptyToNull(patch.smtpUsername) }
					: {}),
				...(patch.smtpFrom !== undefined ? { smtpFrom: normalizeEmptyToNull(patch.smtpFrom) } : {}),
			},
		},
	});
	if (patch.smtpPassword !== undefined) {
		await writeSecret(
			db,
			SMTP_PASSWORD_CREDENTIAL_NAME,
			normalizeEmptyToNull(patch.smtpPassword) ?? null,
			now,
			deps,
		);
	}
	return readNotificationConfig(db, deps);
}

function redactNotificationConfig(cfg: NotificationConfig): SafeNotificationConfig {
	return {
		enabled: cfg.enabled,
		smtp: {
			host: cfg.smtp.host,
			port: cfg.smtp.port,
			secure: cfg.smtp.secure,
			username: cfg.smtp.username,
			passwordSet: cfg.smtp.password !== null,
			password: cfg.smtp.password !== null ? REDACTED : null,
			from: cfg.smtp.from,
		},
	};
}

// ---------------------------------------------------------------------------
// Private: config sanitizers (kept for SMTP field validation)
// ---------------------------------------------------------------------------

function sanitizeSmtpHost(input: string): { ok: true } | { ok: false; reason: string } {
	if (typeof input !== "string" || input.length === 0)
		return { ok: false, reason: "smtp host must be a non-empty string" };
	if (input.length > 253) return { ok: false, reason: "smtp host must be <= 253 chars" };
	if (input.startsWith("-")) return { ok: false, reason: "smtp host must not begin with '-'" };
	if (/[\0\r\n\s]/.test(input))
		return { ok: false, reason: "smtp host must not contain whitespace or control chars" };
	if (!/^[A-Za-z0-9.\-:]+$/.test(input))
		return { ok: false, reason: "smtp host must match [A-Za-z0-9.\\-:]+" };
	return { ok: true };
}

function sanitizeSmtpCredential(input: string): { ok: true } | { ok: false; reason: string } {
	if (typeof input !== "string") return { ok: false, reason: "smtp credential must be a string" };
	if (input.length === 0) return { ok: false, reason: "smtp credential must not be empty" };
	if (input.length > 1024) return { ok: false, reason: "smtp credential must be <= 1024 chars" };
	if (/[\0\r\n]/.test(input))
		return { ok: false, reason: "smtp credential must not contain control characters" };
	return { ok: true };
}

function sanitizeEmail(input: string): { ok: true } | { ok: false; reason: string } {
	if (typeof input !== "string" || input.length === 0)
		return { ok: false, reason: "email must be a non-empty string" };
	if (input.length > 254) return { ok: false, reason: "email must be <= 254 chars" };
	if (/[\0\r\n]/.test(input))
		return { ok: false, reason: "email must not contain control characters" };
	if (input.startsWith("-")) return { ok: false, reason: "email must not begin with '-'" };
	if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(input))
		return { ok: false, reason: "email must be a valid address" };
	return { ok: true };
}

type SanitizeFn = (input: string) => { ok: true } | { ok: false; reason: string };

const PATCH_SANITIZERS: ReadonlyArray<{
	field: keyof NotificationConfigPatch;
	sanitize: SanitizeFn;
}> = [
	{ field: "smtpHost", sanitize: sanitizeSmtpHost },
	{ field: "smtpFrom", sanitize: sanitizeEmail },
	{ field: "smtpUsername", sanitize: sanitizeSmtpCredential },
	{ field: "smtpPassword", sanitize: sanitizeSmtpCredential },
];

// ---------------------------------------------------------------------------
// Private: credential scrubbing (for SMTP error messages)
// ---------------------------------------------------------------------------

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface ScrubContext {
	readonly smtpUsername?: string | null;
	readonly smtpPassword?: string | null;
}

function scrubErrorMessage(message: string, ctx: ScrubContext = {}): string {
	let out = message;
	const replacements: Array<string | null | undefined> = [ctx.smtpPassword, ctx.smtpUsername];
	for (const value of replacements) {
		if (typeof value !== "string" || value.length < 1) continue;
		const re = new RegExp(escapeRegExp(value), "g");
		out = out.replace(re, REDACTED_TAG);
	}
	for (const re of ERROR_TOKEN_PATTERNS) {
		out = out.replace(re, REDACTED_TAG);
	}
	out = out.replace(/(user(?:name)?['"=:\s]+)['"]?[^'"]*['"]?/gi, `$1${REDACTED_TAG}`);
	out = out.replace(/(pass(?:word)?['"=:\s]+)['"]?[^'"]*['"]?/gi, `$1${REDACTED_TAG}`);
	return out;
}

// ---------------------------------------------------------------------------
// Private: SMTP helpers (inline send, no adapter abstraction)
// ---------------------------------------------------------------------------

interface SmtpOptions {
	readonly host: string;
	readonly port: number;
	readonly secure: boolean;
	readonly username?: string | null;
	readonly password?: string | null;
	readonly from: string;
	readonly createTransport?: typeof nodemailer.createTransport;
}

function buildTransporter(opts: SmtpOptions): Transporter {
	const factory: typeof nodemailer.createTransport =
		opts.createTransport ?? nodemailer.createTransport;
	const auth =
		opts.username && opts.password ? { user: opts.username, pass: opts.password } : undefined;
	return factory({
		host: opts.host,
		port: opts.port,
		secure: opts.secure,
		auth,
	});
}

interface NodemailerError {
	readonly message?: string;
	readonly code?: string;
	readonly responseCode?: number;
}

function classifySmtpRetriable(err: unknown): boolean {
	const e = err as NodemailerError;
	if (typeof e.responseCode === "number") return e.responseCode >= 400 && e.responseCode < 500;
	const code = e.code;
	if (typeof code === "string") {
		if (code === "ECONNREFUSED") return true;
		if (code === "ETIMEDOUT") return true;
		if (code === "EDNS") return true;
		if (code === "ESOCKET") return true;
		if (code === "ECONNECTION") return true;
		if (code === "EAUTH") return false;
		if (code === "EENVELOPE") return false;
		if (code === "EMESSAGE") return false;
	}
	return true;
}

// ---------------------------------------------------------------------------
// Private: mute helpers
// ---------------------------------------------------------------------------

function toConfigDeps(deps: NotificationsDeps): ConfigDeps {
	return {
		serverConfig: deps.serverConfig,
		credentialCipher: deps.credentialCipher,
		credentialStore: deps.credentialStore,
	};
}

function toMuteDeps(deps: NotificationsDeps): MuteDeps {
	return { serverConfig: deps.serverConfig };
}

async function getMutedTypeKeys(db: HyperIdleDb, deps: MuteDeps): Promise<NotificationTypeKey[]> {
	const { notifications } = await deps.serverConfig.read(db);
	return notifications.mutedTypes as NotificationTypeKey[];
}

async function isTypeMuted(
	db: HyperIdleDb,
	deps: MuteDeps,
	typeKey: NotificationTypeKey,
): Promise<boolean> {
	const { notifications } = await deps.serverConfig.read(db);
	return notifications.mutedTypes.includes(typeKey);
}

async function setMuted(
	db: HyperIdleDb,
	deps: MuteDeps,
	typeKey: NotificationTypeKey,
	muted: boolean,
): Promise<void> {
	const { notifications } = await deps.serverConfig.read(db);
	const current = new Set(notifications.mutedTypes);
	if (muted) current.add(typeKey);
	else current.delete(typeKey);
	await deps.serverConfig.update(db, { notifications: { mutedTypes: [...current] } });
}

// ---------------------------------------------------------------------------
// Private: notification inbox enqueue helper
// ---------------------------------------------------------------------------

function classifyListenerItem(item: {
	blocking: boolean | null;
	riskTier: string | null;
	kind: string | null;
}): { typeKey: NotificationTypeKey; urgency: NotificationUrgency } {
	if (item.blocking) return { typeKey: "blocker_alert", urgency: "immediate" };
	const risk = item.riskTier ?? "low";
	if (risk === "high" || risk === "blocking" || risk === "medium")
		return { typeKey: "review_request", urgency: "immediate" };
	return { typeKey: "review_request", urgency: "ambient" };
}

function buildSourceLink(item: { threadId: string | null }): string {
	if (item.threadId) return `/conversations/${item.threadId}`;
	return "/conversations";
}

// ---------------------------------------------------------------------------
// Private: notification listener (the single remaining event subscriber)
// ---------------------------------------------------------------------------

interface NotificationsWorkReader {
	getItemById(
		db: HyperIdleDb,
		id: string,
	): Promise<
		| {
				blocking: boolean | null;
				riskTier: string | null;
				kind: string | null;
				threadId: string | null;
				title: string;
				body: string | null;
		  }
		| undefined
	>;
}

function registerNotificationListener(
	db: HyperIdleDb,
	bus: EventBus,
	deps: {
		mute: MuteDeps;
		now?: () => Date;
		work: NotificationsWorkReader;
	},
): () => void {
	const nowFn = deps.now ?? ((): Date => new Date());
	let disposed = false;

	const unsub = bus.on("notification", (event: NotificationEvent): void => {
		if (disposed) return;
		if (event.kind === "auto_unblock") return;
		void (async () => {
			if (disposed) return;
			const now = nowFn();
			const targetId = event.targetId;
			const item = await deps.work.getItemById(db, targetId);
			if (!item) return;
			const { typeKey, urgency } = classifyListenerItem(item);
			const sourceLink = buildSourceLink(item);
			if (await isTypeMuted(db, deps.mute, typeKey)) return;
			const severity: NotificationSeverity = urgency === "immediate" ? "blocking" : "digest";
			const row: NewNotificationQueueRow = {
				id: crypto.randomUUID(),
				eventType: event.type,
				subjectId: targetId,
				severity,
				title: item.title.slice(0, 140),
				body: item.body?.slice(0, 10_000) ?? "",
				// @lore AU43: was "silence" (misleading — listener path never silences); now "notification_event".
				reason: "notification_event",
				channel: null,
				status: "pending",
				attempts: 0,
				createdAt: now.toISOString(),
				typeKey,
				urgency,
				sourceLink,
				lastError: null,
			};
			await enqueue(db, row);
		})();
	});

	return (): void => {
		disposed = true;
		unsub();
	};
}

// ---------------------------------------------------------------------------
// Public exported functions (6 methods counted by census)
// ---------------------------------------------------------------------------

/**
 * Install the notification inbox listener.
 *
 * @lore AU44 batch 4: dispatcher, drain, and the adapter abstraction removed.
 * A single `notification` event listener writes to the inbox queue. No background
 * drain timer, no flood cap, no alert preferences gate, no ntfy/console channel.
 *
 * Returns a disposer that unsubscribes the listener.
 */
export function installNotifications(
	db: HyperIdleDb,
	bus: EventBus,
	deps: NotificationsDeps,
	opts?: {
		now?: () => Date;
	},
): () => void {
	return registerNotificationListener(db, bus, {
		mute: toMuteDeps(deps),
		work: deps.work,
		now: opts?.now,
	});
}

/**
 * Fire-and-verify SMTP test send. Does NOT touch the queue.
 *
 * @lore AU44 batch 4: flush and digest removed. Only test-send survives,
 * and it is now always SMTP — no channel parameter, no adapter abstraction.
 */
export async function deliver(
	db: HyperIdleDb,
	_spec: DeliverySpec,
	deps: NotificationsDeps,
	opts?: { now?: Date },
): Promise<DeliveryResult> {
	const configDeps = toConfigDeps(deps);
	const cfg = await readNotificationConfig(db, configDeps);
	if (!(cfg.smtp.host && cfg.smtp.from)) {
		return {
			kind: "test",
			ok: false,
			error: "recipient not configured for channel 'smtp'",
			retriable: false,
		};
	}
	const sentAt = (opts?.now ?? new Date()).toISOString();
	let transporter: Transporter | undefined;
	try {
		transporter = buildTransporter({
			host: cfg.smtp.host,
			port: cfg.smtp.port,
			secure: cfg.smtp.secure,
			username: cfg.smtp.username,
			password: cfg.smtp.password,
			from: cfg.smtp.from,
		});
		await transporter.sendMail({
			from: cfg.smtp.from,
			to: cfg.smtp.from,
			subject: "HyperIdle notification test",
			text: "This is a test notification from HyperIdle.",
		});
		return { kind: "test", ok: true, sentAt };
	} catch (err) {
		const rawMessage = err instanceof Error ? err.message : String(err);
		const scrubbed = scrubErrorMessage(rawMessage, {
			smtpUsername: cfg.smtp.username,
			smtpPassword: cfg.smtp.password,
		});
		return {
			kind: "test",
			ok: false,
			error: scrubbed,
			retriable: classifySmtpRetriable(err),
		};
	} finally {
		try {
			transporter?.close();
		} catch {
			// best-effort teardown
		}
	}
}

/** Read + redact the notification config. Never exposes raw secrets. */
export async function readConfig(
	db: HyperIdleDb,
	deps: NotificationsDeps,
): Promise<SafeNotificationConfig> {
	const cfg = await readNotificationConfig(db, toConfigDeps(deps));
	return redactNotificationConfig(cfg);
}

/**
 * Validate, persist, and return the updated (redacted) config.
 * Throws an Error tagged `code: "NOTIFICATIONS_VALIDATION_ERROR"` when a field
 * fails sanitization — the caller can discriminate and return 400.
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
			throw Object.assign(new Error(r.reason), { code: "NOTIFICATIONS_VALIDATION_ERROR" as const });
		}
	}
	const updated = await updateNotificationConfig(db, patch, toConfigDeps(deps));
	return redactNotificationConfig(updated);
}

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
	await setMuted(db, toMuteDeps(deps), typeKey, muted);
}
