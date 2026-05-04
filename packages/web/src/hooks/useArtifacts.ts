// L3 — single hook for /api/artifacts with axis discriminant.
// Source: plans/architecture/L3.md §6.5.

import type { Artifact, ArtifactFilterAxis, ArtifactPage } from "@hyperidle/shared";
import { type FetchState, useFetch } from "./useFetch.js";

function buildUrl(filter: ArtifactFilterAxis): string {
	const params = new URLSearchParams({ axis: filter.axis });
	if (filter.axis === "task") params.set("taskId", filter.taskId);
	else if (filter.axis === "bet") params.set("betId", filter.betId);
	else if (filter.axis === "product") params.set("productId", filter.productId);
	return `/api/artifacts?${params.toString()}`;
}

export function useArtifacts(filter: ArtifactFilterAxis): FetchState<ArtifactPage> {
	return useFetch<ArtifactPage>(buildUrl(filter));
}

export function useArtifact(id: string): FetchState<Artifact> {
	return useFetch<Artifact>(`/api/artifacts/${encodeURIComponent(id)}`);
}
