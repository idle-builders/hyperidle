import { KeyValue } from "./KeyValue.js";

export default { title: "KeyValue" };

export const Inline = (): React.JSX.Element => <KeyValue label="Status" value="Running" />;
export const Stacked = (): React.JSX.Element => (
	<KeyValue label="Status" value="Running" layout="stacked" />
);
export const LongValue = (): React.JSX.Element => (
	<KeyValue label="Endpoint" value="https://api.hyperidle.io/v1/agents/health" />
);
export const ShortLabel = (): React.JSX.Element => <KeyValue label="ID" value="a7f3" />;

export const InlineGroup = (): React.JSX.Element => (
	<div className="flex flex-col gap-2 w-64">
		<KeyValue label="Owner" value="Agent-12" />
		<KeyValue label="Sprint" value="2026-W16" />
		<KeyValue label="Priority" value="High" />
	</div>
);

export const StackedGroup = (): React.JSX.Element => (
	<div className="flex flex-col gap-3 w-64">
		<KeyValue label="Owner" value="Agent-12" layout="stacked" />
		<KeyValue label="Sprint" value="2026-W16" layout="stacked" />
		<KeyValue label="Priority" value="High" layout="stacked" />
	</div>
);
