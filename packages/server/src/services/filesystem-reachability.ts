// AO1 — Filesystem reachability: pure function + NoopAuthResolver.
// Source of truth: plans/AO1/architecture.md §3 (reachability block) + §4 (seam).

import type { FilesystemAuth, FilesystemAuthResolver, FilesystemState } from "@hyperidle/shared";

// ─── NoopAuthResolver ────────────────────────────────────────────────────────

/**
 * Default binding. Reports every connectionId unresolvable (→ needs_attention).
 * Ships until AN merges and registers a real resolver.
 *
 * @lore AO1 §3 WARN-3: With this Noop resolver, every connection-backed filesystem
 * (connectionId non-null, writeback:'git') permanently shows needs_attention in v1.
 * This is concept-correct ("surface, never silent"). It clears the moment AN registers
 * a real resolver — without any change to AO1.
 */
export class NoopAuthResolver implements FilesystemAuthResolver {
	canResolve(_connectionId: string): boolean {
		return false;
	}

	sourceOf(_connectionId: string): null {
		return null;
	}

	resolve(_connectionId: string): Promise<FilesystemAuth | null> {
		return Promise.resolve(null);
	}
}

// ─── Row shape accepted by resolveFilesystemState ────────────────────────────

/** Minimal filesystem row fields needed for reachability resolution. */
export interface FilesystemReachabilityInput {
	id: string;
	teamId: string;
	source: string;
	kind: string;
	connectionId: string | null;
	resourceRef: string;
	writeback: string;
	state: string;
	createdAt: string;
}

// ─── resolveFilesystemState ──────────────────────────────────────────────────

/**
 * Pure reachability check. Resolves the state for a filesystem row.
 *
 * Logic (plans/AO1/architecture.md §3):
 *   writeback:'none'        → 'reachable'   (read-only ref, nothing to auth)
 *   connectionId null       → 'reachable'   (bare local path, local-first)
 *   connectionId + resolver → resolved ? 'reachable' : 'needs_attention'
 *
 * v1: structural, NOT a live git ls-remote. Forge round-trips need the sandbox
 * creds (AO2). This is deliberate — AO1 must not hold forge credentials.
 *
 * @lore AO1 §3: "surface, never silent" — an unresolvable connection MUST surface
 * as needs_attention, never silently pass.
 */
export async function resolveFilesystemState(
	row: FilesystemReachabilityInput,
	deps: { authResolver: FilesystemAuthResolver },
): Promise<FilesystemState> {
	// Read-only reference: nothing to auth, always reachable.
	if (row.writeback === "none") {
		return "reachable";
	}

	// Bare local path (no Connection): local-first, always reachable in v1.
	if (row.connectionId == null) {
		return "reachable";
	}

	// Connection-backed: ask the seam whether the connection resolves.
	// Structural check only (no network) in AO1.
	const resolved = await deps.authResolver.canResolve(row.connectionId);
	return resolved ? "reachable" : "needs_attention";
}
