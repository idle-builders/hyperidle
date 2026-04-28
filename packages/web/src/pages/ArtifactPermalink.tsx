// L3 — ArtifactPermalink: single_full_preview surface for /artifacts/:id.
// Source: docs/architecture-plans/L3.md §6.5.

import { ArtifactPreview, EmptyState, ErrorState } from "@hyperidle/design-system";
import type { JSX } from "react";
import { useParams } from "react-router-dom";
import { useArtifact } from "../hooks/useArtifacts.js";

export function ArtifactPermalink(): JSX.Element {
	const { id = "" } = useParams<{ id: string }>();
	const { data, error, isLoading } = useArtifact(id);

	if (isLoading) {
		return <div className="p-6 text-[var(--text-mid)]">Loading…</div>;
	}
	if (error || !data) {
		if (error?.includes("404")) {
			return (
				<div className="p-6">
					<EmptyState
						title="Artifact not found"
						description="No artifact exists at this id."
					/>
				</div>
			);
		}
		return (
			<div className="p-6">
				<ErrorState
					title="Failed to load artifact"
					description={error ?? "Unknown error"}
				/>
			</div>
		);
	}

	return (
		<div className="p-6">
			<ArtifactPreview data={data} />
		</div>
	);
}
