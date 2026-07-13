/**
 * Uses nodemailer. Docs: https://nodemailer.com/smtp/ (verified 2026-04).
 *
 * @lore nodemailer's `createTransport` factory is injectable so unit tests
 * can swap in a fake transporter that records `sendMail` calls without
 * touching sockets. The integration test uses the real factory against a
 * local `smtp-server` bound to `127.0.0.1:0`.
 *
 * @lore `close()` calls nodemailer's `transporter.close()` which drains
 * pooled connections. The dispatcher memoizes the adapter by cfg
 * identity, so calling `close()` on config change prevents socket leaks.
 */

import type { Transporter } from "nodemailer";
import nodemailer from "nodemailer";
import { scrubErrorMessage } from "./redact.js";
import type { Notification, NotificationAdapter, Recipient, SendResult } from "./types.js";

export interface SmtpAdapterOptions {
	readonly host: string;
	readonly port: number;
	/** true = TLS on connect (port 465). false = STARTTLS (port 587). */
	readonly secure: boolean;
	readonly username?: string | null;
	readonly password?: string | null;
	readonly from: string;
	/**
	 * Inject a transporter factory for tests. Default:
	 * `nodemailer.createTransport`.
	 */
	readonly createTransport?: typeof nodemailer.createTransport;
	readonly now?: () => Date;
	/**
	 * When true, skips TLS certificate validation. ONLY for integration
	 * tests against a self-signed `smtp-server` instance on 127.0.0.1.
	 *
	 * @lore NEVER expose this via PATCH /config in production. The config
	 * patch gate rejects it when `NODE_ENV === "production"`. A runtime
	 * assertion below also throws on production + ignoreTls to prevent a
	 * test leak from hiding a MITM exposure.
	 */
	readonly ignoreTls?: boolean;
}

function buildTransporter(opts: SmtpAdapterOptions): Transporter {
	if (opts.ignoreTls === true && process.env.NODE_ENV === "production") {
		throw new Error(
			"smtp-adapter: ignoreTls is not permitted in production — set NODE_ENV != production or disable ignoreTls",
		);
	}
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

/**
 * Classify retriability using nodemailer's structured error codes (not
 * regex on the message). Docs:
 *   https://nodemailer.com/smtp/response/
 * and the set of code constants in nodemailer issues.
 *
 * Retriable:
 *  - No responseCode + connection errors (ECONNREFUSED, ETIMEDOUT,
 *    EDNS, ESOCKET) are network transients.
 *  - 4xx SMTP response codes are explicitly transient per RFC 5321.
 *
 * Permanent:
 *  - 5xx response codes (mailbox rejected, auth failure, policy).
 */
function classifyRetriable(err: unknown): boolean {
	const e = err as NodemailerError;
	if (typeof e.responseCode === "number") {
		return e.responseCode >= 400 && e.responseCode < 500;
	}
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
	// Unknown — retry once; flushQueue retries safely.
	return true;
}

export function createSmtpAdapter(opts: SmtpAdapterOptions): NotificationAdapter {
	const now = opts.now ?? ((): Date => new Date());
	const transporter = buildTransporter(opts);

	return {
		name: "smtp",
		async send(recipient: Recipient, notification: Notification): Promise<SendResult> {
			const to = recipient.channelId;
			// @lore Defensive CRLF rejection: subject MUST NOT contain
			// CR/LF (SMTP header injection). Body has CR/LF converted by
			// nodemailer's encoder, so only subject is guarded here.
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
					retriable: classifyRetriable(err),
				};
			}
		},
		close(): void {
			try {
				transporter.close();
			} catch {
				// Best-effort teardown — pooled sockets closing twice is harmless.
			}
		},
	};
}
