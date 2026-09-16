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
 * Census surface after those removals (4m / 2t):
 *   4 methods: installNotifications, deliver, readPreferences, updatePreferences
 *   2 types:   DeliverySpec, DeliveryResult
 */

import * as crypto from "node:crypto";
import type { HyperIdleDb, NewNotificationQueueRow } from "@hyperidle/db";
import { ERROR_TOKEN_PATTERNS, REDACTED_TAG } from "@hyperidle/diagnostics";
import type { NotificationTypeKey } from "@hyperidle/domain-model";
import type { NotificationEvent } from "@hyperidle/event-bus";

// @lore AU44-b8: NotificationUrgency SIMPLIFY'd from domain-model public API (element type
// of NotificationType.defaultUrgency; no external consumer names it directly). Inlined here.
type NotificationUrgency = "immediate" | "ambient";

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

// ---------------------------------------------------------------------------
// Private: credential helpers
// ---------------------------------------------------------------------------

async function readSecret(db: HyperIdleDb, name: string, deps: ConfigDeps): Promise<string | null> {
	const row = await deps.credentialStore.findByName(db, name);
	if (!row) return null;
	return deps.credentialCipher.decryptCredentialValue(row.encryptedValue);
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
