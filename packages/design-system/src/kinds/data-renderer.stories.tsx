// AE6 — DataRenderer stories.

import { DataRenderer } from "./data-renderer.js";

export default { title: "Kinds/DataRenderer" };

export function WithHeadlines() {
	return (
		<DataRenderer
			preview={{
				kind: "data",
				headlines: [
					{ label: "DAU", value: "12.4k" },
					{ label: "MRR", value: "$48k" },
					{ label: "Churn", value: "1.2%" },
				],
			}}
			kind="data"
		/>
	);
}

export function WithCharts() {
	return (
		<DataRenderer
			preview={{
				kind: "data",
				headlines: [{ label: "Revenue", value: "$42k" }],
				charts: [
					{ label: "DAU", values: [10, 14, 13, 18, 22, 20, 25] },
					{ label: "Revenue", values: [35, 38, 36, 40, 42, 41, 44] },
				],
			}}
			kind="data"
		/>
	);
}

export function WithRows() {
	return (
		<DataRenderer
			preview={{
				kind: "data",
				headlines: [{ label: "Tests", value: "24 passed" }],
				rows: [
					{ suite: "unit", passed: "18", failed: "0" },
					{ suite: "integration", passed: "6", failed: "0" },
				],
			}}
			kind="data"
		/>
	);
}
