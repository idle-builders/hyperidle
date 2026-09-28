import type { HostKind } from "@hyperidle/domain-model";

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
