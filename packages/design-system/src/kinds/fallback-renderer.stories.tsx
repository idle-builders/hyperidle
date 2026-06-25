// AE6 — FallbackRenderer stories.

import { FallbackRenderer } from "./fallback-renderer.js";

export default { title: "Kinds/FallbackRenderer" };

export function WithFields() {
	return (
		<FallbackRenderer
			preview={{
				title: "Q4 Strategy Deck",
				slideCount: 12,
				status: "draft",
				author: "agent-alice",
			}}
			kind="presentation"
		/>
	);
}

export function NestedData() {
	return (
		<FallbackRenderer
			preview={{
				metrics: { dau: 1200, mau: 8000 },
				period: "2026-Q4",
				tags: ["growth", "retention"],
			}}
			kind="custom_report"
		/>
	);
}
