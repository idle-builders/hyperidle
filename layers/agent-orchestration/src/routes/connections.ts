/**
 * Connections — read/write bodies for a user's `service_connections`, held
 * union the reach cache's inherited projections.
 *
 * @lore BC5 T11 (architecture.md §6/§9, T4): the `/api/connections` HTTP
 * route family (`createConnectionRoutes`, its rate limiters and the
 * `/:id/validate` SSRF-checked probe) is DELETED — connections are a user
 * attribute now, read through `open_user({}).connections` and written
 * through `edit_user({ connections })`, crossing `AgentOrchestrationPort`'s
 * `connections` seam (`agent-orchestration-intake.ts`'s plumbing routes)
 * rather than a public route. `listConnectionsForUser`/
 * `createConnectionForUser`/`removeConnectionForUser` below (BC5 T4) are
 * that seam's one implementation — they stay, unchanged.
 *
 * Security model unchanged: every query scoped on userId (per-user
 * isolation); cross-user / non-existent → NOT_FOUND, never leaks existence;
 * tokens stored AES-256-GCM encrypted, never returned.
 *
 * @lore AN1: No trust tier, no broker/gate, no OAuth dance. Simple secrets and
 * MCP pointers only. OAuth services arrive inherited from the harness.
 *
 * @lore AN1: Concept hard-rule 1 — encryptedToken NEVER appears in any response.
 * The resolver (ServiceConnectionResolver) is the only plaintext path, wired to
 * sandbox injection (AN2), not to routes.
 */

import {
	deleteConnection,
	type InheritedReach,
	insertConnection,
	listConnections,
} from "@hyperidle/connections";
import type { HyperIdleDb } from "@hyperidle/db";
import type { ConnectionHealth, ServiceConnectionView } from "@hyperidle/domain-model";
import { z } from "zod";
import { isPrivateHostLiteral } from "../ssrf.js";

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

/**
 * SSRF guard for serverUrl: must be https:// and must not be a private/loopback/
 * link-local IP literal.
 *
 * Architecture critique WARNING §4: https:// alone is insufficient — https://169.254.169.254
 * is link-local. We block private IP literals at input time using the shared SSRF utility.
 *
 * @lore AN1 SSRF: This blocks IP literals. Full DNS-rebinding protection (where a public
 * hostname resolves to a private IP) is deferred to AN2's outbound-client scope, which is
 * explicitly documented as a known follow-up — not a silent gap.
 */
function isBlockedUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		return isPrivateHostLiteral(parsed.hostname);
	} catch {
		return true; // unparseable → blocked
	}
}

/**
 * Exported so `agent-orchestration-intake.ts` validates `connections.add`'s
 * body against the SAME schema — mirrors `AgentOrchestrationConnectionCreateInput`
 * (`@hyperidle/api-contract`).
 */
export const createConnectionSchema = z.discriminatedUnion("authSource", [
	z.object({
		service: z.string().min(1).max(200),
		authSource: z.literal("token"),
		token: z.string().min(1).max(10_000),
	}),
	z.object({
		service: z.string().min(1).max(200).optional(),
		authSource: z.literal("mcp"),
		serverUrl: z
			.string()
			.min(1)
			.max(2000)
			.refine((u) => u.startsWith("https://"), {
				message: "serverUrl must be https://",
			})
			.refine((u) => !isBlockedUrl(u), {
				message: "serverUrl must not resolve to a private, loopback, or link-local address",
			}),
	}),
]);
export type CreateConnectionInput = z.infer<typeof createConnectionSchema>;

// ---------------------------------------------------------------------------
// View builder
// ---------------------------------------------------------------------------

/**
 * Derive the `via` string for a row. Server-constructed — never a raw secret echo.
 *
 * @lore AN1 Phase-0 decision 3: `via` is always server-constructed:
 *   token → "API key · stored encrypted"
 *   mcp   → "<host>" (hostname of the MCP server URL)
 */
function buildVia(authSource: string, serverUrl: string | null | undefined): string {
	if (authSource === "token") return "API key · stored encrypted";
	if (authSource === "mcp" && serverUrl) {
		try {
			return new URL(serverUrl).hostname;
		} catch {
			return serverUrl;
		}
	}
	return "";
}

/**
 * Cast a raw DB health string to the closed 2-set.
 * Falls back to "needs-attention" for any unrecognised value.
 */
function toHealth(raw: string): ConnectionHealth {
	if (raw === "working" || raw === "needs-attention") return raw;
	return "needs-attention";
}

/**
 * Build the public ServiceConnectionView from a DB row.
 * NEVER includes encryptedToken or serverUrl.
 */
function rowToView(row: {
	id: string;
	service: string;
	authSource: string;
	health: string;
	serverUrl: string | null | undefined;
}): ServiceConnectionView {
	return {
		id: row.id,
		service: row.service,
		via: buildVia(row.authSource, row.serverUrl),
		authSource: row.authSource as ServiceConnectionView["authSource"],
		health: toHealth(row.health),
		removable: true,
	};
}

/**
 * Derive the service name from a serverUrl hostname when the user omits it.
 * Strips a leading "mcp." subdomain so "mcp.figma.com" → "figma.com".
 *
 * @lore AN1 §4 suggestion: deterministic derivation so two builders can't pick
 * different rules. This affects the unique constraint (userId, service, authSource).
 */
function deriveServiceFromUrl(serverUrl: string): string {
	try {
		const host = new URL(serverUrl).hostname;
		// Strip common "mcp." prefix
		return host.startsWith("mcp.") ? host.slice(4) : host;
	} catch {
		return serverUrl;
	}
}

// ---------------------------------------------------------------------------
// Extracted logic — the one implementation
// `AgentOrchestrationPort`'s `connections` family calls through
// `agent-orchestration-intake.ts`'s plumbing routes.
// ---------------------------------------------------------------------------

/**
 * `connections.list` — held rows (from DB) union the reach cache's inherited
 * projections, kept as two arrays rather than a merged one so a caller that
 * needs to tell them apart (§6's `open_user`) can.
 */
export async function listConnectionsForUser(
	db: HyperIdleDb,
	userId: string,
	inheritedReach?: InheritedReach,
): Promise<{
	readonly connections: readonly ServiceConnectionView[];
	readonly inherited: readonly ServiceConnectionView[];
}> {
	const rows = await listConnections(db, { userId });
	return {
		connections: rows.map(rowToView),
		inherited: inheritedReach?.list() ?? [],
	};
}

export type CreateConnectionResult =
	| { readonly ok: true; readonly connection: ServiceConnectionView }
	| { readonly ok: false; readonly code: "MISSING_ROOT_SECRET" }
	| { readonly ok: false; readonly code: "DUPLICATE_CONNECTION" };

/** `connections.add` — validated body already parsed by the caller; encrypts a token, derives an mcp service name. */
export async function createConnectionForUser(
	db: HyperIdleDb,
	userId: string,
	body: CreateConnectionInput,
	encrypt: (plaintext: string) => string,
): Promise<CreateConnectionResult> {
	const now = new Date().toISOString();
	const id = `sc-${crypto.randomUUID()}`;

	if (body.authSource === "token") {
		let encryptedToken: string;
		try {
			encryptedToken = encrypt(body.token);
		} catch {
			return { ok: false, code: "MISSING_ROOT_SECRET" };
		}
		try {
			await insertConnection(db, {
				id,
				userId,
				service: body.service,
				authSource: "token",
				encryptedToken,
				serverUrl: null,
				health: "needs-attention",
				lastValidatedAt: null,
				createdAt: now,
				updatedAt: now,
			});
		} catch (err) {
			if (isUniqueViolation(err)) return { ok: false, code: "DUPLICATE_CONNECTION" };
			throw err;
		}
	} else {
		const service = body.service ?? deriveServiceFromUrl(body.serverUrl);
		try {
			await insertConnection(db, {
				id,
				userId,
				service,
				authSource: "mcp",
				encryptedToken: null,
				serverUrl: body.serverUrl,
				health: "needs-attention",
				lastValidatedAt: null,
				createdAt: now,
				updatedAt: now,
			});
		} catch (err) {
			if (isUniqueViolation(err)) return { ok: false, code: "DUPLICATE_CONNECTION" };
			throw err;
		}
	}

	const [row] = await listConnections(db, { id });
	if (!row) throw new Error("Failed to retrieve created connection");
	return { ok: true, connection: rowToView(row) };
}

export type RemoveConnectionResult =
	| { readonly ok: true }
	| { readonly ok: false; readonly code: "NOT_FOUND" };

/** `connections.remove` — cross-user, non-existent and `inherited:` ids all resolve NOT_FOUND, never leak existence. */
export async function removeConnectionForUser(
	db: HyperIdleDb,
	userId: string,
	id: string,
): Promise<RemoveConnectionResult> {
	if (id.startsWith("inherited:")) return { ok: false, code: "NOT_FOUND" };
	const [existing] = await listConnections(db, { id, userId });
	if (!existing) return { ok: false, code: "NOT_FOUND" };
	await deleteConnection(db, { id, userId });
	return { ok: true };
}

// @lore drizzle-orm 0.45.2: wraps PGlite errors — outer message is "Failed query: …",
// original error (with code 23505 and "duplicate key" message) is in err.cause.
// Walk the cause chain to find the real constraint error.
function isUniqueViolation(err: unknown): boolean {
	if (!(err instanceof Error)) return false;
	const check = (e: unknown): boolean => {
		if (!(e instanceof Error)) return false;
		const msg = e.message.toLowerCase();
		const isMatch =
			msg.includes("unique") ||
			msg.includes("duplicate") ||
			msg.includes("constraint") ||
			("code" in e && (e as { code?: string }).code === "23505");
		if (isMatch) return true;
		if (e.cause !== undefined) return check(e.cause);
		return false;
	};
	return check(err);
}
