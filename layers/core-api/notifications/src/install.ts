/**
 * @lore AU20 Stage 2: full delivery-chain mega-merge.
 *
 * This module absorbs the 11 files deleted in Stage 2:
 *   config.ts, adapter-factory.ts, console-adapter.ts, ntfy-adapter.ts,
 *   smtp-adapter.ts, redact.ts, mute.ts, notification-listener.ts, drain.ts,
 *   digest.ts, dispatcher.ts.
 *
 * Every internal function and type becomes module-private (no `export`).
 * The census-counted surface is exactly:
 *   6 methods: installNotifications, deliver, readConfig, updateConfig,
 *              readPreferences, updatePreferences
 *   4 types:   DeliverySpec, DeliveryResult, NotificationConfigPatch,
 *              SafeNotificationConfig
 *
 * Callers that previously imported flush/runDigest/sendTest, adapter types,
 * config internals, or the 11 machinery modules use deliver({kind:...}) instead.
 *
 * @lore AU20 Stage 2: all queue I/O flows through the 4 public functions from
 * notification-queue.ts (enqueue, listNotifications, markNotifications, reap).
 * The internal helpers (listPending, claimForSend, etc.) are NO LONGER imported
 * here — they are private to notification-queue.ts. This is intentional: the
 * census target forces moving from "16 exported helpers" to "4 public operations".
 */

import * as crypto from "node:crypto";
import * as dns from "node:dns";
import * as net from "node:net";
import { promisify } from "node:util";
import type { HyperIdleDb, Item, NewNotificationQueueRow } from "@hyperidle/db";
import type { Logger } from "@hyperidle/diagnostics";
import { createLogger, ERROR_TOKEN_PATTERNS, REDACTED_TAG } from "@hyperidle/diagnostics";
import type {
	ItemCreatedEvent,
	NotificationEvent,
	NotificationTypeKey,
	NotificationUrgency,
	RoutineFiredEvent,
} from "@hyperidle/domain-model";
import type { EventBus } from "@hyperidle/event-bus";
import type { Transporter } from "nodemailer";
import nodemailer from "nodemailer";

// @lore AU43 stage 2: inlined from @hyperidle/host-process after SanitizeResult was deleted
// from that package (notifications re-implements SSRF sanitization privately).
type SanitizeResult = { ok: true } | { ok: false; reason: string };

import { enqueue, listNotifications, markNotifications } from "./notification-queue.js";
import type { NotificationsDeps } from "./ports.js";
import type { Notification, NotificationAdapter, NotificationChannel } from "./types.js";

// ---------------------------------------------------------------------------
// Private sub-bag aliases (Pick from the single public NotificationsDeps)
// ---------------------------------------------------------------------------
//
// @lore AU20 Stage 2: sub-bag types (ConfigDeps, MuteDeps,
// SilenceDeps, NotificationsDigestDeps) are deleted from the barrel.
// Internal functions pick the fields they need from NotificationsDeps via Pick<>.
// No callers need to name these intermediate bags — NotificationsDeps is the
// single public deps surface.

type ConfigDeps = Pick<NotificationsDeps, "serverConfig" | "credentialCipher" | "credentialStore">;
type MuteDeps = Pick<NotificationsDeps, "serverConfig">;

// ---------------------------------------------------------------------------
// Private types (not exported — deleted from the public surface in AU20 Stage 2)
// ---------------------------------------------------------------------------

type NotificationSeverity = "blocking" | "digest";
interface Recipient {
	readonly channelId: string;
	readonly label?: string;
}
type SendResult =
	| { readonly ok: true; readonly channel: NotificationChannel; readonly sentAt: string }
	| {
			readonly ok: false;
			readonly channel: NotificationChannel;
			readonly error: string;
			readonly retriable: boolean;
	  };
type Classification =
	| { readonly kind: "push"; readonly severity: NotificationSeverity }
	| { readonly kind: "digest"; readonly severity: "digest" }
	| { readonly kind: "drop"; readonly reason: string };
// @lore AU43: "silence" removed (isSilenced deleted); "notification_event" added for listener path.
type QueueReason =
	| "notification_event"
	| "digest"
	| "flood_coalesce"
	| "retry"
	| "agent_health_transition";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NOTIFICATION_DRAIN_INTERVAL_MS = 60_000; // 1 minute
const LEASE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes — rollback stuck "sending" rows

const SMTP_PASSWORD_CREDENTIAL_NAME = "notifications_smtp_password";
const NTFY_AUTH_TOKEN_CREDENTIAL_NAME = "notifications_ntfy_auth_token";

const REDACTED = "***" as const;

// ---------------------------------------------------------------------------
// Private: NotificationConfig shape (config.ts)
// ---------------------------------------------------------------------------

interface NotificationConfig {
	readonly enabled: boolean;
	readonly primaryChannel: NotificationChannel;
	readonly digestChannel: NotificationChannel;
	readonly recipient: {
		readonly email: string | null;
		readonly ntfyTopic: string | null;
	};
	readonly ntfy: {
		readonly baseUrl: string;
		readonly authToken: string | null;
	};
	readonly smtp: {
		readonly host: string | null;
		readonly port: number;
		readonly secure: boolean;
		readonly username: string | null;
		readonly password: string | null;
		readonly from: string | null;
	};
	readonly flood: {
		readonly maxPerMinute: number;
		readonly coalesceWindowMs: number;
	};
	readonly testMaxPerHour: number;
	readonly smtpIgnoreTls: boolean;
	readonly digestCron: string;
}

// ---------------------------------------------------------------------------
// Public exported types (4 types counted by census)
// ---------------------------------------------------------------------------

/**
 * Discriminated spec for `deliver`. Each variant maps to one delivery operation:
 *   - `flush`: drain the pending queue through configured adapters
 *   - `digest`: send a batched daily digest
 *   - `test`: fire-and-verify test send (does not touch the queue)
 */
export type DeliverySpec =
	| { kind: "flush" }
	| { kind: "digest" }
	| { kind: "test"; channel?: NotificationChannel };

/**
 * Discriminated result from `deliver`. Narrow by `result.kind` before
 * accessing variant-specific fields.
 */
export type DeliveryResult =
	| { kind: "flush"; flushed: number; failed: number; deferred: number; disabled?: true }
	| {
			kind: "digest";
			status: "sent" | "noop" | "error";
			notificationsIncluded: number;
			error?: string;
	  }
	| {
			kind: "test";
			ok: boolean;
			channel: NotificationChannel;
			sentAt?: string;
			error?: string;
			retriable?: boolean;
	  };

/** Partial patch for notification config. Secrets (ntfyAuthToken, smtpPassword) written to credentials store. */
export interface NotificationConfigPatch {
	enabled?: boolean;
	primaryChannel?: NotificationChannel;
	digestChannel?: NotificationChannel;
	recipientEmail?: string | null;
	recipientNtfyTopic?: string | null;
	ntfyBaseUrl?: string;
	ntfyAuthToken?: string | null;
	smtpHost?: string | null;
	smtpPort?: number;
	smtpSecure?: boolean;
	smtpUsername?: string | null;
	smtpPassword?: string | null;
	smtpFrom?: string | null;
	floodMaxPerMinute?: number;
	floodCoalesceWindowMs?: number;
	testMaxPerHour?: number;
	smtpIgnoreTls?: boolean;
	digestCron?: string;
}

/**
 * External wire shape: NotificationConfig with sensitive strings replaced by
 * REDACTED when set, or null when unset.
 */
export type SafeNotificationConfig = Omit<NotificationConfig, "ntfy" | "smtp"> & {
	readonly ntfy: Omit<NotificationConfig["ntfy"], "authToken"> & {
		readonly authToken: typeof REDACTED | null;
		readonly authTokenSet: boolean;
	};
	readonly smtp: Omit<NotificationConfig["smtp"], "password"> & {
		readonly password: typeof REDACTED | null;
		readonly passwordSet: boolean;
	};
};

// ---------------------------------------------------------------------------
// Private: config helpers (config.ts content)
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

function buildConfig(
	delivery: {
		enabled: boolean;
		primaryChannel: NotificationChannel;
		digestChannel: NotificationChannel | null;
		recipientEmail: string | null;
		recipientNtfyTopic: string | null;
		ntfyBaseUrl: string;
		smtpHost: string | null;
		smtpPort: number;
		smtpSecure: boolean;
		smtpUsername: string | null;
		smtpFrom: string | null;
		floodMaxPerMinute: number;
		floodCoalesceWindowMs: number;
		testMaxPerHour: number;
		smtpIgnoreTls: boolean;
		digestCron: string;
	},
	ntfyAuthToken: string | null,
	smtpPassword: string | null,
): NotificationConfig {
	// @lore AU18: preserves the KV-era fallback semantics — an unset
	// digestChannel dynamically follows whatever primaryChannel currently is.
	const digestChannel = delivery.digestChannel ?? delivery.primaryChannel;
	return {
		enabled: delivery.enabled,
		primaryChannel: delivery.primaryChannel,
		digestChannel,
		recipient: {
			email: delivery.recipientEmail,
			ntfyTopic: delivery.recipientNtfyTopic,
		},
		ntfy: { baseUrl: delivery.ntfyBaseUrl, authToken: ntfyAuthToken },
		smtp: {
			host: delivery.smtpHost,
			port: delivery.smtpPort,
			secure: delivery.smtpSecure,
			username: delivery.smtpUsername,
			password: smtpPassword,
			from: delivery.smtpFrom,
		},
		flood: {
			maxPerMinute: delivery.floodMaxPerMinute,
			coalesceWindowMs: delivery.floodCoalesceWindowMs,
		},
		testMaxPerHour: delivery.testMaxPerHour,
		smtpIgnoreTls: delivery.smtpIgnoreTls,
		digestCron: delivery.digestCron,
	};
}

async function readNotificationConfig(
	db: HyperIdleDb,
	deps: ConfigDeps,
): Promise<NotificationConfig> {
	const { notifications } = await deps.serverConfig.read(db);
	const [ntfyAuthToken, smtpPassword] = await Promise.all([
		readSecret(db, NTFY_AUTH_TOKEN_CREDENTIAL_NAME, deps),
		readSecret(db, SMTP_PASSWORD_CREDENTIAL_NAME, deps),
	]);
	return buildConfig(notifications.delivery, ntfyAuthToken, smtpPassword);
}

function loadNotificationConfig(
	db: HyperIdleDb,
	deps: ConfigDeps,
): Promise<NotificationConfig | null> {
	return readNotificationConfig(db, deps).then((cfg) => (cfg.enabled ? cfg : null));
}

function redactNotificationConfig(cfg: NotificationConfig): SafeNotificationConfig {
	return {
		enabled: cfg.enabled,
		primaryChannel: cfg.primaryChannel,
		digestChannel: cfg.digestChannel,
		recipient: cfg.recipient,
		ntfy: {
			baseUrl: cfg.ntfy.baseUrl,
			authTokenSet: cfg.ntfy.authToken !== null,
			authToken: cfg.ntfy.authToken !== null ? REDACTED : null,
		},
		smtp: {
			host: cfg.smtp.host,
			port: cfg.smtp.port,
			secure: cfg.smtp.secure,
			username: cfg.smtp.username,
			passwordSet: cfg.smtp.password !== null,
			password: cfg.smtp.password !== null ? REDACTED : null,
			from: cfg.smtp.from,
		},
		flood: cfg.flood,
		testMaxPerHour: cfg.testMaxPerHour,
		smtpIgnoreTls: cfg.smtpIgnoreTls,
		digestCron: cfg.digestCron,
	};
}

function pickRecipient(
	cfg: NotificationConfig,
	channel: NotificationChannel,
	kind: "push" | "digest" = "push",
): Recipient | null {
	const suffix = kind === "digest" ? " (digest)" : "";
	switch (channel) {
		case "console":
			return { channelId: "console", label: `Console${suffix}` };
		case "ntfy":
			if (!cfg.recipient.ntfyTopic) return null;
			return { channelId: cfg.recipient.ntfyTopic, label: `ntfy topic${suffix}` };
		case "smtp":
			if (!cfg.recipient.email) return null;
			return { channelId: cfg.recipient.email, label: cfg.recipient.email };
	}
}

function normalizeEmptyToNull(value: string | null | undefined): string | null | undefined {
	if (value === undefined) return undefined;
	if (value === null || value.length === 0) return null;
	return value;
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
				...(patch.primaryChannel !== undefined ? { primaryChannel: patch.primaryChannel } : {}),
				...(patch.digestChannel !== undefined ? { digestChannel: patch.digestChannel } : {}),
				...(patch.recipientEmail !== undefined
					? { recipientEmail: normalizeEmptyToNull(patch.recipientEmail) }
					: {}),
				...(patch.recipientNtfyTopic !== undefined
					? { recipientNtfyTopic: normalizeEmptyToNull(patch.recipientNtfyTopic) }
					: {}),
				...(patch.ntfyBaseUrl !== undefined ? { ntfyBaseUrl: patch.ntfyBaseUrl } : {}),
				...(patch.smtpHost !== undefined ? { smtpHost: normalizeEmptyToNull(patch.smtpHost) } : {}),
				...(patch.smtpPort !== undefined ? { smtpPort: patch.smtpPort } : {}),
				...(patch.smtpSecure !== undefined ? { smtpSecure: patch.smtpSecure } : {}),
				...(patch.smtpUsername !== undefined
					? { smtpUsername: normalizeEmptyToNull(patch.smtpUsername) }
					: {}),
				...(patch.smtpFrom !== undefined ? { smtpFrom: normalizeEmptyToNull(patch.smtpFrom) } : {}),
				...(patch.floodMaxPerMinute !== undefined
					? { floodMaxPerMinute: patch.floodMaxPerMinute }
					: {}),
				...(patch.floodCoalesceWindowMs !== undefined
					? { floodCoalesceWindowMs: patch.floodCoalesceWindowMs }
					: {}),
				...(patch.testMaxPerHour !== undefined ? { testMaxPerHour: patch.testMaxPerHour } : {}),
				...(patch.smtpIgnoreTls !== undefined ? { smtpIgnoreTls: patch.smtpIgnoreTls } : {}),
				...(patch.digestCron !== undefined ? { digestCron: patch.digestCron } : {}),
			},
		},
	});
	if (patch.ntfyAuthToken !== undefined) {
		await writeSecret(
			db,
			NTFY_AUTH_TOKEN_CREDENTIAL_NAME,
			normalizeEmptyToNull(patch.ntfyAuthToken) ?? null,
			now,
			deps,
		);
	}
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

// ---------------------------------------------------------------------------
// Private: sanitizers (config.ts)
// ---------------------------------------------------------------------------

function sanitizeEmail(input: string): SanitizeResult {
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

function sanitizeTopic(input: string): SanitizeResult {
	if (typeof input !== "string" || input.length === 0)
		return { ok: false, reason: "topic must be a non-empty string" };
	if (input.length > 64) return { ok: false, reason: "topic must be <= 64 chars" };
	if (input.startsWith("-")) return { ok: false, reason: "topic must not begin with '-'" };
	if (!/^[A-Za-z0-9_-]+$/.test(input))
		return { ok: false, reason: "topic must match [A-Za-z0-9_-]+" };
	return { ok: true };
}

const PRIVATE_HOSTS: ReadonlySet<string> = new Set(["localhost", "localhost.", "broadcasthost"]);

function isPrivateIPv4(ip: string): boolean {
	const parts = ip.split(".");
	if (parts.length !== 4) return false;
	const nums = parts.map(Number);
	if (nums.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return false;
	const a = nums[0];
	const b = nums[1];
	if (a === undefined || b === undefined) return false;
	if (a === 10) return true;
	if (a === 127) return true;
	if (a === 0) return true;
	if (a === 169 && b === 254) return true;
	if (a === 172 && b >= 16 && b <= 31) return true;
	if (a === 192 && b === 168) return true;
	if (a === 100 && b >= 64 && b <= 127) return true;
	if (a >= 224) return true;
	return false;
}

function isPrivateIPv6(ip: string): boolean {
	const lower = ip.toLowerCase().replace(/^\[|\]$/g, "");
	if (lower === "::1") return true;
	if (lower === "::") return true;
	if (/^fe[89ab][0-9a-f]?:/i.test(lower)) return true;
	if (/^f[cd][0-9a-f]{0,2}:/i.test(lower)) return true;
	const embedded = lower.match(/::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/);
	if (embedded) {
		const ipv4Part = embedded[1];
		if (ipv4Part !== undefined) return isPrivateIPv4(ipv4Part);
	}
	return false;
}

function isPrivateHostLiteral(hostname: string): boolean {
	const clean = hostname.replace(/^\[|\]$/g, "").toLowerCase();
	if (PRIVATE_HOSTS.has(clean)) return true;
	if (clean.endsWith(".local")) return true;
	if (clean === "metadata" || clean === "metadata.google.internal") return true;
	if (net.isIP(clean) === 4) return isPrivateIPv4(clean);
	if (net.isIP(clean) === 6) return isPrivateIPv6(clean);
	return false;
}

function sanitizeNtfyUrl(input: string): SanitizeResult {
	if (typeof input !== "string" || input.length === 0)
		return { ok: false, reason: "ntfy url must be a non-empty string" };
	if (/[\0\r\n]/.test(input))
		return { ok: false, reason: "ntfy url must not contain control characters" };
	let url: URL;
	try {
		url = new URL(input);
	} catch {
		return { ok: false, reason: "ntfy url is not a valid URL" };
	}
	if (url.username.length > 0 || url.password.length > 0)
		return { ok: false, reason: "ntfy url must not contain userinfo" };
	const host = url.hostname.toLowerCase();
	const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
	if (url.protocol === "https:") {
		if (isPrivateHostLiteral(host) && !loopbackHosts.has(host))
			return { ok: false, reason: "ntfy url resolves to a private / link-local host" };
		return { ok: true };
	}
	if (url.protocol === "http:") {
		if (loopbackHosts.has(host)) return { ok: true };
		return { ok: false, reason: "http:// is only permitted for loopback hosts" };
	}
	return { ok: false, reason: "ntfy url must be http:// or https://" };
}

const dnsLookup = promisify(dns.lookup);

async function assertNtfyUrlNotSSRF(baseUrl: string): Promise<SanitizeResult> {
	const syncCheck = sanitizeNtfyUrl(baseUrl);
	if (!syncCheck.ok) return syncCheck;
	let url: URL;
	try {
		url = new URL(baseUrl);
	} catch {
		return { ok: false, reason: "ntfy url is not a valid URL" };
	}
	const host = url.hostname.replace(/^\[|\]$/g, "");
	if (net.isIP(host)) return { ok: true };
	try {
		const resolved = await dnsLookup(host, { all: true });
		for (const record of resolved) {
			const address = record.address;
			if (net.isIP(address) === 4 && isPrivateIPv4(address))
				return { ok: false, reason: `ntfy host resolves to private IPv4 ${address}` };
			if (net.isIP(address) === 6 && isPrivateIPv6(address))
				return { ok: false, reason: `ntfy host resolves to private IPv6 ${address}` };
		}
	} catch {
		return { ok: false, reason: "ntfy host could not be resolved" };
	}
	return { ok: true };
}

function sanitizeSmtpCredential(input: string): SanitizeResult {
	if (typeof input !== "string") return { ok: false, reason: "smtp credential must be a string" };
	if (input.length === 0) return { ok: false, reason: "smtp credential must not be empty" };
	if (input.length > 1024) return { ok: false, reason: "smtp credential must be <= 1024 chars" };
	if (/[\0\r\n]/.test(input))
		return { ok: false, reason: "smtp credential must not contain control characters" };
	return { ok: true };
}

function sanitizeCron(input: string): SanitizeResult {
	if (typeof input !== "string" || input.length === 0)
		return { ok: false, reason: "cron expression must be a non-empty string" };
	if (input.length > 128) return { ok: false, reason: "cron expression must be <= 128 chars" };
	if (/[\0\r\n]/.test(input))
		return { ok: false, reason: "cron expression must not contain control characters" };
	const fields = input.trim().split(/\s+/);
	if (fields.length !== 5)
		return { ok: false, reason: "cron expression must have exactly 5 fields" };
	return { ok: true };
}

function sanitizeSmtpHost(input: string): SanitizeResult {
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

// ---------------------------------------------------------------------------
// Private: scrub (redact.ts content)
// ---------------------------------------------------------------------------

interface ScrubContext {
	readonly smtpUsername?: string | null;
	readonly smtpPassword?: string | null;
	readonly ntfyAuthToken?: string | null;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function scrubErrorMessage(message: string, ctx: ScrubContext = {}): string {
	let out = message;
	const replacements: Array<string | null | undefined> = [
		ctx.smtpPassword,
		ctx.ntfyAuthToken,
		ctx.smtpUsername,
	];
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
// Private: adapters (console-adapter.ts, ntfy-adapter.ts, smtp-adapter.ts, adapter-factory.ts)
// ---------------------------------------------------------------------------

interface ConsoleAdapterOptions {
	logger?: Logger;
	now?: () => Date;
}

function createConsoleAdapter(opts: ConsoleAdapterOptions = {}): NotificationAdapter {
	const logger = opts.logger ?? createLogger({ pkg: "notifications.console" });
	const now = opts.now ?? ((): Date => new Date());
	return {
		name: "console",
		send(recipient: Recipient, notification: Notification): Promise<SendResult> {
			const sentAt = now().toISOString();
			logger.info(notification.title, {
				severity: notification.severity,
				recipient: recipient.label ?? recipient.channelId,
				bodyLength: notification.body.length,
				deepLink: notification.deepLink,
				tags: notification.tags,
			});
			return Promise.resolve({ ok: true, channel: "console", sentAt });
		},
	};
}

interface NtfyAdapterOptions {
	readonly baseUrl: string;
	readonly authToken?: string | null;
	readonly fetch?: typeof globalThis.fetch;
	readonly now?: () => Date;
}

function priorityForSeverity(severity: NotificationSeverity): "urgent" | "high" | "default" {
	switch (severity) {
		case "blocking":
			return "urgent";
		case "digest":
			return "default";
	}
}

function createNtfyAdapter(opts: NtfyAdapterOptions): NotificationAdapter {
	const urlCheck = sanitizeNtfyUrl(opts.baseUrl);
	if (!urlCheck.ok) throw new Error(`ntfy-adapter: ${urlCheck.reason}`);
	const fetchFn = opts.fetch ?? globalThis.fetch.bind(globalThis);
	const now = opts.now ?? ((): Date => new Date());
	const base = opts.baseUrl.replace(/\/+$/, "");

	return {
		name: "ntfy",
		async send(recipient: Recipient, notification: Notification): Promise<SendResult> {
			const topicCheck = sanitizeTopic(recipient.channelId);
			if (!topicCheck.ok)
				return {
					ok: false,
					channel: "ntfy",
					error: `invalid topic: ${topicCheck.reason}`,
					retriable: false,
				};
			const ssrfCheck = await assertNtfyUrlNotSSRF(opts.baseUrl);
			if (!ssrfCheck.ok)
				return {
					ok: false,
					channel: "ntfy",
					error: `ntfy base url blocked: ${ssrfCheck.reason}`,
					retriable: false,
				};

			const headers: Record<string, string> = {
				"Content-Type": "text/plain; charset=utf-8",
				// biome-ignore lint/style/useNamingConvention: ntfy HTTP header
				Title: notification.title,
				// biome-ignore lint/style/useNamingConvention: ntfy HTTP header
				Priority: priorityForSeverity(notification.severity),
			};
			if (notification.tags && notification.tags.length > 0)
				headers.Tags = notification.tags.join(",");
			if (opts.authToken && opts.authToken.length > 0)
				headers.Authorization = `Bearer ${opts.authToken}`;

			const url = `${base}/${encodeURIComponent(recipient.channelId)}`;
			let res: Response;
			try {
				res = await fetchFn(url, { method: "POST", headers, body: notification.body });
			} catch (err) {
				const raw = err instanceof Error ? err.message : String(err);
				return {
					ok: false,
					channel: "ntfy",
					error: scrubErrorMessage(raw, { ntfyAuthToken: opts.authToken }),
					retriable: true,
				};
			}
			if (res.status >= 200 && res.status < 300)
				return { ok: true, channel: "ntfy", sentAt: now().toISOString() };
			const text = await res.text().catch(() => "");
			const scrubbedText = scrubErrorMessage(text.slice(0, 200), { ntfyAuthToken: opts.authToken });
			return {
				ok: false,
				channel: "ntfy",
				error: `ntfy returned ${res.status}: ${scrubbedText}`,
				retriable: res.status >= 500,
			};
		},
	};
}

interface SmtpAdapterOptions {
	readonly host: string;
	readonly port: number;
	readonly secure: boolean;
	readonly username?: string | null;
	readonly password?: string | null;
	readonly from: string;
	readonly createTransport?: typeof nodemailer.createTransport;
	readonly now?: () => Date;
	readonly ignoreTls?: boolean;
}

function buildTransporter(opts: SmtpAdapterOptions): Transporter {
	if (opts.ignoreTls === true && process.env.NODE_ENV === "production")
		throw new Error("smtp-adapter: ignoreTls is not permitted in production");
	const factory: typeof nodemailer.createTransport =
		opts.createTransport ?? nodemailer.createTransport;
	const auth =
		opts.username && opts.password ? { user: opts.username, pass: opts.password } : undefined;
	return factory({
		host: opts.host,
		port: opts.port,
		secure: opts.secure,
		auth,
		ignoreTLS: opts.ignoreTls === true,
		tls: opts.ignoreTls === true ? { rejectUnauthorized: false } : undefined,
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

function createSmtpAdapter(opts: SmtpAdapterOptions): NotificationAdapter {
	const now = opts.now ?? ((): Date => new Date());
	const transporter = buildTransporter(opts);
	return {
		name: "smtp",
		async send(recipient: Recipient, notification: Notification): Promise<SendResult> {
			const to = recipient.channelId;
			const safeSubject = notification.title.replace(/[\r\n]+/g, " ");
			try {
				await transporter.sendMail({
					from: opts.from,
					to,
					subject: safeSubject,
					text: notification.body,
				});
				return { ok: true, channel: "smtp", sentAt: now().toISOString() };
			} catch (err) {
				const rawMessage = err instanceof Error ? err.message : String(err);
				const scrubbed = scrubErrorMessage(rawMessage, {
					smtpUsername: opts.username,
					smtpPassword: opts.password,
				});
				return {
					ok: false,
					channel: "smtp",
					error: scrubbed,
					retriable: classifySmtpRetriable(err),
				};
			}
		},
		close(): void {
			try {
				transporter.close();
			} catch {
				// Best-effort teardown.
			}
		},
	};
}

type AdapterFactory = (cfg: NotificationConfig) => NotificationAdapter;

function defaultNotificationAdapterFactory(cfg: NotificationConfig): NotificationAdapter {
	switch (cfg.primaryChannel) {
		case "ntfy":
			return createNtfyAdapter({ baseUrl: cfg.ntfy.baseUrl, authToken: cfg.ntfy.authToken });
		case "smtp":
			if (!(cfg.smtp.host && cfg.smtp.from)) return createConsoleAdapter();
			return createSmtpAdapter({
				host: cfg.smtp.host,
				port: cfg.smtp.port,
				secure: cfg.smtp.secure,
				username: cfg.smtp.username,
				password: cfg.smtp.password,
				from: cfg.smtp.from,
				ignoreTls: cfg.smtpIgnoreTls,
			});
		default:
			return createConsoleAdapter();
	}
}

// ---------------------------------------------------------------------------
// Private: mute (mute.ts content)
// ---------------------------------------------------------------------------

interface MutePreferenceReader {
	isTypeMuted(typeKey: NotificationTypeKey): Promise<boolean>;
}

interface MutePreferenceWriter {
	setMuted(typeKey: NotificationTypeKey, muted: boolean): Promise<void>;
}

function defaultMutePreferenceReader(db: HyperIdleDb, deps: MuteDeps): MutePreferenceReader {
	return {
		async isTypeMuted(typeKey: NotificationTypeKey): Promise<boolean> {
			const { notifications } = await deps.serverConfig.read(db);
			return notifications.mutedTypes.includes(typeKey);
		},
	};
}

function defaultMutePreferenceWriter(db: HyperIdleDb, deps: MuteDeps): MutePreferenceWriter {
	return {
		async setMuted(typeKey: NotificationTypeKey, muted: boolean): Promise<void> {
			const { notifications } = await deps.serverConfig.read(db);
			const current = new Set(notifications.mutedTypes);
			if (muted) current.add(typeKey);
			else current.delete(typeKey);
			await deps.serverConfig.update(db, { notifications: { mutedTypes: [...current] } });
		},
	};
}

async function getMutedTypeKeys(db: HyperIdleDb, deps: MuteDeps): Promise<NotificationTypeKey[]> {
	const { notifications } = await deps.serverConfig.read(db);
	return notifications.mutedTypes as NotificationTypeKey[];
}

// ---------------------------------------------------------------------------
// Private: queue helpers (replaces direct helper imports from notification-queue.ts)
// ---------------------------------------------------------------------------
//
// @lore AU20 Stage 2: all queue I/O routes through the 4 public functions
// (enqueue, listNotifications, markNotifications, reap). The former 16 internal
// helpers are private to notification-queue.ts. These local wrappers implement
// the same logic using only the public API.

async function recoverStuckLeases(db: HyperIdleDb, now: Date): Promise<number> {
	const cutoff = new Date(now.getTime() - LEASE_TIMEOUT_MS).toISOString();
	const stuck = await listNotifications(db, { kind: "stuck", stuckBefore: cutoff });
	for (const row of stuck) {
		await markNotifications(
			db,
			{ kind: "ids", ids: [row.id] },
			{ status: "pending", claimedAt: null },
			now,
		);
	}
	return stuck.length;
}

async function claimRow(db: HyperIdleDb, rowId: string, now: Date): Promise<boolean> {
	const count = await markNotifications(
		db,
		{ kind: "ids", ids: [rowId], onlyIfStatus: "pending" },
		{ status: "sending", claimedAt: now.toISOString() },
		now,
	);
	return count > 0;
}

/** Dispatcher-internal enqueue — wraps the public `enqueue` to add an id + timestamp. */
async function enqueueNotification(
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
		typeKey?: string | null;
		urgency?: string | null;
		sourceLink?: string | null;
		status?: string;
		lastError?: string | null;
	},
): Promise<void> {
	const row = {
		id: crypto.randomUUID(),
		eventType: params.eventType,
		subjectId: params.subjectId,
		severity: params.severity,
		title: params.title,
		body: params.body,
		reason: params.reason,
		channel: params.channel,
		status: params.status ?? "pending",
		attempts: 0,
		createdAt: params.now.toISOString(),
		typeKey: params.typeKey ?? null,
		urgency: params.urgency ?? null,
		sourceLink: params.sourceLink ?? null,
		lastError: params.lastError ?? null,
	} satisfies NewNotificationQueueRow;
	await enqueue(db, row);
}

// ---------------------------------------------------------------------------
// Private: dispatcher types (dispatcher.ts content)
// ---------------------------------------------------------------------------

/**
 * @lore R8: Alert preferences read from server_config. All default true so
 * the system is fail-open: if the config is missing or unparseable, all
 * alerts are delivered.
 */
// @lore AU43: quietHoursEnabled/Start/End removed — isInSilenceWindow had no
// writer for its config (constant-false in every real install).
interface AlertPreferences {
	readonly blockerAlerts: boolean;
	readonly reviewAlerts: boolean;
}

const ALERT_PREFS_DEFAULTS: AlertPreferences = {
	blockerAlerts: true,
	reviewAlerts: true,
};

interface NotificationsWorkReader {
	getItemById(db: HyperIdleDb, id: string): Promise<Item | undefined>;
}

interface DispatcherDeps {
	adapterFactory: AdapterFactory;
	now?: () => Date;
	logger?: Logger;
	readAlertPreferences?: () => Promise<AlertPreferences>;
	notificationsConfig: ConfigDeps;
	work: NotificationsWorkReader;
}

interface FloodState {
	windowStart: number;
	count: number;
}

interface DispatcherState {
	disposed: boolean;
	flood: FloodState;
	adapterCache: { cfgKey: string; adapter: NotificationAdapter } | null;
}

// ---------------------------------------------------------------------------
// Private: dispatcher logic
// ---------------------------------------------------------------------------

function applyAlertPreferences(
	classification: Classification,
	prefs: AlertPreferences,
	meta: { itemKind?: string },
): boolean {
	if (!prefs.reviewAlerts && meta.itemKind === "review") return true;
	if (
		!prefs.blockerAlerts &&
		classification.kind === "push" &&
		classification.severity === "blocking"
	)
		return true;
	return false;
}

function tryFloodReserve(state: FloodState, max: number, windowMs: number, now: number): boolean {
	if (now - state.windowStart >= windowMs) {
		state.windowStart = now;
		state.count = 0;
	}
	if (state.count >= max) return false;
	state.count += 1;
	return true;
}

function cfgAdapterKey(cfg: NotificationConfig): string {
	return JSON.stringify({
		channel: cfg.primaryChannel,
		ntfy: { base: cfg.ntfy.baseUrl, tokenSet: cfg.ntfy.authToken ?? null },
		smtp: {
			host: cfg.smtp.host,
			port: cfg.smtp.port,
			secure: cfg.smtp.secure,
			username: cfg.smtp.username,
			passwordHash: cfg.smtp.password
				? crypto.createHash("sha256").update(cfg.smtp.password).digest("hex").slice(0, 16)
				: null,
			from: cfg.smtp.from,
			ignoreTls: cfg.smtpIgnoreTls,
		},
	});
}

function getCachedAdapter(
	state: DispatcherState,
	factory: AdapterFactory,
	cfg: NotificationConfig,
): NotificationAdapter {
	const key = cfgAdapterKey(cfg);
	if (state.adapterCache && state.adapterCache.cfgKey === key) return state.adapterCache.adapter;
	if (state.adapterCache?.adapter?.close) {
		try {
			state.adapterCache.adapter.close();
		} catch {
			/* ignore */
		}
	}
	const adapter = factory(cfg);
	state.adapterCache = { cfgKey: key, adapter };
	return adapter;
}

async function readPrefs(
	readAlertPreferences: (() => Promise<AlertPreferences>) | undefined,
): Promise<AlertPreferences> {
	if (!readAlertPreferences) return ALERT_PREFS_DEFAULTS;
	try {
		return await readAlertPreferences();
	} catch {
		return ALERT_PREFS_DEFAULTS;
	}
}

function classifyItem(item: Pick<Item, "blocking" | "riskTier">): Classification {
	if (item.blocking) return { kind: "push", severity: "blocking" };
	if (item.riskTier === "high") return { kind: "push", severity: "blocking" };
	if (item.riskTier === "medium") return { kind: "digest", severity: "digest" };
	return { kind: "drop", reason: "low-risk non-blocking item" };
}

function buildItemNotification(
	item: Item,
	severity: NotificationSeverity,
	now: Date,
): Notification {
	return {
		title: item.title.slice(0, 140),
		body: (item.body ?? "No body provided.").slice(0, 10_000),
		severity,
		deepLink: `/conversations/item/${item.id}`,
		tags: severity === "blocking" ? ["blocking"] : undefined,
		timestamp: now.getTime(),
	};
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

async function flushQueue(
	db: HyperIdleDb,
	factory: AdapterFactory,
	cfg: NotificationConfig,
	now: Date,
): Promise<{ flushed: number; failed: number; deferred: number }> {
	await recoverStuckLeases(db, now);
	const rows = await listNotifications(db, { kind: "pending" });
	let flushed = 0;
	let failed = 0;
	// @lore AU43: deferred is always 0 — silence was the only deferral path.
	const deferred = 0;

	for (const row of rows) {
		const severity = row.severity as NotificationSeverity;
		// digest: always flush.
		if (!(await claimRow(db, row.id, now))) continue;
		const { adapter, channel } = adapterForRow(factory, cfg, row.channel, severity);
		const recipient = pickRecipient(cfg, channel, severity === "digest" ? "digest" : "push");
		if (!recipient) {
			await markNotifications(
				db,
				{ kind: "ids", ids: [row.id] },
				{
					status: "failed",
					lastError: `no recipient configured for channel '${channel}'`,
					attempts: row.attempts + 1,
					claimedAt: null,
				},
				now,
			);
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
			await markNotifications(
				db,
				{ kind: "ids", ids: [row.id] },
				{ status: "sent", sentAt: now.toISOString(), attempts: row.attempts + 1, claimedAt: null },
				now,
			);
			flushed += 1;
		} else {
			await markNotifications(
				db,
				{ kind: "ids", ids: [row.id] },
				{
					status: "failed",
					lastError: scrubErrorMessage(result.error, {
						smtpUsername: cfg.smtp.username,
						smtpPassword: cfg.smtp.password,
						ntfyAuthToken: cfg.ntfy.authToken,
					}),
					attempts: row.attempts + 1,
					claimedAt: null,
				},
				now,
			);
			failed += 1;
		}
	}
	return { flushed, failed, deferred };
}

function registerNotificationDispatcher(
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
			logger.warn("dispatcher: recipient not configured; persisting as failed", {
				channel,
				eventType,
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
				status: "failed",
				lastError: `no recipient configured for channel '${channel}'`,
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
		prefMeta: { itemKind?: string },
	): Promise<void> {
		if (state.disposed) return;
		const cfg = await loadNotificationConfig(db, deps.notificationsConfig);
		if (!cfg) return;
		if (classification.kind === "drop") return;
		if (notification === null) return;

		const prefs = await readPrefs(deps.readAlertPreferences);
		if (applyAlertPreferences(classification, prefs, prefMeta)) return;

		const now = nowFn();

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
			await route(classification, notification, "item_created", event.itemId, {
				itemKind: item.kind ?? undefined,
			});
		})();
	});

	const unsubRoutine = bus.on("routine_fired", (event: RoutineFiredEvent): void => {
		if (state.disposed) return;
		if (!event.routineId.includes("daily_digest")) return;
		void (async () => {
			const cfg = await loadNotificationConfig(db, deps.notificationsConfig);
			if (!cfg) return;
			const adapter = getCachedAdapter(state, deps.adapterFactory, cfg);
			queueMicrotask(() => {
				if (state.disposed) return;
				void runDailyDigestInternal(db, adapter, cfg, nowFn()).catch((err) => {
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
		unsubRoutine();
		if (state.adapterCache?.adapter?.close) {
			try {
				state.adapterCache.adapter.close();
			} catch {
				/* ignore */
			}
		}
		state.adapterCache = null;
	};
}

// ---------------------------------------------------------------------------
// Private: digest (digest.ts content)
// ---------------------------------------------------------------------------

interface DigestResultInternal {
	status: "sent" | "noop" | "error";
	notificationsIncluded: number;
	error?: string;
}

interface DigestBuild {
	subject: string;
	body: string;
	count: number;
}

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

async function runDailyDigestInternal(
	db: HyperIdleDb,
	adapter: NotificationAdapter,
	cfg: NotificationConfig,
	now: Date,
): Promise<DigestResultInternal> {
	const pending = await listNotifications(db, { kind: "pending" });
	if (pending.length === 0) return { status: "noop", notificationsIncluded: 0 };

	const recipient = pickRecipient(cfg, adapter.name, "digest");
	if (!recipient)
		return {
			status: "error",
			notificationsIncluded: 0,
			error: "no recipient configured for digest channel",
		};

	const ids = pending.map((r) => r.id);
	const claimedAt = now.toISOString();
	// Atomic batch claim: pending → sending
	await markNotifications(
		db,
		{ kind: "ids", ids, onlyIfStatus: "pending" },
		{ status: "sending", claimedAt },
		now,
	);

	const rows = await listNotifications(db, { kind: "by-ids", ids, status: "sending" });
	if (rows.length === 0) return { status: "noop", notificationsIncluded: 0 };

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
		await markNotifications(db, { kind: "ids", ids }, { status: "pending", claimedAt: null }, now);
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
		await markNotifications(
			db,
			{ kind: "ids", ids },
			{ status: "pending", claimedAt: null, lastError: scrubbed },
			now,
		);
		return { status: "error", notificationsIncluded: 0, error: scrubbed };
	}

	await markNotifications(
		db,
		{ kind: "ids", ids },
		{ status: "sent", sentAt: claimedAt, claimedAt: null },
		now,
	);
	return { status: "sent", notificationsIncluded: count };
}

async function dispatchDigest(
	db: HyperIdleDb,
	deps: DispatcherDeps,
	nowOverride?: Date,
): Promise<DigestResultInternal> {
	const logger = deps.logger ?? createLogger({ pkg: "notifications.dispatcher" });
	const nowFn = deps.now ?? ((): Date => new Date());
	const now = nowOverride ?? nowFn();
	const cfg = await loadNotificationConfig(db, deps.notificationsConfig);
	if (!cfg) return { status: "noop", notificationsIncluded: 0 };
	const adapter = deps.adapterFactory(cfg);
	try {
		return await runDailyDigestInternal(db, adapter, cfg, now);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		logger.error("dispatcher: runDailyDigest threw", { error: message });
		return { status: "error", notificationsIncluded: 0, error: message };
	}
}

// ---------------------------------------------------------------------------
// Private: notification listener (notification-listener.ts content)
// ---------------------------------------------------------------------------

interface NotificationListenerDeps {
	mute: MutePreferenceReader;
	now?: () => Date;
	work: NotificationsWorkReader;
}

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

function registerNotificationListener(
	db: HyperIdleDb,
	bus: EventBus,
	deps: NotificationListenerDeps,
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
			if (await deps.mute.isTypeMuted(typeKey)) return;
			const severity: NotificationSeverity = urgency === "immediate" ? "blocking" : "digest";
			await enqueueNotification(db, {
				eventType: event.type,
				subjectId: targetId,
				severity,
				title: item.title.slice(0, 140),
				body: item.body?.slice(0, 10_000) ?? "",
				// @lore AU43: was "silence" (misleading — listener path never silences); now "notification_event".
				reason: "notification_event",
				channel: null,
				now,
				typeKey,
				urgency,
				sourceLink,
			});
		})();
	});

	return (): void => {
		disposed = true;
		unsub();
	};
}

// ---------------------------------------------------------------------------
// Private: drain (drain.ts content)
// ---------------------------------------------------------------------------

interface DrainDeps {
	now?: () => Date;
	notificationsConfig: ConfigDeps;
}

function startNotificationDrain(
	db: HyperIdleDb,
	factory: AdapterFactory,
	deps: DrainDeps,
): () => void {
	const nowFn = deps.now ?? ((): Date => new Date());
	const handle = setInterval(() => {
		void (async () => {
			const cfg = await loadNotificationConfig(db, deps.notificationsConfig);
			if (!cfg) return;
			await flushQueue(db, factory, cfg, nowFn());
		})();
	}, NOTIFICATION_DRAIN_INTERVAL_MS);
	return (): void => {
		clearInterval(handle);
	};
}

// ---------------------------------------------------------------------------
// Private: sub-dep extractors
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

// ---------------------------------------------------------------------------
// Public exported functions (6 methods counted by census)
// ---------------------------------------------------------------------------

/**
 * Boot all three notification delivery workers:
 *   1. Dispatcher — event-bus subscriber
 *   2. Listener   — notification event → typed in-app row
 *   3. Drain      — 1-minute interval that flushes pending queue rows
 *
 * Returns a single disposer that tears down all three.
 */
export function installNotifications(
	db: HyperIdleDb,
	bus: EventBus,
	deps: NotificationsDeps,
	opts?: {
		adapterFactory?: (cfg: NotificationConfig) => NotificationAdapter;
		readAlertPreferences?: () => Promise<AlertPreferences>;
		now?: () => Date;
		logger?: Logger;
	},
): () => void {
	const factory = opts?.adapterFactory ?? defaultNotificationAdapterFactory;
	const configDeps = toConfigDeps(deps);
	const muteDeps = toMuteDeps(deps);

	const disposeDispatcher = registerNotificationDispatcher(db, bus, {
		adapterFactory: factory,
		readAlertPreferences: opts?.readAlertPreferences,
		notificationsConfig: configDeps,
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
		now: opts?.now,
	});

	return (): void => {
		disposeDrain();
		disposeListener();
		disposeDispatcher();
	};
}

/**
 * Unified delivery drive-op. Discriminate by `spec.kind`:
 *   - `flush`:  drain pending queue through configured adapters
 *   - `digest`: send a batched daily digest
 *   - `test`:   fire-and-verify test send, does NOT touch the queue
 */
export async function deliver(
	db: HyperIdleDb,
	spec: DeliverySpec,
	deps: NotificationsDeps,
	opts?: {
		/** Override the adapter. Tests inject a FakeAdapter; production uses defaultNotificationAdapterFactory. */
		adapterOverride?: NotificationAdapter;
		now?: Date;
	},
): Promise<DeliveryResult> {
	const configDeps = toConfigDeps(deps);

	if (spec.kind === "flush") {
		const cfg = await loadNotificationConfig(db, configDeps);
		if (!cfg) return { kind: "flush", flushed: 0, failed: 0, deferred: 0, disabled: true };
		const now = opts?.now ?? new Date();
		const factory = opts?.adapterOverride
			? () => opts.adapterOverride as NotificationAdapter
			: defaultNotificationAdapterFactory;
		const r = await flushQueue(db, factory, cfg, now);
		return { kind: "flush", ...r };
	}

	if (spec.kind === "digest") {
		const now = opts?.now;
		const factory = opts?.adapterOverride
			? () => opts.adapterOverride as NotificationAdapter
			: defaultNotificationAdapterFactory;
		const r = await dispatchDigest(
			db,
			{
				adapterFactory: factory,
				notificationsConfig: configDeps,
				work: deps.work,
			},
			now,
		);
		return {
			kind: "digest",
			status: r.status,
			notificationsIncluded: r.notificationsIncluded,
			...(r.error !== undefined ? { error: r.error } : {}),
		};
	}

	// spec.kind === "test"
	const cfg = await readNotificationConfig(db, configDeps);
	const ch: NotificationChannel = spec.channel ?? cfg.primaryChannel;
	const recipient = pickRecipient(cfg, ch);
	if (!recipient) {
		return {
			kind: "test",
			ok: false,
			channel: ch,
			error: `recipient not configured for channel '${ch}'`,
			retriable: false,
		};
	}
	const adapter =
		opts?.adapterOverride ?? defaultNotificationAdapterFactory({ ...cfg, primaryChannel: ch });
	try {
		const result = await adapter.send(recipient, {
			title: "HyperIdle notification test",
			body: "This is a test notification from HyperIdle.",
			severity: "digest",
			timestamp: Date.now(),
		});
		return result.ok
			? { kind: "test", ok: true, channel: result.channel, sentAt: result.sentAt }
			: {
					kind: "test",
					ok: false,
					channel: result.channel,
					error: result.error,
					retriable: result.retriable,
				};
	} catch (err) {
		return {
			kind: "test",
			ok: false,
			channel: ch,
			error: err instanceof Error ? err.message : String(err),
			retriable: true,
		};
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
