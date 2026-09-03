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
		case "task":
			// @lore BB1: this used to return null with a note that it could not
			// build the route, because `/work/bet/:betId/task/:taskId` needed a
			// betId this function never had. There is no parent to thread now —
			// one task route at any depth — so the documented no-op is fixed.
			return `/work/task/${hostId}`;
		case "knowledge_item":
			return `/knowledge/${hostId}`;
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
