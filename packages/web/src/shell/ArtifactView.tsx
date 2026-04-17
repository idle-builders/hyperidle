import type { JSX } from "react";
import { KeyValue } from "../components/KeyValue";

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

// --- Discriminated union props ---

export type ArtifactViewProps =
	| { shape: "text_diff"; data: TextDiffData; loading?: boolean; error?: string }
	| { shape: "content_preview"; data: ContentPreviewData; loading?: boolean; error?: string }
	| { shape: "visual_comparison"; data: VisualComparisonData; loading?: boolean; error?: string }
	| { shape: "action_summary"; data: ActionSummaryData; loading?: boolean; error?: string }
	| { shape: "data_metrics"; data: DataMetricsData; loading?: boolean; error?: string };

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
			<pre className="overflow-x-auto text-xs font-mono leading-5">
				{data.hunks.map((hunk) => (
					<div key={hunk.header}>
						<div className="text-[var(--text-lo)] select-none px-2 py-0.5">{hunk.header}</div>
						{hunk.lines.map((line, li) => (
							<div
								key={`${hunk.header}-${li}-${line.type}`}
								data-diff-type={line.type}
								className={`px-2 py-0.5 ${DIFF_LINE_CLASSES[line.type]}`}
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
				<div className="flex flex-col gap-1 mb-3 pb-3 border-b border-[var(--surface-4)]">
					{data.metadata.map((kv) => (
						<KeyValue key={kv.label} label={kv.label} value={kv.value} />
					))}
				</div>
			)}
			{/* @lore Using dangerouslySetInnerHTML for content_preview — the content
			    comes from agent-generated artifacts which are sanitized server-side.
			    A future story should add client-side DOMPurify. */}
			<div
				className="prose prose-sm prose-invert max-w-none"
				// biome-ignore lint/security/noDangerouslySetInnerHtml: content sanitized server-side, see @lore above
				dangerouslySetInnerHTML={{ __html: data.html }}
			/>
		</section>
	);
}

function VisualComparisonView({ data }: { data: VisualComparisonData }): JSX.Element {
	return (
		<section aria-label="Visual comparison">
			<div className="grid grid-cols-2 gap-3">
				<div className="bg-[var(--surface-4)] rounded p-3">
					<span className="block text-xs font-mono uppercase text-[var(--text-lo)] mb-2">
						{data.before.label}
					</span>
					<img
						src={data.before.src}
						alt={`${data.before.label} artifact`}
						className="w-full rounded"
					/>
				</div>
				<div className="bg-[var(--surface-4)] rounded p-3">
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

// --- Main component ---

export function ArtifactView(props: ArtifactViewProps): JSX.Element {
	const { loading, error } = props;

	if (loading) {
		return (
			<output aria-label="Loading artifact" className="block">
				<div className="skeleton h-32 w-full" />
				<div className="skeleton h-4 w-3/4 mt-2" />
				<div className="skeleton h-4 w-1/2 mt-2" />
			</output>
		);
	}

	if (error) {
		return (
			<div role="alert" className="alert alert-error text-sm">
				{error}
			</div>
		);
	}

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
