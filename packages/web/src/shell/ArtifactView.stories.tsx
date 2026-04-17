import { ArtifactView } from "./ArtifactView";

export default { title: "ArtifactView" };

// --- text_diff ---

export const TextDiffDefault = (): React.JSX.Element => (
	<ArtifactView
		shape="text_diff"
		data={{
			hunks: [
				{
					header: "@@ -1,5 +1,6 @@",
					lines: [
						{ type: "context", content: "import { useState } from 'react';" },
						{ type: "deletion", content: "const MAX_RETRIES = 3;" },
						{ type: "addition", content: "const MAX_RETRIES = 5;" },
						{ type: "addition", content: "const RETRY_DELAY = 1000;" },
						{ type: "context", content: "" },
						{ type: "context", content: "export function retry() {" },
					],
				},
				{
					header: "@@ -12,3 +13,4 @@",
					lines: [
						{ type: "context", content: "  return result;" },
						{ type: "deletion", content: "}" },
						{ type: "addition", content: "  // Added logging" },
						{ type: "addition", content: "}" },
					],
				},
			],
		}}
	/>
);

export const TextDiffLoading = (): React.JSX.Element => (
	<ArtifactView shape="text_diff" data={{ hunks: [] }} loading={true} />
);

export const TextDiffError = (): React.JSX.Element => (
	<ArtifactView
		shape="text_diff"
		data={{ hunks: [] }}
		error="Failed to load diff: network timeout"
	/>
);

export const TextDiffEmpty = (): React.JSX.Element => (
	<ArtifactView shape="text_diff" data={{ hunks: [] }} />
);

// --- content_preview ---

export const ContentPreviewDefault = (): React.JSX.Element => (
	<ArtifactView
		shape="content_preview"
		data={{
			html: "<h2>Quarterly Report</h2><p>Revenue increased by <strong>15%</strong> compared to the previous quarter. Key drivers include product expansion and improved retention rates.</p><ul><li>New users: 2,450</li><li>Churn rate: 3.2%</li></ul>",
			metadata: [
				{ label: "Author", value: "Agent-Report" },
				{ label: "Version", value: "3.1" },
				{ label: "Generated", value: "2 minutes ago" },
			],
		}}
	/>
);

export const ContentPreviewLoading = (): React.JSX.Element => (
	<ArtifactView shape="content_preview" data={{ html: "", metadata: [] }} loading={true} />
);

export const ContentPreviewError = (): React.JSX.Element => (
	<ArtifactView
		shape="content_preview"
		data={{ html: "", metadata: [] }}
		error="Content generation failed"
	/>
);

export const ContentPreviewEmpty = (): React.JSX.Element => (
	<ArtifactView
		shape="content_preview"
		data={{ html: "<p><em>No content available</em></p>", metadata: [] }}
	/>
);

// --- visual_comparison ---

export const VisualComparisonDefault = (): React.JSX.Element => (
	<ArtifactView
		shape="visual_comparison"
		data={{
			before: {
				label: "Before",
				src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='120'%3E%3Crect fill='%23333' width='200' height='120'/%3E%3Ctext x='50%25' y='50%25' fill='%23999' text-anchor='middle' dy='.3em'%3EBefore%3C/text%3E%3C/svg%3E",
			},
			after: {
				label: "After",
				src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='120'%3E%3Crect fill='%23252' width='200' height='120'/%3E%3Ctext x='50%25' y='50%25' fill='%23bfb' text-anchor='middle' dy='.3em'%3EAfter%3C/text%3E%3C/svg%3E",
			},
		}}
	/>
);

export const VisualComparisonLoading = (): React.JSX.Element => (
	<ArtifactView
		shape="visual_comparison"
		data={{ before: { label: "Before", src: "" }, after: { label: "After", src: "" } }}
		loading={true}
	/>
);

export const VisualComparisonError = (): React.JSX.Element => (
	<ArtifactView
		shape="visual_comparison"
		data={{ before: { label: "Before", src: "" }, after: { label: "After", src: "" } }}
		error="Images could not be loaded"
	/>
);

export const VisualComparisonEmpty = (): React.JSX.Element => (
	<ArtifactView
		shape="visual_comparison"
		data={{
			before: {
				label: "Before",
				src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='120'%3E%3Crect fill='%23222' width='200' height='120'/%3E%3Ctext x='50%25' y='50%25' fill='%23666' text-anchor='middle' dy='.3em'%3ENo image%3C/text%3E%3C/svg%3E",
			},
			after: {
				label: "After",
				src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='120'%3E%3Crect fill='%23222' width='200' height='120'/%3E%3Ctext x='50%25' y='50%25' fill='%23666' text-anchor='middle' dy='.3em'%3ENo image%3C/text%3E%3C/svg%3E",
			},
		}}
	/>
);

// --- action_summary ---

export const ActionSummaryDefault = (): React.JSX.Element => (
	<ArtifactView
		shape="action_summary"
		data={{
			actions: [
				{ label: "Created", value: "src/components/Button.tsx" },
				{ label: "Modified", value: "package.json" },
				{ label: "Modified", value: "tsconfig.json" },
				{ label: "Deleted", value: "src/legacy/OldButton.tsx" },
				{ label: "Test added", value: "src/__tests__/Button.test.tsx" },
			],
		}}
	/>
);

export const ActionSummaryLoading = (): React.JSX.Element => (
	<ArtifactView shape="action_summary" data={{ actions: [] }} loading={true} />
);

export const ActionSummaryError = (): React.JSX.Element => (
	<ArtifactView shape="action_summary" data={{ actions: [] }} error="Failed to summarize actions" />
);

export const ActionSummaryEmpty = (): React.JSX.Element => (
	<ArtifactView shape="action_summary" data={{ actions: [] }} />
);

// --- data_metrics ---

export const DataMetricsDefault = (): React.JSX.Element => (
	<ArtifactView
		shape="data_metrics"
		data={{
			headlines: [
				{ label: "Total Tests", value: "142" },
				{ label: "Pass Rate", value: "98.6%" },
				{ label: "Coverage", value: "87%" },
				{ label: "Build Time", value: "3.2s" },
				{ label: "Bundle Size", value: "142kb" },
				{ label: "Lint Errors", value: "0" },
			],
			charts: [
				{ label: "Tests over time", values: [80, 95, 110, 125, 130, 142] },
				{ label: "Coverage trend", values: [72, 75, 79, 82, 85, 87] },
			],
		}}
	/>
);

export const DataMetricsLoading = (): React.JSX.Element => (
	<ArtifactView shape="data_metrics" data={{ headlines: [], charts: [] }} loading={true} />
);

export const DataMetricsError = (): React.JSX.Element => (
	<ArtifactView
		shape="data_metrics"
		data={{ headlines: [], charts: [] }}
		error="Metrics pipeline failed"
	/>
);

export const DataMetricsEmpty = (): React.JSX.Element => (
	<ArtifactView shape="data_metrics" data={{ headlines: [], charts: [] }} />
);
