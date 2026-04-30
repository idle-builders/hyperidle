// L3 review fix D-B5 — bridge from L3 Artifact primitive to the existing
// ArtifactView renderer. Lives in `packages/web/src/shell` because it
// composes ArtifactView (which is shell-tier) and is consumed by the
// review-message host that injects an ArtifactEmbed `viewSlot`.

import type { Artifact } from "@hyperidle/shared";
import type { JSX } from "react";
import { ArtifactView, type ArtifactViewProps } from "./ArtifactView.js";

/**
 * @lore L3 D-B5: maps a recognised L3 `ArtifactPreview` to the closed
 * `ArtifactViewProps` discriminated union (5 shapes). Returns null when no
 * mapping exists — caller (ArtifactEmbed) then falls back to the inline
 * `summarizePreview` string. The mapping is intentionally narrow: we only
 * map the kinds that have an obviously-correct shape today. New mappings
 * land alongside the consuming story (L11 review message) so the user value
 * is verified end-to-end before we widen the surface.
 */
export function artifactToViewProps(artifact: Artifact): ArtifactViewProps | null {
	const preview = artifact.preview;
	if (!preview) return null;
	switch (preview.kind) {
		case "code_diff":
			return {
				shape: "text_diff",
				data: {
					hunks: preview.hunks.map((h) => ({
						header: h.header,
						lines: h.lines.map((l) => ({
							type: l.kind === "add" ? "addition" : l.kind === "del" ? "deletion" : "context",
							content: l.text,
						})),
					})),
				},
			};
		case "data_analysis":
			return {
				shape: "action_summary",
				data: {
					actions: preview.findings.map((f, i) => ({
						label: `Finding ${i + 1}`,
						value: f,
					})),
				},
			};
		case "dashboard":
			return {
				shape: "data_metrics",
				data: { headlines: preview.metrics, charts: [] },
			};
		default:
			return null;
	}
}

/** Convenience — returns the `<ArtifactView>` element or null. */
export function renderArtifactView(artifact: Artifact): JSX.Element | null {
	const props = artifactToViewProps(artifact);
	if (!props) return null;
	return <ArtifactView {...props} />;
}
