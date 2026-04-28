// L3 — single hook for /api/artifacts with axis discriminant.
// Source: docs/architecture-plans/L3.md §6.5.

import type { Artifact, ArtifactFilterAxis, ArtifactPage } from "@hyperidle/shared";
import { useEffect, useState } from "react";

interface ArtifactsState {
	data: ArtifactPage | null;
	error: string | null;
	isLoading: boolean;
}

function buildUrl(filter: ArtifactFilterAxis): string {
	const params = new URLSearchParams({ axis: filter.axis });
	if (filter.axis === "task") params.set("taskId", filter.taskId);
	else if (filter.axis === "bet") params.set("betId", filter.betId);
	else if (filter.axis === "product") params.set("productId", filter.productId);
	return `/api/artifacts?${params.toString()}`;
}

export function useArtifacts(filter: ArtifactFilterAxis): ArtifactsState {
	const [state, setState] = useState<ArtifactsState>({
		data: null,
		error: null,
		isLoading: true,
	});

	useEffect(() => {
		let cancelled = false;
		setState({ data: null, error: null, isLoading: true });
		fetch(buildUrl(filter))
			.then((res) => {
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				return res.json() as Promise<ArtifactPage>;
			})
			.then((data) => {
				if (!cancelled) setState({ data, error: null, isLoading: false });
			})
			.catch((err: unknown) => {
				if (!cancelled) {
					setState({
						data: null,
						error: err instanceof Error ? err.message : String(err),
						isLoading: false,
					});
				}
			});
		return (): void => {
			cancelled = true;
		};
	}, [filter]);

	return state;
}

interface SingleArtifactState {
	data: Artifact | null;
	error: string | null;
	isLoading: boolean;
}

export function useArtifact(id: string): SingleArtifactState {
	const [state, setState] = useState<SingleArtifactState>({
		data: null,
		error: null,
		isLoading: true,
	});

	useEffect(() => {
		let cancelled = false;
		setState({ data: null, error: null, isLoading: true });
		fetch(`/api/artifacts/${encodeURIComponent(id)}`)
			.then((res) => {
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				return res.json() as Promise<Artifact>;
			})
			.then((data) => {
				if (!cancelled) setState({ data, error: null, isLoading: false });
			})
			.catch((err: unknown) => {
				if (!cancelled) {
					setState({
						data: null,
						error: err instanceof Error ? err.message : String(err),
						isLoading: false,
					});
				}
			});
		return (): void => {
			cancelled = true;
		};
	}, [id]);

	return state;
}
