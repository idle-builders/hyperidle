// L3 — ArtifactPermalink: single_full_preview surface for /artifacts/:id.
// Source: plans/L3/architecture.md §6.5.
//
// @lore L18: HostThreadSection added below ArtifactPreview. hostKind="artifact",
// hostId=data.id. Padding changed from p-6 to p-3 per L18 architecture.
//
// @lore AZ2: the second real defect the audit missed (round.md §2.4) — this
// page had NO scaffold at all (no root height, no scroll region; shape E in
// the probe). A long artifact plus its discussion thread had no way to
// reach the tail. All four branches now wrap in a scrolling PageScaffold.

import {
	ArtifactPreview,
	Breadcrumb,
	EmptyState,
	ErrorState,
	headingIdentityMatches,
	PageHeader,
	PageScaffold,
} from "@hyperidle/design-system";
import { artifactDisplayTitle } from "@hyperidle/domain-model";
import type { JSX } from "react";
import { Link as RRLink, useParams } from "react-router-dom";
import { useArtifact } from "../hooks/useArtifacts.js";
import { HostThreadSection } from "../shell/HostThreadSection.js";
import { sanitizeHtml } from "../utils/sanitize-html.js";

export function ArtifactPermalink({ overrideId }: { overrideId?: string } = {}): JSX.Element {
	const { id: routeId = "" } = useParams<{ id: string }>();
	const id = overrideId ?? routeId;
	const { data, error, isLoading } = useArtifact(id);

	if (isLoading) {
		return (
			<PageScaffold header={<PageHeader title="Artifact" />}>
				<div className="p-3 text-[var(--text-secondary)]">Loading…</div>
			</PageScaffold>
		);
	}
	if (error || !data) {
		if (error?.includes("404")) {
			return (
				<PageScaffold header={<PageHeader title="Artifact" />}>
					<div className="p-3">
						<EmptyState title="Artifact not found" description="No artifact exists at this id." />
					</div>
				</PageScaffold>
			);
		}
		return (
			<PageScaffold header={<PageHeader title="Artifact" />}>
				<div className="p-3">
					<ErrorState title="Failed to load artifact" description={error ?? "Unknown error"} />
				</div>
			</PageScaffold>
		);
	}

	const title = artifactDisplayTitle(data);
	const taskIsTitle = headingIdentityMatches(data.producingTaskTitle, title);
	return (
		<PageScaffold
			header={
				<PageHeader
					title={title}
					leading={
						<Breadcrumb
							segments={[
								{ label: "Work", to: "/work" },
								...(!taskIsTitle ? [{ label: data.producingTaskTitle }] : []),
								{ label: title },
							]}
							LinkComponent={RRLink}
						/>
					}
				/>
			}
		>
			<div className="p-3 flex flex-col gap-3">
				<ArtifactPreview data={data} sanitizeHtml={sanitizeHtml} showTitle={false} />
				<HostThreadSection hostKind="artifact" hostId={data.id} title="Discussion" />
			</div>
		</PageScaffold>
	);
}
