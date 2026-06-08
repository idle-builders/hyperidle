// AE6: ArtifactView stories updated for kind-based renderer dispatch.

import { ArtifactView } from "./ArtifactView";

export default { title: "ArtifactView", tier: "3" as const };

// --- code kind ---

export const CodeDiffDefault = (): React.JSX.Element => (
	<ArtifactView
		kind="code"
		preview={{
			kind: "code",
			file: "src/components/Button.tsx",
			hunks: [
				{
					header: "@@ -1,5 +1,6 @@",
					lines: [
						{ kind: "ctx", text: "import { useState } from 'react';" },
						{ kind: "del", text: "const MAX_RETRIES = 3;" },
						{ kind: "add", text: "const MAX_RETRIES = 5;" },
						{ kind: "add", text: "const RETRY_DELAY = 1000;" },
						{ kind: "ctx", text: "" },
						{ kind: "ctx", text: "export function retry() {" },
					],
				},
			],
		}}
	/>
);

export const CodeDiffLoading = (): React.JSX.Element => (
	<ArtifactView kind="code" preview={null} loading={true} />
);

export const CodeDiffError = (): React.JSX.Element => (
	<ArtifactView kind="code" preview={null} error="Failed to load diff: network timeout" />
);

export const CodeDiffEmpty = (): React.JSX.Element => (
	<ArtifactView kind="code" preview={{ kind: "code", file: "src/x.ts", hunks: [] }} />
);

// --- text kind ---

export const TextDefault = (): React.JSX.Element => (
	<ArtifactView
		kind="text"
		label="contract"
		preview={{
			kind: "text",
			body: "This agreement is entered into between Party A and Party B for the development of software.",
			format: "plain",
		}}
	/>
);

export const TextLoading = (): React.JSX.Element => (
	<ArtifactView kind="text" preview={null} loading={true} />
);

export const TextEmpty = (): React.JSX.Element => <ArtifactView kind="text" preview={null} />;

// --- image kind ---

export const ImageDefault = (): React.JSX.Element => (
	<ArtifactView
		kind="image"
		preview={{
			kind: "image",
			url: "https://placehold.co/800x450",
			width: 800,
			height: 450,
			alt: "Dashboard screenshot",
		}}
	/>
);

// --- data kind ---

export const DataMetricsDefault = (): React.JSX.Element => (
	<ArtifactView
		kind="data"
		label="test_results"
		preview={{
			kind: "data",
			headlines: [
				{ label: "Total Tests", value: "142" },
				{ label: "Pass Rate", value: "98.6%" },
				{ label: "Coverage", value: "87%" },
			],
			charts: [
				{ label: "Tests over time", values: [80, 95, 110, 125, 130, 142] },
				{ label: "Coverage trend", values: [72, 75, 79, 82, 85, 87] },
			],
		}}
	/>
);

export const DataMetricsEmpty = (): React.JSX.Element => (
	<ArtifactView kind="data" preview={{ kind: "data", headlines: [] }} />
);

// --- html kind ---

export const HtmlDefault = (): React.JSX.Element => (
	<ArtifactView
		kind="html"
		label="dashboard"
		preview={{
			kind: "html",
			html: "<h1 style='font-family:system-ui'>Q4 Dashboard</h1><p>Revenue up 15% QoQ.</p>",
			title: "Q4 Dashboard",
		}}
	/>
);

// --- url kind ---

export const UrlDefault = (): React.JSX.Element => (
	<ArtifactView
		kind="url"
		label="service"
		preview={{
			kind: "url",
			url: "https://api.example.com/health",
			status: "ok",
			statusLabel: "Healthy",
		}}
	/>
);

// --- metadata strip (J4) ---

export const WithMetadata = (): React.JSX.Element => (
	<ArtifactView
		kind="text"
		label="contract"
		preview={{ kind: "text", body: "Agreement content", format: "plain" }}
		metadata={{
			status: "pending",
			sla: "2h left",
			routing: "Legal Agent",
		}}
	/>
);

// --- fallback renderer for unregistered kinds ---

export const FallbackUnregisteredKind = (): React.JSX.Element => (
	<ArtifactView
		kind="custom_report"
		preview={{ kind: "custom_report", title: "Q4 Analysis", wordCount: 2400, status: "draft" }}
	/>
);
