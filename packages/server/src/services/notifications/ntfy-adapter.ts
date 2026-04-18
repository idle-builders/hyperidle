/**
 * Publishes to a ntfy.sh-compatible topic via HTTP POST.
 * Docs: https://docs.ntfy.sh/publish/#publish-as-json
 *
 * @lore fetch is injectable so the integration test can target a local
 * HTTP fixture on `127.0.0.1:0`. The adapter is hermetic when driven by
 * the injected fetch; the default `globalThis.fetch` is used only in
 * production wiring.
 */

import { assertNtfyUrlNotSSRF, sanitizeNtfyUrl, sanitizeTopic } from "./config.js";
import { scrubErrorMessage } from "./redact.js";
import type {
	Notification,
	NotificationAdapter,
	NotificationSeverity,
	Recipient,
	SendResult,
} from "./types.js";

export interface NtfyAdapterOptions {
	readonly baseUrl: string;
	readonly authToken?: string | null;
	/** Inject fetch for testing; defaults to `globalThis.fetch`. */
	readonly fetch?: typeof globalThis.fetch;
	readonly now?: () => Date;
}

function priorityForSeverity(severity: NotificationSeverity): "urgent" | "high" | "default" {
	switch (severity) {
		case "blocking":
			return "urgent";
		case "cost_breach":
			return "high";
		case "digest":
			return "default";
	}
}

export function createNtfyAdapter(opts: NtfyAdapterOptions): NotificationAdapter {
	const urlCheck = sanitizeNtfyUrl(opts.baseUrl);
	if (!urlCheck.ok) {
		throw new Error(`ntfy-adapter: ${urlCheck.reason}`);
	}
	const fetchFn = opts.fetch ?? globalThis.fetch.bind(globalThis);
	const now = opts.now ?? ((): Date => new Date());
	const base = opts.baseUrl.replace(/\/+$/, "");

	return {
		name: "ntfy",
		async send(recipient: Recipient, notification: Notification): Promise<SendResult> {
			const topicCheck = sanitizeTopic(recipient.channelId);
			if (!topicCheck.ok) {
				return {
					ok: false,
					channel: "ntfy",
					error: `invalid topic: ${topicCheck.reason}`,
					retriable: false,
				};
			}
			// @lore Runtime SSRF check on every send — catches DNS
			// rebinding between config PATCH and this POST. The sync
			// check ran at PATCH time; this is the second gate.
			const ssrfCheck = await assertNtfyUrlNotSSRF(opts.baseUrl);
			if (!ssrfCheck.ok) {
				return {
					ok: false,
					channel: "ntfy",
					error: `ntfy base url blocked: ${ssrfCheck.reason}`,
					retriable: false,
				};
			}

			// @lore ntfy.sh requires capitalized HTTP headers: `Title`,
			// `Priority`, `Tags`, `Authorization`. The biome naming
			// convention would force camelCase, which the ntfy server
			// ignores. Docs: https://docs.ntfy.sh/publish/#publish-as-json
			const headers: Record<string, string> = {
				"Content-Type": "text/plain; charset=utf-8",
				// biome-ignore lint/style/useNamingConvention: ntfy HTTP header
				Title: notification.title,
				// biome-ignore lint/style/useNamingConvention: ntfy HTTP header
				Priority: priorityForSeverity(notification.severity),
			};
			if (notification.tags && notification.tags.length > 0) {
				headers.Tags = notification.tags.join(",");
			}
			if (opts.authToken && opts.authToken.length > 0) {
				headers.Authorization = `Bearer ${opts.authToken}`;
			}

			const url = `${base}/${encodeURIComponent(recipient.channelId)}`;
			let res: Response;
			try {
				res = await fetchFn(url, {
					method: "POST",
					headers,
					body: notification.body,
				});
			} catch (err) {
				const raw = err instanceof Error ? err.message : String(err);
				return {
					ok: false,
					channel: "ntfy",
					error: scrubErrorMessage(raw, { ntfyAuthToken: opts.authToken }),
					retriable: true,
				};
			}
			if (res.status >= 200 && res.status < 300) {
				return { ok: true, channel: "ntfy", sentAt: now().toISOString() };
			}
			const text = await res.text().catch(() => "");
			const scrubbedText = scrubErrorMessage(text.slice(0, 200), {
				ntfyAuthToken: opts.authToken,
			});
			return {
				ok: false,
				channel: "ntfy",
				error: `ntfy returned ${res.status}: ${scrubbedText}`,
				retriable: res.status >= 500,
			};
		},
	};
}
