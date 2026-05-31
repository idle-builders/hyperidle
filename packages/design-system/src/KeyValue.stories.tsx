import { KeyValue } from "./KeyValue.js";

export default {
	title: "KeyValue",
	tier: "1" as const,
	order: [
		"InlineLayoutDefault",
		"StackedLayout",
		"LongValues",
		"ShortLabels",
		"SideBySideComparison",
	],
};

export const InlineLayoutDefault = (): React.JSX.Element => (
	<div className="flex w-80 flex-col gap-2">
		<KeyValue label="Status" value="Running" />
		<KeyValue label="Priority" value="High" />
		<KeyValue label="Sprint" value="Cycle 7" />
		<KeyValue label="Owner" value="Architect Agent" />
	</div>
);

export const StackedLayout = (): React.JSX.Element => (
	<div className="flex w-80 flex-col gap-3">
		<KeyValue label="Endpoint" value="https://api.hyperidle.io/v1" layout="stacked" />
		<KeyValue label="Commit" value="a7f3e2d" layout="stacked" />
		<KeyValue label="Branch" value="main" layout="stacked" />
	</div>
);

export const LongValues = (): React.JSX.Element => (
	<div className="flex max-w-[420px] flex-col gap-2">
		<KeyValue label="Endpoint" value="https://api.hyperidle.io/v1/agents/health" />
		<KeyValue label="Commit hash" value="a7f3e2d91bc4f..." />
	</div>
);

export const ShortLabels = (): React.JSX.Element => (
	<div className="flex max-w-[200px] flex-col gap-2">
		<KeyValue label="ID" value="a7f3" />
		<KeyValue label="Rev" value="42" />
	</div>
);

export const SideBySideComparison = (): React.JSX.Element => (
	<div className="flex gap-4">
		<div className="flex w-60 flex-col gap-2 rounded-lg bg-[var(--surface-container)] p-4">
			<KeyValue label="Owner" value="Architect Agent" />
			<KeyValue label="Sprint" value="Cycle 7" />
		</div>
		<div className="flex w-60 flex-col gap-3 rounded-lg bg-[var(--surface-container)] p-4">
			<KeyValue label="Owner" value="Architect Agent" layout="stacked" />
			<KeyValue label="Sprint" value="Cycle 7" layout="stacked" />
		</div>
	</div>
);
