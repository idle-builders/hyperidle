import { useState } from "react";
import type { VerdictAction } from "./ReviewHeader";
import { ReviewHeader } from "./ReviewHeader";

export default { title: "ReviewHeader", tier: "3" as const };

export const Default = (): React.JSX.Element => {
	const [pending, setPending] = useState<VerdictAction | null>(null);
	const [lastVerdict, setLastVerdict] = useState<VerdictAction | null>(null);
	return (
		<div>
			<ReviewHeader
				proposer={{
					name: "Agent-Alpha",
					avatarUrl:
						"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='16' fill='%23374151'/%3E%3Ctext x='50%25' y='55%25' fill='%239ca3af' text-anchor='middle' dy='.3em' font-size='14'%3EA%3C/text%3E%3C/svg%3E",
					timestamp: "2 hours ago",
				}}
				onPrefill={setPending}
				onCommit={(action) => {
					setLastVerdict(action);
					setPending(null);
				}}
				pendingVerdict={pending}
				verdictDoubleClick={true}
			/>
			{lastVerdict && (
				<p className="text-xs text-[var(--text-lo)] mt-2 px-3">
					Last verdict: <strong className="text-[var(--text-hi)]">{lastVerdict}</strong>
				</p>
			)}
		</div>
	);
};

export const NoAvatar = (): React.JSX.Element => (
	<ReviewHeader
		proposer={{ name: "Agent-Beta", timestamp: "5 minutes ago" }}
		onPrefill={() => {}}
		onCommit={() => {}}
		pendingVerdict={null}
		verdictDoubleClick={true}
	/>
);

export const LongProposerName = (): React.JSX.Element => (
	<ReviewHeader
		proposer={{
			name: "Agent-With-A-Very-Long-Descriptive-Name",
			timestamp: "1 day ago",
		}}
		onPrefill={() => {}}
		onCommit={() => {}}
		pendingVerdict={null}
		verdictDoubleClick={true}
	/>
);

export const PrefilledApprove = (): React.JSX.Element => (
	<ReviewHeader
		proposer={{ name: "Agent-Gamma", timestamp: "1 minute ago" }}
		onPrefill={() => {}}
		onCommit={() => {}}
		pendingVerdict="approve"
		verdictDoubleClick={true}
	/>
);

export const ReversibleApprove = (): React.JSX.Element => (
	<ReviewHeader
		proposer={{ name: "Agent-Delta", timestamp: "30 seconds ago" }}
		onPrefill={() => {}}
		onCommit={() => {}}
		pendingVerdict={null}
		verdictDoubleClick={true}
		reversibility={true}
	/>
);
