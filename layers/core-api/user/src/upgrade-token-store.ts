/**
 * One-shot, short-lived upgrade tokens for the WebSocket handshake.
 *
 * The browser fetches a token via `POST /api/auth/ws-token` (authenticated
 * with the standard `X-API-Key`), then opens the WS with `?token=<token>`.
 * The token is single-use and TTL-bounded so it cannot be lifted from
 * access logs or browser history and replayed.
 */
// @lore: WS upgrade auth — browsers can't set Authorization on WS upgrade; token travels in URL; 32-byte, 60s TTL, single-shot
// @lore: UpgradeTokenStore cap — HYPERIDLE_WS_TOKEN_MAX (default 1000) prevents unbounded Map growth; oldest evicted at cap

import { randomBytes } from "node:crypto";

interface TokenRecord {
	expiresAt: number;
	identityId?: string;
}

export interface UpgradeTokenStore {
	/**
	 * Issue a token. The optional `identityId` is bound to the token and
	 * returned by `consume` so the WS handler knows which authenticated
	 * identity is opening the upgrade.
	 */
	issue(identityId?: string): { token: string; expiresAt: number };
	/**
	 * Claim a token. Returns `{ ok: true, identityId }` on success and
	 * consumes (deletes) the token. Returns `{ ok: false }` for any failure
	 * (unknown, expired, or already-consumed token) — callers surface the
	 * same generic 401 to the client either way.
	 */
	consume(token: string): { ok: true; identityId?: string } | { ok: false };
}

const DEFAULT_TTL_MS = 60_000;
const DEFAULT_MAX_TOKENS = 1000;

function readTtlMs(): number {
	const raw = process.env.HYPERIDLE_WS_TOKEN_TTL_MS;
	if (!raw) return DEFAULT_TTL_MS;
	const parsed = Number.parseInt(raw, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TTL_MS;
	return parsed;
}

function readMaxTokens(): number {
	const raw = process.env.HYPERIDLE_WS_TOKEN_MAX;
	if (!raw) return DEFAULT_MAX_TOKENS;
	const parsed = Number.parseInt(raw, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX_TOKENS;
	return parsed;
}

export function createUpgradeTokenStore(): UpgradeTokenStore {
	const tokens = new Map<string, TokenRecord>();
	const ttlMs = readTtlMs();
	const maxTokens = readMaxTokens();

	function purgeExpired(now: number): void {
		for (const [token, record] of tokens) {
			if (record.expiresAt <= now) {
				tokens.delete(token);
			}
		}
	}

	function evictOldestByExpiry(): void {
		let oldestToken: string | null = null;
		let oldestExpiry = Number.POSITIVE_INFINITY;
		for (const [token, record] of tokens) {
			if (record.expiresAt < oldestExpiry) {
				oldestExpiry = record.expiresAt;
				oldestToken = token;
			}
		}
		if (oldestToken !== null) tokens.delete(oldestToken);
	}

	function issue(identityId?: string): { token: string; expiresAt: number } {
		const now = Date.now();
		// Lazy cleanup on every issue so memory does not grow unbounded
		// under sustained issuance without consumption (no setInterval).
		purgeExpired(now);
		// Hard cap on live tokens; at cap after lazy purge, evict soonest-to-expire to make room.
		while (tokens.size >= maxTokens) {
			evictOldestByExpiry();
		}
		const token = randomBytes(32).toString("base64url");
		const expiresAt = now + ttlMs;
		const record: TokenRecord = { expiresAt };
		if (identityId !== undefined) {
			record.identityId = identityId;
		}
		tokens.set(token, record);
		return { token, expiresAt };
	}

	function consume(token: string): { ok: true; identityId?: string } | { ok: false } {
		const now = Date.now();
		purgeExpired(now);
		const record = tokens.get(token);
		if (!record) return { ok: false };
		// One-shot: drop the record before checking expiry so a race that
		// re-checks the same token sees `ok: false` on the second pass.
		tokens.delete(token);
		if (record.expiresAt <= now) return { ok: false };
		if (record.identityId !== undefined) {
			return { ok: true, identityId: record.identityId };
		}
		return { ok: true };
	}

	return { issue, consume };
}
