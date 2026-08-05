// AF16 T9/T10/T11 — ArtifactPreviewSurface updated to dispatch through renderer-registry for full size.
//
// @lore AF16 T9: getRenderer moved from layers/core-ui/src/kinds/ to this package.
// @lore AF16 T10: full size dispatches via getRenderer(kind) — images render as <img>,
//   code as code blocks, etc. gallery size stays on summarize() text path (thumbnails).
// @lore AF16 T11: null/error/malformed preview all collapse to one honest affordance
//   "No preview available" (full) / "No preview" (gallery). PlaceholderText "PREVIEW NOT YET RENDERED"
//   and "PREVIEW PENDING" removed — those were dishonest (a render may never come).
// @lore AE6: Replaced 12-case switch with getKindDefinition().summarize() for gallery path.
//   Unregistered kinds get a generic "no preview" placeholder in the full path via FallbackRenderer.
// AM5: replaced getRenderer(kind) with composeArtifactBody(kind,preview) (K2/K5).
// The kind-renderer layer is removed; Artifact (single) composes base primitives directly.
// @lore AM5 K5: getRenderer + renderer-registry.ts + kinds/*-renderer.tsx DELETED.
// composeArtifactBody is the single-home Artifact composition over block payloads.
import { getKindDefinition } from "@hyperidle/shared";
import { Component, type JSX, type ReactNode } from "react";
import { dsProps } from "./ds-attrs.js";
import { composeArtifactBody } from "./kinds/compose-artifact-body.js";

export interface ArtifactPreviewSurfaceProps {
	kind: string;
	preview: unknown;
	size?: "gallery" | "full";
}

const SURFACE_BASE =
	"bg-[var(--surface-container)] rounded-[var(--r-subtle)] p-[12px] flex items-center justify-center text-[var(--text-tertiary)] font-mono text-[11px] tracking-[var(--tracking-caps-sm)] uppercase";
const SURFACE_GALLERY = "min-h-[96px]";
const SURFACE_FULL = "min-h-[240px]";

/** Honest no-preview affordance — replaces "PREVIEW NOT YET RENDERED" / "PREVIEW PENDING". */
function NoPreviewText({ size }: { size: "gallery" | "full" }): JSX.Element {
	return <>{size === "full" ? "No preview available" : "No preview"}</>;
}

/**
 * Error boundary wrapping the full-size renderer dispatch.
 * On error or missing preview, falls back to NoPreviewText.
 *
 * @lore AF16 T11 WARNING-4: a renderer that throws (e.g. malformed preview)
 * collapses to the same "No preview available" affordance as null preview.
 * No separate error chrome — this is the honest, unified fallback.
 */
interface RendererErrorBoundaryProps {
	kind: string;
	size: "gallery" | "full";
	children: ReactNode;
}
interface RendererErrorBoundaryState {
	hasError: boolean;
}
class RendererErrorBoundary extends Component<
	RendererErrorBoundaryProps,
	RendererErrorBoundaryState
> {
	constructor(props: RendererErrorBoundaryProps) {
		super(props);
		this.state = { hasError: false };
	}
	static getDerivedStateFromError(): RendererErrorBoundaryState {
		return { hasError: true };
	}
	render(): ReactNode {
		if (this.state.hasError) {
			return <NoPreviewText size={this.props.size} />;
		}
		return this.props.children;
	}
}

/**
 * Render the body content.
 *
 * Full size: dispatch through getRenderer(kind) for visual rendering.
 *   - null/undefined preview → NoPreviewText
 *   - renderer dispatch wrapped in error boundary (throws → NoPreviewText)
 *
 * Gallery size: summarize() text path (unchanged — thumbnails are summaries).
 */
function renderBody(kind: string, preview: unknown, size: "gallery" | "full"): JSX.Element {
	if (size === "full") {
		if (preview == null) {
			return <NoPreviewText size="full" />;
		}
		return (
			<RendererErrorBoundary kind={kind} size="full">
				{composeArtifactBody(kind, preview)}
			</RendererErrorBoundary>
		);
	}

	// gallery path — keep summarize() text (thumbnails stay summaries)
	if (preview == null) {
		return <NoPreviewText size="gallery" />;
	}
	const def = getKindDefinition(kind);
	if (def) {
		const summary = def.summarize(preview);
		if (summary) return <span>{summary}</span>;
		return <NoPreviewText size="gallery" />;
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
	// full size uses items-start for renderer content (images, code blocks may be tall)
	const alignClass = size === "full" ? "items-start" : "items-center";
	return (
		<div
			{...dsProps("ArtifactPreviewSurface", "1")}
			className={`${SURFACE_BASE} ${sizeClass} ${alignClass}`}
			data-size={size}
			data-kind={kind}
		>
			{renderBody(kind, preview, size)}
		</div>
	);
}
