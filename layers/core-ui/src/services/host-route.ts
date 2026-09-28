import type { HostKind } from "@hyperidle/domain-model";

// @lore: RouteHostKind — "task" not in HOST_KINDS but still a navigable page (/work/task/:id) and EntityRef.kind; do not conflate with thread HostKind
export type RouteHostKind = HostKind | "task";

export function resolveHostRoute(hostKind: RouteHostKind, hostId: string): string | null {
	switch (hostKind) {
		case "task":
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
