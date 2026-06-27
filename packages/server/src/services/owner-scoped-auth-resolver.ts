/**
 * AO2 §3 — Detached-safe FilesystemAuthResolver seam impl.
 *
 * Resolves a forge token by looking up the CONNECTION's owning userId from
 * `service_connections.userId`, then delegating to the existing
 * `ServiceConnectionResolver.resolve(userId, id)` — the ONE plaintext path.
 *
 * WHY a second impl (not the AO1 ServiceConnectionResolverAdapter):
 *   The AO1 adapter binds `userId` at construction from `c.get("userId")` —
 *   request-bound, unusable in the detached `admitSession` run.
 *   AO2 runs DETACHED: no HTTP request, no per-request userId in scope.
 *   The connection row IS the source of the owning userId.
 *
 * @lore AO2 §3: No new method on ServiceConnectionResolver — the owner→token
 * lookup lives HERE in the seam impl, reusing resolve(userId, id) unchanged.
 * AN2 subsumes by swapping this seam impl behind the same FilesystemAuthResolver
 * interface.
 *
 * @lore AO2 §3 Security: the plaintext path stays ServiceConnectionResolver.resolve
 * (unchanged). OwnerScopedAuthResolver is wired EXCLUSIVELY mounter→sandbox-git-config,
 * never to a route response or logger. No cross-tenant guard — server-side provisioning
 * of a Connection the team's founder bound to the team's filesystem; single-founder,
 * team-scoped. Security earned from learnings (ETHOS), not preemptive.
 */

import { type HyperIdleDb, serviceConnections } from "@hyperidle/db";
import { eq } from "drizzle-orm";
import type { FilesystemAuth, FilesystemAuthResolver } from "@hyperidle/shared";
import type { ServiceConnectionResolver } from "./service-connection-resolver.js";

export class OwnerScopedAuthResolver implements FilesystemAuthResolver {
	constructor(
		private readonly deps: {
			db: HyperIdleDb;
			resolver: ServiceConnectionResolver;
		},
	) {}

	/**
	 * Resolve the raw decrypted token by looking up the connection's owning userId.
	 * Returns null on any failure — never throws.
	 */
	async resolveToken(connectionId: string): Promise<string | null> {
		try {
			const [row] = await this.deps.db
				.select({ userId: serviceConnections.userId })
				.from(serviceConnections)
				.where(eq(serviceConnections.id, connectionId))
				.limit(1);

			if (!row) return null;

			// Delegate to the one plaintext path — resolve(userId, id).
			// No new method on ServiceConnectionResolver.
			return await this.deps.resolver.resolve(row.userId, connectionId);
		} catch {
			return null;
		}
	}

	/**
	 * Full resolution for mount: returns a FilesystemAuth shape.
	 * provision.mode is always 'none' here because the seam doesn't have the
	 * remote host context (keyed on connectionId only). The mounter enriches the
	 * host from resourceRef.repo and calls resolveToken() separately to project
	 * into the sandbox git config.
	 *
	 * @lore AO2 §3: provision.mode:'none' from the seam; the mounter builds the
	 * git-credential directive itself using the host it owns from resourceRef.
	 */
	async resolve(connectionId: string): Promise<FilesystemAuth | null> {
		// We need to check the connection exists before returning a FilesystemAuth.
		const token = await this.resolveToken(connectionId);
		// If the connection doesn't exist or doesn't resolve, return null.
		// For connections that exist but have no token (e.g. mcp), resolveToken
		// returns null — treat as unresolvable.
		if (token === null) {
			// But we still need to return a shape if the connection ROW exists (resolve != null
			// just means "can't get plaintext"). Check if the row exists.
			try {
				const [row] = await this.deps.db
					.select({ id: serviceConnections.id })
					.from(serviceConnections)
					.where(eq(serviceConnections.id, connectionId))
					.limit(1);
				if (!row) return null;
				// Row exists but token null (mcp connection, decrypt failure, wrong key) —
				// return the shape with mode:none so the mounter can skip auth projection.
				return { connectionId, provision: { mode: "none" } };
			} catch {
				return null;
			}
		}
		return { connectionId, provision: { mode: "none" } };
	}

	/**
	 * Cheap check: true if the connection exists AND the token resolves.
	 * Used by the reachability path (AO1).
	 */
	async canResolve(connectionId: string): Promise<boolean> {
		const token = await this.resolveToken(connectionId);
		return token !== null;
	}

	/**
	 * Always null — the seam is keyed on connectionId only; the host
	 * comes from resourceRef.repo (mounter's concern, not resolver's).
	 *
	 * @lore AO2 §3: sourceOf is null because the seam doesn't have the
	 * connection row's service field in scope (only userId lookup). The
	 * register route falls back to sourceHint when this returns null.
	 */
	sourceOf(_connectionId: string): null {
		return null;
	}
}
