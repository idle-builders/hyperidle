import type { ArtifactKind, ArtifactPreview } from "@hyperidle/shared";
import type { JSX } from "react";
import { dsProps } from "./ds-attrs.js";

export interface ArtifactPreviewSurfaceProps {
	kind: ArtifactKind;
	preview: ArtifactPreview | null;
	size?: "gallery" | "full";
}

const SURFACE_BASE =
	"bg-[var(--surface-container)] rounded-[var(--r-subtle)] p-[12px] flex items-center justify-center text-[var(--text-tertiary)] font-mono text-[11px] tracking-[0.02em] uppercase";
const SURFACE_GALLERY = "min-h-[96px]";
const SURFACE_FULL = "min-h-[240px]";

function PlaceholderText({ size }: { size: "gallery" | "full" }): JSX.Element {
	return <>{size === "full" ? "PREVIEW NOT YET RENDERED" : "PREVIEW PENDING"}</>;
}

function renderBody(
	kind: ArtifactKind,
	preview: ArtifactPreview | null,
	size: "gallery" | "full",
): JSX.Element {
	if (kind === "unknown_kind") {
		return <span>no preview renderer for this kind</span>;
	}
	if (!preview) {
		return <PlaceholderText size={size} />;
	}
	switch (preview.kind) {
		case "code_diff":
			return <span>{preview.file}</span>;
		case "deck":
			return (
				<span>
					{preview.slideCount} slides · {preview.firstSlideTitle}
				</span>
			);
		case "contract":
			return <span>{preview.title}</span>;
		case "dashboard":
			return <span>{preview.metrics.map((m) => `${m.label}: ${m.value}`).join(" · ")}</span>;
		case "screenshot":
		case "design":
			return (
				<span>
					{preview.width}×{preview.height}
				</span>
			);
		case "drafted_email":
			return (
				<span>
					{preview.subject} — {preview.bodyExcerpt}
				</span>
			);
		case "data_analysis":
			return <span>{preview.findings.length} findings</span>;
		case "decision":
			return <span>{preview.claim}</span>;
		case "running_service":
			return (
				<span>
					{preview.statusLabel} — {preview.url}
				</span>
			);
		case "comm_draft":
			return (
				<span>
					{preview.channel}: {preview.firstMessage}
				</span>
			);
		case "verification":
			return (
				<span>
					{preview.suite}: {preview.passed} passed / {preview.failed} failed
				</span>
			);
	}
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
