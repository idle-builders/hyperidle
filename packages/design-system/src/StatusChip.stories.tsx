import { StatusChip } from "./StatusChip.js";

export default { title: "StatusChip" };

export const Healthy = (): React.JSX.Element => <StatusChip status="healthy" />;
export const Behind = (): React.JSX.Element => <StatusChip status="behind" />;
export const Blocked = (): React.JSX.Element => <StatusChip status="blocked" />;
export const Paused = (): React.JSX.Element => <StatusChip status="paused" />;
export const Done = (): React.JSX.Element => <StatusChip status="done" />;
export const ErrorStatus = (): React.JSX.Element => <StatusChip status="error" />;

export const AllStatuses = (): React.JSX.Element => (
	<div className="flex flex-wrap gap-2">
		<StatusChip status="healthy" />
		<StatusChip status="behind" />
		<StatusChip status="blocked" />
		<StatusChip status="paused" />
		<StatusChip status="done" />
		<StatusChip status="error" />
	</div>
);
