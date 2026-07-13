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
 *
 * @lore I2 review HIGH-1: the store caps live tokens at
 * `HYPERIDLE_WS_TOKEN_MAX` (default 1000) so a misconfigured rate limit
 * or compromised key cannot drive the Map to unbounded size. When the cap
 * is reached the OLDEST token (smallest `expiresAt`) is evicted to make
 * room for the new one — the operator sees no error but the legitimate
 * client whose token was evicted falls back to a fresh mint on its next
 * upgrade attempt.
 *
 * @lore I2 review A1: browsers cannot set Authorization headers on the
 * WebSocket upgrade, so the token must travel in the URL query string.
 * The mitigations are: 32-byte random tokens, 60s TTL, single-shot
 * consumption, and the token only authorizes session establishment — never
 * any subsequent message. Future work: switch to `Sec-WebSocket-Protocol`
 * subprotocol so the token leaves URL space entirely.
 */

import { randomBytes } from "node:crypto";

interface TokenRecord {
	expiresAt: number;
	identityId?: string;
}

export interface UpgradeTokenStore {
	/**
	 * Issue a token. The optional `identityId` is bound to the token and
	 * returned by `consume` so the WS handler knows which authenticated
	 * identity is opening the upgrade. L1 step9 (Adv-C1): per-thread
	 * subscribe authz needs to verify `senderId ∈ thread.participants`.
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
		// I2 review HIGH-1: hard cap on live tokens. If we are still at the
		// cap after the lazy purge (i.e. all tokens are unexpired), evict
		// the soonest-to-expire token to make room. The legitimate caller
		// whose token was evicted simply mints another one on its next
		// upgrade.
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
