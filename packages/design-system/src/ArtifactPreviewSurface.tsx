// AE6: ArtifactPreviewSurface updated to use Kind Definition registry.
// @lore AE6: Replaced 12-case switch with getKindDefinition().summarize() lookup.
// Unregistered kinds get a generic "no preview" placeholder.
// @lore AE6: kind and preview widened from ArtifactKind/ArtifactPreview to string/unknown.
import { getKindDefinition } from "@hyperidle/shared";
import type { JSX } from "react";
import { dsProps } from "./ds-attrs.js";

export interface ArtifactPreviewSurfaceProps {
	kind: string;
	preview: unknown;
	size?: "gallery" | "full";
}

const SURFACE_BASE =
	"bg-[var(--surface-container)] rounded-[var(--r-subtle)] p-[12px] flex items-center justify-center text-[var(--text-tertiary)] font-mono text-[11px] tracking-[0.02em] uppercase";
const SURFACE_GALLERY = "min-h-[96px]";
const SURFACE_FULL = "min-h-[240px]";

function PlaceholderText({ size }: { size: "gallery" | "full" }): JSX.Element {
	return <>{size === "full" ? "PREVIEW NOT YET RENDERED" : "PREVIEW PENDING"}</>;
}

function renderBody(kind: string, preview: unknown, size: "gallery" | "full"): JSX.Element {
	if (!preview) {
		return <PlaceholderText size={size} />;
	}

	const def = getKindDefinition(kind);
	if (def) {
		const summary = def.summarize(preview);
		if (summary) return <span>{summary}</span>;
		return <PlaceholderText size={size} />;
	}

	// Unregistered kind: show kind label as fallback
	return <span>{kind}: preview not available</span>;
}

export function ArtifactPreviewSurface({
	kind,
	preview,
	size = "gallery",
}: ArtifactPreviewSurfaceProps): JSX.Element {
	const sizeClass = size === "full" ? SURFACE_FULL : SURFACE_GALLERY;
	return (
		<div
			{...dsProps("ArtifactPreviewSurface", "1")}
			className={`${SURFACE_BASE} ${sizeClass}`}
			data-size={size}
			data-kind={kind}
		>
			{renderBody(kind, preview, size)}
		</div>
	);
}
