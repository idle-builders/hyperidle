// Connections — read/write for a user's `service_connections`, unioned with inherited reach projections.
// Security model: every query scoped on userId; cross-user / non-existent → NOT_FOUND, never leaks;
// tokens stored AES-256-GCM encrypted, never returned; encryptedToken NEVER appears in any response.

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

// SSRF guard: blocks private IP literals at input time.
// @lore: SSRF — IP literals blocked here; DNS-rebinding (public hostname → private IP) deferred to outbound-client scope
function isBlockedUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		return isPrivateHostLiteral(parsed.hostname);
	} catch {
		return true; // unparseable → blocked
	}
}

// Exported so `agent-orchestration-intake.ts` validates `connections.add` body against the same schema.
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

// Derive the `via` display string. Server-constructed, never a raw secret echo.
// @lore: `via` is always server-constructed — token → "API key · stored encrypted"; mcp → hostname of server URL
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

// Cast a raw DB health string to the closed 2-set; falls back to "needs-attention".
function toHealth(raw: string): ConnectionHealth {
	if (raw === "working" || raw === "needs-attention") return raw;
	return "needs-attention";
}

// Build the public ServiceConnectionView; NEVER includes encryptedToken or serverUrl.
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

// Derive service name from serverUrl when omitted; strips "mcp." prefix.
// @lore: derivation is deterministic — affects the (userId, service, authSource) unique constraint
function deriveServiceFromUrl(serverUrl: string): string {
	try {
		const host = new URL(serverUrl).hostname;
		// Strip "mcp." prefix
		return host.startsWith("mcp.") ? host.slice(4) : host;
	} catch {
		return serverUrl;
	}
}

// ---------------------------------------------------------------------------
// Extracted logic — called through `AgentOrchestrationPort`'s connections seam
// ---------------------------------------------------------------------------

// `connections.list` — held rows union inherited projections; two arrays so the caller can tell them apart.
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

// `connections.add` — body already validated; encrypts token, derives mcp service name.
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

// `connections.remove` — cross-user, non-existent, and inherited: ids all resolve NOT_FOUND, never leak existence.
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

// @lore: drizzle-orm — wraps PGlite errors; outer message is "Failed query:…"; walk cause chain for the real constraint error
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
