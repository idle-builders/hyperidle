/**
 * AE5 — Host route resolution utility.
 *
 * Maps a (hostKind, hostId) pair to a client-side route path.
 * Returns null for host kinds that don't have navigable pages (user, factory).
 */

import type { HostKind } from "@hyperidle/domain-model";

/**
 * Resolve a (hostKind, hostId) pair to a client-side route path.
 * Returns null for host kinds that don't have navigable pages (user, factory).
 *
 * @lore AE5: "user" and "factory" host kinds return null — DM and feed threads
 * are "self-referential" in the sense that the host IS the user or the global factory.
 * There's no separate navigable entity to link to for these host kinds.
 */
export function resolveHostRoute(hostKind: HostKind, hostId: string): string | null {
	switch (hostKind) {
		case "bet":
			return `/work/bet/${hostId}`;
		case "task":
			// @lore AM5 H5/BLOCKER-1: task→null (no betId in scope for resolveHostRoute).
			// The route /work/bet/:betId/task/:taskId requires a betId not available here.
			// Documented no-op — will be resolved in a future WP that threads betId.
			return null;
		case "knowledge_item":
			return `/knowledge/${hostId}`;
		case "artifact":
			// @lore AM5 H5: artifact route fixed from dead /work/artifact/:id to /artifacts/:id.
			return `/artifacts/${hostId}`;
		case "agent":
			return `/agents/${hostId}`;
		case "team":
			return `/work/team/${hostId}`;
		case "user":
			return null;
		case "factory":
			return null;
	}
}
