// AE6 — UrlRenderer stories.

import { UrlRenderer } from "./url-renderer.js";

export default { title: "Kinds/UrlRenderer" };

export function Healthy() {
	return (
		<UrlRenderer
			preview={{
				kind: "url",
				url: "https://api.example.com/health",
				status: "ok",
				statusLabel: "Healthy",
			}}
			kind="url"
		/>
	);
}

export function Degraded() {
	return (
		<UrlRenderer
			preview={{
				kind: "url",
				url: "https://app.staging.example.com",
				status: "degraded",
				statusLabel: "High latency",
			}}
			kind="url"
		/>
	);
}

export function NoStatus() {
	return (
		<UrlRenderer
			preview={{
				kind: "url",
				url: "https://github.com/org/repo/pull/42",
			}}
			kind="url"
		/>
	);
}

export function NoPreview() {
	return <UrlRenderer preview={null} kind="url" />;
}
