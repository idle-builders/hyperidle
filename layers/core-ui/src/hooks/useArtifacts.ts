// L3 — single hook for /api/artifacts with axis discriminant.
//
// L12: optional `query` parameter adds limit to the URL.

import type {
	Artifact,
	ArtifactFilterAxis,
	ArtifactPage,
	ArtifactQuery,
} from "@hyperidle/domain-model";
import { type FetchState, useFetch } from "./useFetch.js";

function buildUrl(filter: ArtifactFilterAxis, query?: Pick<ArtifactQuery, "limit">): string {
	const params = new URLSearchParams({ axis: filter.axis });
	if (filter.axis === "task") params.set("taskId", filter.taskId);
	else if (filter.axis === "bet") params.set("betId", filter.betId);
	// @lore U1: `productId` → `teamId` in ArtifactFilterAxis and server query param.
	else if (filter.axis === "product") params.set("teamId", filter.teamId);
	if (query?.limit !== undefined) params.set("limit", String(query.limit));
	return `/api/artifacts?${params.toString()}`;
}

export function useArtifacts(
	filter: ArtifactFilterAxis,
	query?: Pick<ArtifactQuery, "limit">,
): FetchState<ArtifactPage> {
	return useFetch<ArtifactPage>(buildUrl(filter, query));
}

export function useArtifact(id: string): FetchState<Artifact> {
	return useFetch<Artifact>(`/api/artifacts/${encodeURIComponent(id)}`);
}
