// L3 — ArtifactPermalink: single_full_preview surface for /artifacts/:id.
// Source: plans/L3/architecture.md §6.5.
//
// @lore L18: HostThreadSection added below ArtifactPreview. hostKind="artifact",
// hostId=data.id. Padding changed from p-6 to p-3 per L18 architecture.

import { ArtifactPreview, EmptyState, ErrorState } from "@hyperidle/design-system";
import type { JSX } from "react";
import { useParams } from "react-router-dom";
import { useArtifact } from "../hooks/useArtifacts.js";
import { HostThreadSection } from "../shell/HostThreadSection.js";

export function ArtifactPermalink(): JSX.Element {
	const { id = "" } = useParams<{ id: string }>();
	const { data, error, isLoading } = useArtifact(id);

	if (isLoading) {
		return <div className="p-3 text-[var(--text-secondary)]">Loading…</div>;
	}
	if (error || !data) {
		if (error?.includes("404")) {
			return (
				<div className="p-3">
					<EmptyState title="Artifact not found" description="No artifact exists at this id." />
				</div>
			);
		}
		return (
			<div className="p-3">
				<ErrorState title="Failed to load artifact" description={error ?? "Unknown error"} />
			</div>
		);
	}

	return (
		<div className="p-3 flex flex-col gap-3">
			<ArtifactPreview data={data} />
			<HostThreadSection hostKind="artifact" hostId={data.id} title="Discussion" />
		</div>
	);
}
