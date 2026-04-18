/**
 * One-shot, short-lived upgrade tokens for the WebSocket handshake.
 *
 * The browser fetches a token via `POST /api/auth/ws-token` (authenticated
 * with the standard `X-API-Key`), then opens the WS with `?token=<token>`.
 * The token is single-use and TTL-bounded so it cannot be lifted from
 * access logs or browser history and replayed.
 *
 * @lore I2 A3/A4/A5: the previous WS auth accepted `?token=<HYPERIDLE_API_KEY>`
 * — that leaked the master key into URL access logs, browser history, and
 * any reverse proxy in front. The upgrade-token model gives the WS its own
 * short-lived credential without storing keys in URL strings.
 */

import { randomBytes } from "node:crypto";

interface TokenRecord {
	expiresAt: number;
	consumed: boolean;
}

export type ConsumeResult =
	| { ok: true }
	| { ok: false; reason: "expired" | "consumed" | "unknown" };

export interface UpgradeTokenStore {
	issue(): { token: string; expiresAt: number };
	consume(token: string): ConsumeResult;
	/** Test-only: snapshot the current size so tests can assert cleanup. */
	size(): number;
}

const DEFAULT_TTL_MS = 60_000;

function readTtlMs(): number {
	const raw = process.env.HYPERIDLE_WS_TOKEN_TTL_MS;
	if (!raw) return DEFAULT_TTL_MS;
	const parsed = Number.parseInt(raw, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TTL_MS;
	return parsed;
}

export function createUpgradeTokenStore(): UpgradeTokenStore {
	const tokens = new Map<string, TokenRecord>();
	const ttlMs = readTtlMs();

	function purgeExpired(now: number): void {
		for (const [token, record] of tokens) {
			if (record.expiresAt <= now || record.consumed) {
				tokens.delete(token);
			}
		}
	}

	function issue(): { token: string; expiresAt: number } {
		const now = Date.now();
		// Lazy cleanup on every issue so memory does not grow unbounded
		// under sustained issuance without consumption (no setInterval).
		purgeExpired(now);
		const token = randomBytes(32).toString("base64url");
		const expiresAt = now + ttlMs;
		tokens.set(token, { expiresAt, consumed: false });
		return { token, expiresAt };
	}

	function consume(token: string): ConsumeResult {
		const now = Date.now();
		purgeExpired(now);
		const record = tokens.get(token);
		if (!record) return { ok: false, reason: "unknown" };
		if (record.consumed) {
			tokens.delete(token);
			return { ok: false, reason: "consumed" };
		}
		if (record.expiresAt <= now) {
			tokens.delete(token);
			return { ok: false, reason: "expired" };
		}
		record.consumed = true;
		// One-shot: drop the record immediately so a race that re-checks
		// the same token sees `unknown` (not `consumed`) on the second pass.
		tokens.delete(token);
		return { ok: true };
	}

	function size(): number {
		return tokens.size;
	}

	return { issue, consume, size };
}
