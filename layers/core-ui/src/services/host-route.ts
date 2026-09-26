/**
 * Host route resolution utility.
 *
 * Maps a (hostKind, hostId) pair to a client-side route path.
 * Returns null for host kinds that don't have navigable pages (user, factory).
 */

import type { HostKind } from "@hyperidle/domain-model";

/**
 * @lore BC3: `"task"` left the thread `HOST_KINDS` vocabulary — a task's own
 * thread is `team`-hosted now (architecture.md §3.9) — but a task is still a
 * real navigable page (`/work/task/:id`) and `EntityRef.kind` still names it
 * (a block/entity ref, not a thread host). This routing vocabulary is
 * `HostKind` plus `"task"` for exactly that reason; do not conflate it with
 * the thread module's own `HostKind`.
 */
export type RouteHostKind = HostKind | "task";

/**
 * Resolve a (hostKind, hostId) pair to a client-side route path.
 * Returns null for host kinds that don't have navigable pages (user, factory).
 *
 * @lore AE5: "user" and "factory" host kinds return null — DM and feed threads
 * are "self-referential" in the sense that the host IS the user or the global factory.
 * There's no separate navigable entity to link to for these host kinds.
 */
export function resolveHostRoute(hostKind: RouteHostKind, hostId: string): string | null {
	switch (hostKind) {
		case "task":
			// @lore BB1: this used to return null with a note that it could not
			// build the route, because `/work/bet/:betId/task/:taskId` needed a
			// betId this function never had. There is no parent to thread now —
			// one task route at any depth — so the documented no-op is fixed.
			return `/work/task/${hostId}`;
		case "document":
			return `/documents/${hostId}`;
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
