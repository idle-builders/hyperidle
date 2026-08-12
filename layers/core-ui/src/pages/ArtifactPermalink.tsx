// L3 — ArtifactPermalink: single_full_preview surface for /artifacts/:id.
// Source: plans/L3/architecture.md §6.5.
//
// @lore L18: HostThreadSection added below ArtifactPreview. hostKind="artifact",
// hostId=data.id. Padding changed from p-6 to p-3 per L18 architecture.
//
// @lore AZ2: the second real defect the audit missed (round.md §2.4) — this
// page had NO scaffold at all (no root height, no scroll region; shape E in
// the probe). A long artifact plus its discussion thread had no way to
// reach the tail. All four branches now wrap in <PageScaffold>, header-less —
// a page title here is a content decision this work package does not own.

import { ArtifactPreview, EmptyState, ErrorState, PageScaffold } from "@hyperidle/design-system";
import type { JSX } from "react";
import { useParams } from "react-router-dom";
import { useArtifact } from "../hooks/useArtifacts.js";
import { HostThreadSection } from "../shell/HostThreadSection.js";
import { sanitizeHtml } from "../utils/sanitize-html.js";

export function ArtifactPermalink(): JSX.Element {
	const { id = "" } = useParams<{ id: string }>();
	const { data, error, isLoading } = useArtifact(id);

	if (isLoading) {
		return (
			<PageScaffold>
				<div className="p-3 text-[var(--text-secondary)]">Loading…</div>
			</PageScaffold>
		);
	}
	if (error || !data) {
		if (error?.includes("404")) {
			return (
				<PageScaffold>
					<div className="p-3">
						<EmptyState title="Artifact not found" description="No artifact exists at this id." />
					</div>
				</PageScaffold>
			);
		}
		return (
			<PageScaffold>
				<div className="p-3">
					<ErrorState title="Failed to load artifact" description={error ?? "Unknown error"} />
				</div>
			</PageScaffold>
		);
	}

	return (
		<PageScaffold>
			<div className="p-3 flex flex-col gap-3">
				<ArtifactPreview data={data} sanitizeHtml={sanitizeHtml} />
				<HostThreadSection hostKind="artifact" hostId={data.id} title="Discussion" />
			</div>
		</PageScaffold>
	);
}
