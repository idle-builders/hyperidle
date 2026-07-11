import * as dns from "node:dns";
import * as net from "node:net";
import { promisify } from "node:util";
import { factorySettings, type HyperIdleDb } from "@hyperidle/db";
import type { SanitizeResult } from "@hyperidle/shared";
import { eq } from "drizzle-orm";
import type { NotificationChannel, Recipient } from "./types.js";

const PREFIX = "notifications.";

const KEYS = {
	enabled: `${PREFIX}enabled`,
	primaryChannel: `${PREFIX}primary_channel`,
	digestChannel: `${PREFIX}digest_channel`,
	recipientEmail: `${PREFIX}recipient_email`,
	recipientNtfyTopic: `${PREFIX}recipient_ntfy_topic`,
	ntfyBaseUrl: `${PREFIX}ntfy_base_url`,
	ntfyAuthToken: `${PREFIX}ntfy_auth_token`,
	smtpHost: `${PREFIX}smtp_host`,
	smtpPort: `${PREFIX}smtp_port`,
	smtpSecure: `${PREFIX}smtp_secure`,
	smtpUsername: `${PREFIX}smtp_username`,
	smtpPassword: `${PREFIX}smtp_password`,
	smtpFrom: `${PREFIX}smtp_from`,
	floodMaxPerMinute: `${PREFIX}flood_max_per_minute`,
	floodCoalesceWindowMs: `${PREFIX}flood_coalesce_window_ms`,
	testMaxPerHour: `${PREFIX}test_max_per_hour`,
	smtpIgnoreTls: `${PREFIX}smtp_ignore_tls`,
	digestCron: `${PREFIX}digest_cron`,
} as const;

export const REDACTED = "***" as const;

export interface NotificationConfig {
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

/**
 * External wire shape: `NotificationConfig` with sensitive strings (ntfy
 * auth token, SMTP password) replaced by `REDACTED` when set, or `null`
 * when unset. Derived from `NotificationConfig` so adding a field to the
 * internal shape does not require editing a parallel interface.
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

const DEFAULTS = {
	primaryChannel: "console" as NotificationChannel,
	digestChannel: "console" as NotificationChannel,
	ntfyBaseUrl: "https://ntfy.sh",
	smtpPort: 587,
	floodMaxPerMinute: 6,
	floodCoalesceWindowMs: 60_000,
	testMaxPerHour: 5,
	digestCron: "0 8 * * *",
} as const;

const CHANNELS: ReadonlySet<NotificationChannel> = new Set(["console", "ntfy", "smtp"]);

function isChannel(value: string | undefined): value is NotificationChannel {
	return value !== undefined && CHANNELS.has(value as NotificationChannel);
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
	if (raw === undefined) return fallback;
	const n = Number(raw);
	if (!Number.isFinite(n) || n < 0) return fallback;
	return Math.floor(n);
}

async function readAllSettings(db: HyperIdleDb): Promise<Map<string, string>> {
	const rows = await db.select().from(factorySettings);
	const map = new Map<string, string>();
	for (const row of rows) {
		if (row.key.startsWith(PREFIX)) map.set(row.key, row.value);
	}
	return map;
}

function buildConfig(kv: Map<string, string>): NotificationConfig {
	const enabled = kv.get(KEYS.enabled) === "true";
	const primary = kv.get(KEYS.primaryChannel);
	const digest = kv.get(KEYS.digestChannel);
	const primaryChannel = isChannel(primary) ? primary : DEFAULTS.primaryChannel;
	const digestChannel = isChannel(digest) ? digest : primaryChannel;

	const email = kv.get(KEYS.recipientEmail);
	const ntfyTopic = kv.get(KEYS.recipientNtfyTopic);
	const ntfyBaseUrl = kv.get(KEYS.ntfyBaseUrl) ?? DEFAULTS.ntfyBaseUrl;
	const ntfyAuthToken = kv.get(KEYS.ntfyAuthToken);

	const smtpHost = kv.get(KEYS.smtpHost);
	const smtpPort = parsePositiveInt(kv.get(KEYS.smtpPort), DEFAULTS.smtpPort);
	const smtpSecure = kv.get(KEYS.smtpSecure) === "true";
	const smtpUsername = kv.get(KEYS.smtpUsername);
	const smtpPassword = kv.get(KEYS.smtpPassword);
	const smtpFrom = kv.get(KEYS.smtpFrom);

	const floodMaxPerMinute = parsePositiveInt(
		kv.get(KEYS.floodMaxPerMinute),
		DEFAULTS.floodMaxPerMinute,
	);
	const floodCoalesceWindowMs = parsePositiveInt(
		kv.get(KEYS.floodCoalesceWindowMs),
		DEFAULTS.floodCoalesceWindowMs,
	);
	const testMaxPerHour = parsePositiveInt(kv.get(KEYS.testMaxPerHour), DEFAULTS.testMaxPerHour);
	const smtpIgnoreTls = kv.get(KEYS.smtpIgnoreTls) === "true";
	const digestCron = kv.get(KEYS.digestCron) ?? DEFAULTS.digestCron;

	return {
		enabled,
		primaryChannel,
		digestChannel,
		recipient: {
			email: email && email.length > 0 ? email : null,
			ntfyTopic: ntfyTopic && ntfyTopic.length > 0 ? ntfyTopic : null,
		},
		ntfy: {
			baseUrl: ntfyBaseUrl,
			authToken: ntfyAuthToken && ntfyAuthToken.length > 0 ? ntfyAuthToken : null,
		},
		smtp: {
			host: smtpHost && smtpHost.length > 0 ? smtpHost : null,
			port: smtpPort,
			secure: smtpSecure,
			username: smtpUsername && smtpUsername.length > 0 ? smtpUsername : null,
			password: smtpPassword && smtpPassword.length > 0 ? smtpPassword : null,
			from: smtpFrom && smtpFrom.length > 0 ? smtpFrom : null,
		},
		flood: {
			maxPerMinute: floodMaxPerMinute,
			coalesceWindowMs: floodCoalesceWindowMs,
		},
		testMaxPerHour,
		smtpIgnoreTls,
		digestCron,
	};
}

/**
 * Read the typed config from `factory_settings`. Always returns a shape
 * (even when disabled) so GET /config can surface the current values.
 */
export async function readNotificationConfig(db: HyperIdleDb): Promise<NotificationConfig> {
	return buildConfig(await readAllSettings(db));
}

/**
 * Return `null` when notifications are disabled. Dispatchers use this to
 * short-circuit their event handler.
 */
export async function loadNotificationConfig(db: HyperIdleDb): Promise<NotificationConfig | null> {
	const cfg = buildConfig(await readAllSettings(db));
	if (!cfg.enabled) return null;
	return cfg;
}

/**
 * Redact sensitive fields for any GET/response that leaves the process.
 * Booleans (`*Set`) give the UI a machine-readable "configured / not
 * configured" flag alongside the self-documenting REDACTED sentinel.
 */
export function redactNotificationConfig(cfg: NotificationConfig): SafeNotificationConfig {
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

async function upsert(db: HyperIdleDb, key: string, value: string, now: string): Promise<void> {
	await db
		.insert(factorySettings)
		.values({ key, value, updatedAt: now })
		.onConflictDoUpdate({
			target: factorySettings.key,
			set: { value, updatedAt: now },
		});
}

async function clearOrSet(
	db: HyperIdleDb,
	key: string,
	value: string | null | undefined,
	now: string,
): Promise<void> {
	if (value === undefined) return;
	if (value === null || value.length === 0) {
		await db.delete(factorySettings).where(eq(factorySettings.key, key));
		return;
	}
	await upsert(db, key, value, now);
}

/**
 * Apply a partial patch to the KV store. `null` on string fields clears
 * the row (treated as unset). Unknown fields are ignored.
 */
export async function updateNotificationConfig(
	db: HyperIdleDb,
	patch: NotificationConfigPatch,
): Promise<NotificationConfig> {
	const now = new Date().toISOString();
	if (patch.enabled !== undefined)
		await upsert(db, KEYS.enabled, patch.enabled ? "true" : "false", now);
	if (patch.primaryChannel !== undefined)
		await upsert(db, KEYS.primaryChannel, patch.primaryChannel, now);
	if (patch.digestChannel !== undefined)
		await upsert(db, KEYS.digestChannel, patch.digestChannel, now);
	if (patch.ntfyBaseUrl !== undefined) await upsert(db, KEYS.ntfyBaseUrl, patch.ntfyBaseUrl, now);
	if (patch.smtpPort !== undefined) await upsert(db, KEYS.smtpPort, String(patch.smtpPort), now);
	if (patch.smtpSecure !== undefined)
		await upsert(db, KEYS.smtpSecure, patch.smtpSecure ? "true" : "false", now);
	if (patch.floodMaxPerMinute !== undefined)
		await upsert(db, KEYS.floodMaxPerMinute, String(patch.floodMaxPerMinute), now);
	if (patch.floodCoalesceWindowMs !== undefined)
		await upsert(db, KEYS.floodCoalesceWindowMs, String(patch.floodCoalesceWindowMs), now);
	if (patch.testMaxPerHour !== undefined)
		await upsert(db, KEYS.testMaxPerHour, String(patch.testMaxPerHour), now);
	if (patch.smtpIgnoreTls !== undefined)
		await upsert(db, KEYS.smtpIgnoreTls, patch.smtpIgnoreTls ? "true" : "false", now);
	if (patch.digestCron !== undefined) await upsert(db, KEYS.digestCron, patch.digestCron, now);

	await clearOrSet(db, KEYS.recipientEmail, patch.recipientEmail, now);
	await clearOrSet(db, KEYS.recipientNtfyTopic, patch.recipientNtfyTopic, now);
	await clearOrSet(db, KEYS.ntfyAuthToken, patch.ntfyAuthToken, now);
	await clearOrSet(db, KEYS.smtpHost, patch.smtpHost, now);
	await clearOrSet(db, KEYS.smtpUsername, patch.smtpUsername, now);
	await clearOrSet(db, KEYS.smtpPassword, patch.smtpPassword, now);
	await clearOrSet(db, KEYS.smtpFrom, patch.smtpFrom, now);

	return readNotificationConfig(db);
}

/**
 * Resolve the adapter-level recipient for a channel. Shared by push
 * (dispatcher + route handler) and digest so label strings + null checks
 * cannot drift. `kind: "digest"` suffixes the label for logging; it never
 * changes routing.
 */
export function pickRecipient(
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

// ---------------------------------------------------------------------------
// Sanitizers
// ---------------------------------------------------------------------------

/** Validate a recipient email. */
export function sanitizeEmail(input: string): SanitizeResult {
	if (typeof input !== "string" || input.length === 0) {
		return { ok: false, reason: "email must be a non-empty string" };
	}
	if (input.length > 254) return { ok: false, reason: "email must be <= 254 chars" };
	if (/[\0\r\n]/.test(input)) {
		return { ok: false, reason: "email must not contain control characters" };
	}
	if (input.startsWith("-")) return { ok: false, reason: "email must not begin with '-'" };
	if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(input)) {
		return { ok: false, reason: "email must be a valid address" };
	}
	return { ok: true };
}

/** Validate an ntfy topic slug. Per ntfy docs: URL-safe characters only. */
export function sanitizeTopic(input: string): SanitizeResult {
	if (typeof input !== "string" || input.length === 0) {
		return { ok: false, reason: "topic must be a non-empty string" };
	}
	if (input.length > 64) return { ok: false, reason: "topic must be <= 64 chars" };
	if (input.startsWith("-")) return { ok: false, reason: "topic must not begin with '-'" };
	if (!/^[A-Za-z0-9_-]+$/.test(input)) {
		return { ok: false, reason: "topic must match [A-Za-z0-9_-]+" };
	}
	return { ok: true };
}

/**
 * @lore SSRF defense per H2 security review #5. `sanitizeNtfyUrl` rejects
 * URLs whose host is an IP literal inside a private / link-local range.
 * `sanitizeNtfyUrlWithDns` adds a DNS resolution check for hostnames
 * (rebinding defense); callers that run at send time MUST use the async
 * variant before issuing the HTTP POST.
 */
const PRIVATE_HOSTS: ReadonlySet<string> = new Set(["localhost", "localhost.", "broadcasthost"]);

function isPrivateIPv4(ip: string): boolean {
	const parts = ip.split(".");
	if (parts.length !== 4) return false;
	const nums = parts.map(Number);
	if (nums.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return false;
	// @lore AF3 C4: parts.length === 4 is proven above; guard narrows a and b
	// to number for the SSRF blocklist checks. Do NOT change which IPs are
	// classified private — this is a security-critical function.
	const a = nums[0];
	const b = nums[1];
	if (a === undefined || b === undefined) return false;
	if (a === 10) return true; // 10.0.0.0/8
	if (a === 127) return true; // loopback
	if (a === 0) return true; // 0.0.0.0/8 "this network"
	if (a === 169 && b === 254) return true; // link-local
	if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
	if (a === 192 && b === 168) return true; // 192.168.0.0/16
	if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
	if (a >= 224) return true; // multicast / reserved
	return false;
}

function isPrivateIPv6(ip: string): boolean {
	const lower = ip.toLowerCase().replace(/^\[|\]$/g, "");
	if (lower === "::1") return true;
	if (lower === "::") return true;
	// Link-local fe80::/10
	if (/^fe[89ab][0-9a-f]?:/i.test(lower)) return true;
	// Unique-local fc00::/7
	if (/^f[cd][0-9a-f]{0,2}:/i.test(lower)) return true;
	// IPv4-mapped or IPv4-compatible addresses (::ffff:a.b.c.d)
	const embedded = lower.match(/::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/);
	// @lore AF3 C5: embedded[1] is always defined when the capture-group regex matches;
	// the presence guard is a narrowing step to satisfy noUncheckedIndexedAccess.
	if (embedded) {
		const ipv4Part = embedded[1];
		if (ipv4Part !== undefined) return isPrivateIPv4(ipv4Part);
	}
	return false;
}

function isPrivateHostLiteral(hostname: string): boolean {
	const clean = hostname.replace(/^\[|\]$/g, "").toLowerCase();
	if (PRIVATE_HOSTS.has(clean)) return true;
	// mDNS `.local` — rejected regardless (prevents local-network leakage)
	if (clean.endsWith(".local")) return true;
	// Metadata endpoint — covers AWS/GCP/Azure 169.254.169.254 + DigitalOcean's 169.254.169.254
	if (clean === "metadata" || clean === "metadata.google.internal") return true;
	if (net.isIP(clean) === 4) return isPrivateIPv4(clean);
	if (net.isIP(clean) === 6) return isPrivateIPv6(clean);
	return false;
}

/**
 * Validate an ntfy base URL. https required except for loopback hosts
 * where http is allowed (lets tests target `http://127.0.0.1:<port>`).
 * Rejects private/link-local/metadata/mDNS hosts at the input stage; a
 * second DNS check at send time in {@link assertNtfyUrlNotSSRF} covers
 * the rebinding case where a public hostname resolves to a private IP.
 */
export function sanitizeNtfyUrl(input: string): SanitizeResult {
	if (typeof input !== "string" || input.length === 0) {
		return { ok: false, reason: "ntfy url must be a non-empty string" };
	}
	if (/[\0\r\n]/.test(input)) {
		return { ok: false, reason: "ntfy url must not contain control characters" };
	}
	let url: URL;
	try {
		url = new URL(input);
	} catch {
		return { ok: false, reason: "ntfy url is not a valid URL" };
	}
	if (url.username.length > 0 || url.password.length > 0) {
		return { ok: false, reason: "ntfy url must not contain userinfo" };
	}
	const host = url.hostname.toLowerCase();
	const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
	if (url.protocol === "https:") {
		if (isPrivateHostLiteral(host) && !loopbackHosts.has(host)) {
			return { ok: false, reason: "ntfy url resolves to a private / link-local host" };
		}
		return { ok: true };
	}
	if (url.protocol === "http:") {
		if (loopbackHosts.has(host)) return { ok: true };
		return { ok: false, reason: "http:// is only permitted for loopback hosts" };
	}
	return { ok: false, reason: "ntfy url must be http:// or https://" };
}

const dnsLookup = promisify(dns.lookup);

/**
 * Runtime SSRF defense: resolve the hostname to an IP and reject the
 * request if it sits inside a private range. Called by the ntfy adapter
 * before every POST so a hostname whose DNS answer flips to a private
 * address between save time and send time cannot exfiltrate tokens.
 */
export async function assertNtfyUrlNotSSRF(baseUrl: string): Promise<SanitizeResult> {
	const syncCheck = sanitizeNtfyUrl(baseUrl);
	if (!syncCheck.ok) return syncCheck;
	let url: URL;
	try {
		url = new URL(baseUrl);
	} catch {
		return { ok: false, reason: "ntfy url is not a valid URL" };
	}
	const host = url.hostname.replace(/^\[|\]$/g, "");
	if (net.isIP(host)) return { ok: true }; // literal; already validated
	try {
		const resolved = await dnsLookup(host, { all: true });
		for (const record of resolved) {
			const address = record.address;
			if (net.isIP(address) === 4 && isPrivateIPv4(address)) {
				return { ok: false, reason: `ntfy host resolves to private IPv4 ${address}` };
			}
			if (net.isIP(address) === 6 && isPrivateIPv6(address)) {
				return { ok: false, reason: `ntfy host resolves to private IPv6 ${address}` };
			}
		}
	} catch {
		return { ok: false, reason: "ntfy host could not be resolved" };
	}
	return { ok: true };
}

/**
 * SMTP username/password sanitizer. Rejects CR/LF/NUL to prevent SMTP
 * command injection via the AUTH header (H2 security review #6).
 */
export function sanitizeSmtpCredential(input: string): SanitizeResult {
	if (typeof input !== "string") {
		return { ok: false, reason: "smtp credential must be a string" };
	}
	if (input.length === 0) {
		return { ok: false, reason: "smtp credential must not be empty" };
	}
	if (input.length > 1024) {
		return { ok: false, reason: "smtp credential must be <= 1024 chars" };
	}
	if (/[\0\r\n]/.test(input)) {
		return { ok: false, reason: "smtp credential must not contain control characters" };
	}
	return { ok: true };
}

/**
 * Cron expression sanitizer. Validates the shape (5 fields, whitespace-
 * separated, no control chars). Does not execute — the routine scheduler
 * parses it at fire time.
 */
export function sanitizeCron(input: string): SanitizeResult {
	if (typeof input !== "string" || input.length === 0) {
		return { ok: false, reason: "cron expression must be a non-empty string" };
	}
	if (input.length > 128) return { ok: false, reason: "cron expression must be <= 128 chars" };
	if (/[\0\r\n]/.test(input)) {
		return { ok: false, reason: "cron expression must not contain control characters" };
	}
	const fields = input.trim().split(/\s+/);
	if (fields.length !== 5) {
		return { ok: false, reason: "cron expression must have exactly 5 fields" };
	}
	return { ok: true };
}

/** Validate an SMTP hostname (RFC 1123 shape). */
export function sanitizeSmtpHost(input: string): SanitizeResult {
	if (typeof input !== "string" || input.length === 0) {
		return { ok: false, reason: "smtp host must be a non-empty string" };
	}
	if (input.length > 253) return { ok: false, reason: "smtp host must be <= 253 chars" };
	if (input.startsWith("-")) return { ok: false, reason: "smtp host must not begin with '-'" };
	if (/[\0\r\n\s]/.test(input)) {
		return { ok: false, reason: "smtp host must not contain whitespace or control chars" };
	}
	if (!/^[A-Za-z0-9.\-:]+$/.test(input)) {
		return { ok: false, reason: "smtp host must match [A-Za-z0-9.\\-:]+" };
	}
	return { ok: true };
}
