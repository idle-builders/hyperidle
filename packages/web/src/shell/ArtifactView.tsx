// AE6 — ArtifactView: kind-based renderer dispatch.
// Replaces the 5-shape discriminated union (text_diff, content_preview, visual_comparison,
// action_summary, data_metrics) with a single kind+preview interface.
//
// @lore AE6: The 5 shapes are retired. Each of the 6 fundamental kinds has its own
// renderer component in packages/web/src/kinds/. The kind string selects the renderer
// at runtime — no switch needed. Unregistered kinds fall through to FallbackRenderer.
//
// @lore J4: The metadata strip and related-history section are preserved from the
// old implementation. They now show `kind` (and optional `label`) in the badge area.

// AF16 T9: getRenderer moved from packages/web/src/kinds/ to @hyperidle/design-system
import { dsShellProps, getRenderer } from "@hyperidle/design-system";
import type { JSX } from "react";
import { Suspense } from "react";

// --- Metadata strip types (J4) ---

export interface ArtifactMetadata {
	status: string;
	sla: string;
	routing: string;
}

export interface RelatedHistoryEntry {
	id: string;
	label: string;
	timestamp: string;
}

// --- Props ---

export interface ArtifactViewProps {
	kind: string;
	preview: unknown;
	label?: string | null;
	loading?: boolean;
	error?: string;
	metadata?: ArtifactMetadata;
	relatedHistory?: RelatedHistoryEntry[];
}

// --- Metadata strip + related history (J4) ---

function MetadataStrip({
	kind,
	label,
	metadata,
}: {
	kind: string;
	label?: string | null;
	metadata: ArtifactMetadata;
}): JSX.Element {
	const badgeText = label ? `${kind} · ${label}` : kind;
	return (
		<div
			data-testid="artifact-metadata-strip"
			className="flex items-center gap-2 px-3 py-1 text-xs font-mono border-b border-[var(--border-subtle)] text-[var(--text-secondary)]"
		>
			<span
				data-testid="artifact-kind-badge"
				className="badge badge-sm badge-outline uppercase tracking-wider"
			>
				{badgeText}
			</span>
			<span className="text-[var(--text-tertiary)]">status</span>
			<span className="text-[var(--text-primary)]">{metadata.status}</span>
			{metadata.sla && (
				<>
					<span className="text-[var(--text-tertiary)]">sla</span>
					<span className="text-[var(--text-primary)]">{metadata.sla}</span>
				</>
			)}
			{metadata.routing && (
				<>
					<span className="text-[var(--text-tertiary)] ml-auto">routing</span>
					<span className="text-[var(--text-primary)]">{metadata.routing}</span>
				</>
			)}
		</div>
	);
}

function RelatedHistorySection({ entries }: { entries: RelatedHistoryEntry[] }): JSX.Element {
	return (
		<section
			aria-label="Related history"
			className="border-t border-[var(--border-subtle)] px-3 py-2 mt-3"
		>
			<h4 className="text-[11px] font-mono uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
				Related history
			</h4>
			<ul className="flex flex-col gap-1 text-xs">
				{entries.map((e) => (
					<li key={e.id} className="flex justify-between gap-2">
						<span className="text-[var(--text-primary)]">{e.label}</span>
						<span className="text-[var(--text-tertiary)] font-mono">{e.timestamp}</span>
					</li>
				))}
			</ul>
		</section>
	);
}

function renderKind(kind: string, preview: unknown): JSX.Element {
	const Renderer = getRenderer(kind);
	return (
		<Suspense fallback={<div className="skeleton h-32 w-full" />}>
			<Renderer preview={preview} kind={kind} />
		</Suspense>
	);
}

// --- Main component ---

export function ArtifactView({
	kind,
	preview,
	label,
	loading,
	error,
	metadata,
	relatedHistory,
}: ArtifactViewProps): JSX.Element {
	// @lore L11 AC-8: emit flat `data-component` alongside `dsShellProps`
	// so L11 verification queries (`[data-component='ArtifactView']`) resolve.
	const shellAttrs = {
		...dsShellProps("ArtifactView"),
		"data-component": "ArtifactView",
		"data-kind": kind,
	};

	if (loading) {
		return (
			<output {...shellAttrs} aria-label="Loading artifact" className="block">
				<div className="skeleton h-32 w-full" />
				<div className="skeleton h-4 w-3/4 mt-2" />
				<div className="skeleton h-4 w-1/2 mt-2" />
			</output>
		);
	}

	if (error) {
		return (
			<div {...shellAttrs} role="alert" className="alert alert-error text-sm">
				{error}
			</div>
		);
	}

	const body = renderKind(kind, preview);
	const showMetadata = metadata !== undefined;
	const showHistory = relatedHistory !== undefined && relatedHistory.length > 0;

	if (!(showMetadata || showHistory)) {
		return <div {...shellAttrs}>{body}</div>;
	}

	return (
		<div {...shellAttrs}>
			{showMetadata && <MetadataStrip kind={kind} label={label} metadata={metadata} />}
			<div className={showMetadata ? "p-[12px]" : undefined}>{body}</div>
			{showHistory && <RelatedHistorySection entries={relatedHistory} />}
		</div>
	);
}
