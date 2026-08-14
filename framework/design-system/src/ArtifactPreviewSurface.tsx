// The panel an artifact is shown in.
//
// @lore AZ6: this panel used to declare content typography for itself —
// `font-mono text-[11px] uppercase tracking-… text-[var(--text-tertiary)]` plus
// `justify-center`, written for the short "No preview" caption. Those classes
// inherit, so every artifact rendered inside them came out uppercase, monospace
// and floated into the middle of the panel regardless of what it was. The caption
// treatment now lives ON the caption; the panel contributes surface only. If you
// are adding a typographic class to SURFACE_CHROME, you are re-opening that bug —
// add it to CAPTION or to the element that needs it.
//
// @lore AZ6: the `full` path takes a `sanitizeHtml` through a props union rather
// than an optional prop. A missing sanitiser used to degrade silently to the
// unknown-block stripe, which is exactly how the flagship kind ended up rendering
// as its own source; now it is a type error at the call site.
//
// @lore AF16 T11: null/error/malformed preview all collapse to one honest
// affordance, "No preview available" (full) / "No preview" (gallery).
// @lore AM5 K5: getRenderer + renderer-registry.ts + kinds/*-renderer.tsx deleted;
// composeArtifactBody is the single-home Artifact composition over block payloads.
import { getKindDefinition } from "@hyperidle/domain-model";
import { Component, type JSX, type ReactNode } from "react";
import { dsProps } from "./ds-attrs.js";
import { composeArtifactBody } from "./kinds/compose-artifact-body.js";

interface ArtifactPreviewSurfaceBase {
	kind: string;
	preview: unknown;
	documentTitle?: string;
}

/**
 * A full-size preview may contain prose, and prose may contain HTML, so it cannot
 * be constructed without the app's sanitiser. A gallery preview is a one-line
 * summary and needs none.
 */
export type ArtifactPreviewSurfaceProps =
	| (ArtifactPreviewSurfaceBase & { size?: "gallery"; sanitizeHtml?: never })
	| (ArtifactPreviewSurfaceBase & { size: "full"; sanitizeHtml: (raw: string) => string });

/** Surface only: background, corner, padding, room. No typography. */
const SURFACE_CHROME = "bg-[var(--surface-container)] rounded-[var(--r-subtle)] p-[12px]";
const SURFACE_GALLERY = "min-h-[96px] flex items-center justify-center";
const SURFACE_FULL = "min-h-[240px] flex flex-col items-stretch";

/** The small caps caption treatment — on the caption, never on the panel. */
const CAPTION =
	"font-mono text-[11px] tracking-[var(--tracking-caps-sm)] uppercase text-[var(--text-tertiary)]";

/** Honest no-preview affordance — replaces "PREVIEW NOT YET RENDERED" / "PREVIEW PENDING". */
function NoPreviewText({ size }: { size: "gallery" | "full" }): JSX.Element {
	return (
		<span data-artifact-caption className={`type-data ${CAPTION}`}>
			{size === "full" ? "No preview available" : "No preview"}
		</span>
	);
}

/**
 * Error boundary wrapping the full-size renderer dispatch.
 *
 * @lore AF16 T11 WARNING-4: a renderer that throws (e.g. malformed preview)
 * collapses to the same "No preview available" affordance as null preview.
 */
interface RendererErrorBoundaryProps {
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
 * Full size: the artifact itself, through composeArtifactBody.
 * Gallery size: summarize() text (thumbnails stay summaries).
 */
function renderBody(
	kind: string,
	preview: unknown,
	size: "gallery" | "full",
	sanitizeHtml?: (raw: string) => string,
	documentTitle?: string,
): JSX.Element {
	if (size === "full") {
		if (preview == null) {
			return <NoPreviewText size="full" />;
		}
		return (
			<RendererErrorBoundary size="full">
				{composeArtifactBody(kind, preview, sanitizeHtml, documentTitle)}
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
		if (summary)
			return (
				<span data-artifact-caption className={`type-data ${CAPTION}`}>
					{summary}
				</span>
			);
		return <NoPreviewText size="gallery" />;
	}
	// Unregistered kind: name it rather than print a machine string.
	return (
		<span data-artifact-caption className={`type-data ${CAPTION}`}>
			{kind} · no preview
		</span>
	);
}

export function ArtifactPreviewSurface(props: ArtifactPreviewSurfaceProps): JSX.Element {
	const { kind, preview, documentTitle } = props;
	const size = props.size ?? "gallery";
	const sizeClass = size === "full" ? SURFACE_FULL : SURFACE_GALLERY;
	return (
		<div
			{...dsProps("ArtifactPreviewSurface", "1")}
			className={`${SURFACE_CHROME} ${sizeClass}`}
			data-size={size}
			data-kind={kind}
		>
			{renderBody(kind, preview, size, props.sanitizeHtml, documentTitle)}
		</div>
	);
}
