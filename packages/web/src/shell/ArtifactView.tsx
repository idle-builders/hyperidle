import { dsShellProps, KeyValue } from "@hyperidle/design-system";
import DOMPurify from "dompurify";
import { cloneElement, type JSX } from "react";

// --- Data shape types ---

export interface DiffLine {
	type: "addition" | "deletion" | "context";
	content: string;
}

export interface DiffHunk {
	header: string;
	lines: DiffLine[];
}

export interface TextDiffData {
	hunks: DiffHunk[];
}

export interface ContentPreviewData {
	html: string;
	metadata: Array<{ label: string; value: string }>;
}

export interface VisualComparisonData {
	before: { label: string; src: string };
	after: { label: string; src: string };
}

export interface ActionSummaryData {
	actions: Array<{ label: string; value: string }>;
}

export interface SparklineChart {
	label: string;
	values: number[];
}

export interface DataMetricsData {
	headlines: Array<{ label: string; value: string }>;
	charts: SparklineChart[];
}

// --- Metadata strip / related-history types (J4) ---

/**
 * @lore J4 AC: a thin metadata strip renders above every artifact view. Status
 * / SLA / routing come from the caller; the kind badge is derived from the
 * shape prop so it can never drift. The strip is opt-in (only renders when
 * `metadata` is supplied) to preserve the backwards-compatible I-track tests.
 */
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

interface ArtifactCommonProps {
	loading?: boolean;
	error?: string;
	metadata?: ArtifactMetadata;
	relatedHistory?: RelatedHistoryEntry[];
}

// --- Discriminated union props ---

export type ArtifactViewProps =
	| ({ shape: "text_diff"; data: TextDiffData } & ArtifactCommonProps)
	| ({ shape: "content_preview"; data: ContentPreviewData } & ArtifactCommonProps)
	| ({ shape: "visual_comparison"; data: VisualComparisonData } & ArtifactCommonProps)
	| ({ shape: "action_summary"; data: ActionSummaryData } & ArtifactCommonProps)
	| ({ shape: "data_metrics"; data: DataMetricsData } & ArtifactCommonProps);

const DIFF_LINE_CLASSES: Record<DiffLine["type"], string> = {
	addition: "bg-success/10",
	deletion: "bg-error/10",
	context: "",
};

const DIFF_LINE_PREFIX: Record<DiffLine["type"], string> = {
	addition: "+",
	deletion: "-",
	context: " ",
};

// --- Sub-components ---

function TextDiffView({ data }: { data: TextDiffData }): JSX.Element {
	if (data.hunks.length === 0) {
		return <p className="text-sm text-[var(--text-lo)]">No diff available</p>;
	}

	return (
		<section aria-label="Diff view">
			<pre className="overflow-x-auto text-xs font-mono leading-[1.4]">
				{data.hunks.map((hunk) => (
					<div key={hunk.header}>
						<div className="text-[var(--text-lo)] select-none px-2 py-1">{hunk.header}</div>
						{hunk.lines.map((line, li) => (
							<div
								key={`${hunk.header}-${li}-${line.type}`}
								data-diff-type={line.type}
								className={`px-2 py-1 ${DIFF_LINE_CLASSES[line.type]}`}
							>
								<span className="select-none text-[var(--text-lo)] mr-2">
									{DIFF_LINE_PREFIX[line.type]}
								</span>
								<code>{line.content}</code>
							</div>
						))}
					</div>
				))}
			</pre>
		</section>
	);
}

function ContentPreviewView({ data }: { data: ContentPreviewData }): JSX.Element {
	return (
		<section aria-label="Content preview">
			{data.metadata.length > 0 && (
				<div className="flex flex-col gap-1 mb-3 pb-3 border-b border-[var(--border-subtle)]">
					{data.metadata.map((kv) => (
						<KeyValue key={kv.label} label={kv.label} value={kv.value} />
					))}
				</div>
			)}
			{/* @lore Content is sanitized client-side with DOMPurify before rendering.
			    Server-side sanitization is also applied as defense-in-depth. */}
			<div
				className="prose prose-sm prose-invert max-w-none"
				// biome-ignore lint/security/noDangerouslySetInnerHtml: content sanitized via DOMPurify before rendering
				// biome-ignore lint/style/useNamingConvention: React API uses __html key
				dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(data.html) }}
			/>
		</section>
	);
}

function VisualComparisonView({ data }: { data: VisualComparisonData }): JSX.Element {
	return (
		<section aria-label="Visual comparison">
			<div className="grid grid-cols-2 gap-3">
				<div className="bg-[var(--surface-4)] rounded-lg p-3">
					<span className="block text-xs font-mono uppercase text-[var(--text-lo)] mb-2">
						{data.before.label}
					</span>
					<img
						src={data.before.src}
						alt={`${data.before.label} artifact`}
						className="w-full rounded"
					/>
				</div>
				<div className="bg-[var(--surface-4)] rounded-lg p-3">
					<span className="block text-xs font-mono uppercase text-[var(--text-lo)] mb-2">
						{data.after.label}
					</span>
					<img
						src={data.after.src}
						alt={`${data.after.label} artifact`}
						className="w-full rounded"
					/>
				</div>
			</div>
		</section>
	);
}

function ActionSummaryView({ data }: { data: ActionSummaryData }): JSX.Element {
	if (data.actions.length === 0) {
		return (
			<section aria-label="Action summary">
				<p className="text-sm text-[var(--text-lo)]">No actions to display</p>
			</section>
		);
	}

	return (
		<section aria-label="Action summary">
			<ol className="flex flex-col gap-1">
				{data.actions.map((action) => (
					<li key={`${action.label}-${action.value}`} className="list-decimal list-inside">
						<KeyValue label={action.label} value={action.value} />
					</li>
				))}
			</ol>
		</section>
	);
}

/**
 * @lore Sparklines are simple inline SVGs, not a charting library.
 * Keeps the bundle small and avoids external dependencies per UI_DESIGN.md.
 */
function Sparkline({ values, label }: { values: number[]; label: string }): JSX.Element {
	if (values.length === 0) return <></>;

	const max = Math.max(...values);
	const min = Math.min(...values);
	const range = max - min || 1;
	const width = 80;
	const height = 24;
	const step = width / Math.max(values.length - 1, 1);

	const points = values
		.map((v, i) => {
			const x = i * step;
			const y = height - ((v - min) / range) * height;
			return `${x},${y}`;
		})
		.join(" ");

	return (
		<svg
			role="img"
			aria-label={`${label} sparkline`}
			width={width}
			height={height}
			viewBox={`0 0 ${width} ${height}`}
			className="inline-block"
		>
			<polyline fill="none" stroke="var(--primary)" strokeWidth="1.5" points={points} />
		</svg>
	);
}

function DataMetricsView({ data }: { data: DataMetricsData }): JSX.Element {
	if (data.headlines.length === 0 && data.charts.length === 0) {
		return (
			<section aria-label="Data metrics">
				<p className="text-sm text-[var(--text-lo)]">No metrics available</p>
			</section>
		);
	}

	return (
		<section aria-label="Data metrics">
			{data.headlines.length > 0 && (
				<div className="grid grid-cols-3 gap-3 mb-3">
					{data.headlines.map((h) => (
						<KeyValue key={h.label} label={h.label} value={h.value} layout="stacked" />
					))}
				</div>
			)}
			{data.charts.length > 0 && (
				<div className="flex flex-col gap-2">
					{data.charts.map((chart) => (
						<div key={chart.label} className="flex items-center gap-2">
							<span className="text-xs text-[var(--text-lo)] font-mono uppercase w-32 shrink-0">
								{chart.label}
							</span>
							<Sparkline values={chart.values} label={chart.label} />
						</div>
					))}
				</div>
			)}
		</section>
	);
}

// --- Metadata strip + related history (J4) ---

function MetadataStrip({
	shape,
	metadata,
}: {
	shape: ArtifactViewProps["shape"];
	metadata: ArtifactMetadata;
}): JSX.Element {
	return (
		<div
			data-testid="artifact-metadata-strip"
			className="flex items-center gap-2 px-3 py-1 text-xs font-mono border-b border-[var(--border-subtle)] text-[var(--text-mid)]"
		>
			<span
				data-testid="artifact-kind-badge"
				className="badge badge-sm badge-outline uppercase tracking-wider"
			>
				{shape}
			</span>
			<span className="text-[var(--text-lo)]">status</span>
			<span className="text-[var(--text-hi)]">{metadata.status}</span>
			{metadata.sla && (
				<>
					<span className="text-[var(--text-lo)]">sla</span>
					<span className="text-[var(--text-hi)]">{metadata.sla}</span>
				</>
			)}
			{metadata.routing && (
				<>
					<span className="text-[var(--text-lo)] ml-auto">routing</span>
					<span className="text-[var(--text-hi)]">{metadata.routing}</span>
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
			<h4 className="text-[11px] font-mono uppercase tracking-wider text-[var(--text-lo)] mb-1">
				Related history
			</h4>
			<ul className="flex flex-col gap-1 text-xs">
				{entries.map((e) => (
					<li key={e.id} className="flex justify-between gap-2">
						<span className="text-[var(--text-hi)]">{e.label}</span>
						<span className="text-[var(--text-lo)] font-mono">{e.timestamp}</span>
					</li>
				))}
			</ul>
		</section>
	);
}

function renderShape(props: ArtifactViewProps): JSX.Element {
	switch (props.shape) {
		case "text_diff":
			return <TextDiffView data={props.data} />;
		case "content_preview":
			return <ContentPreviewView data={props.data} />;
		case "visual_comparison":
			return <VisualComparisonView data={props.data} />;
		case "action_summary":
			return <ActionSummaryView data={props.data} />;
		case "data_metrics":
			return <DataMetricsView data={props.data} />;
	}
}

// --- Main component ---

export function ArtifactView(props: ArtifactViewProps): JSX.Element {
	const { loading, error, metadata, relatedHistory } = props;
	const shellAttrs = dsShellProps("ArtifactView");

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

	const body = renderShape(props);
	const showMetadata = metadata !== undefined;
	const showHistory = relatedHistory !== undefined && relatedHistory.length > 0;
	// @lore I-track: bare body preserves existing query selectors when no metadata/history.
	// @lore K2: cloneElement merges shellAttrs onto body's outer element. WARNING — body
	// returned by renderShape MUST NOT carry `data-ds-*` attrs; cloneElement shallow-merges
	// and silently overwrites. If a future renderShape branch wraps in a DS primitive at the
	// root, switch to a wrapper div instead.
	if (!(showMetadata || showHistory)) {
		return cloneElement(body, shellAttrs);
	}
	return (
		<div {...shellAttrs}>
			{showMetadata && <MetadataStrip shape={props.shape} metadata={metadata} />}
			{/*
			 * @lore K11: content pad → --density-card-pad per
			 * density-audit.md § 3.3.K4. Diff line metrics, metadata strip,
			 * sparkline dimensions and visual-comparison pane padding all
			 * stay literal — code/instrument geometry, not body text.
			 */}
			<div className={showMetadata ? "p-[var(--density-card-pad)]" : undefined}>{body}</div>
			{showHistory && <RelatedHistorySection entries={relatedHistory} />}
		</div>
	);
}
