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
}

export interface UpgradeTokenStore {
	issue(): { token: string; expiresAt: number };
	/**
	 * Claim a token. Returns `{ ok: true }` on success and consumes (deletes)
	 * the token. Returns `{ ok: false }` for any failure (unknown, expired,
	 * or already-consumed token) — callers surface the same generic 401 to
	 * the client either way.
	 */
	consume(token: string): { ok: boolean };
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
			if (record.expiresAt <= now) {
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
		tokens.set(token, { expiresAt });
		return { token, expiresAt };
	}

	function consume(token: string): { ok: boolean } {
		const now = Date.now();
		purgeExpired(now);
		const record = tokens.get(token);
		if (!record) return { ok: false };
		// One-shot: drop the record before checking expiry so a race that
		// re-checks the same token sees `ok: false` on the second pass.
		tokens.delete(token);
		if (record.expiresAt <= now) return { ok: false };
		return { ok: true };
	}

	return { issue, consume };
}
