import { useState } from "react";
import type { VerdictAction } from "./ReviewHeader";
import { ReviewHeader } from "./ReviewHeader";

export default { title: "ReviewHeader", tier: "3" as const };

export const Default = (): React.JSX.Element => {
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
				onVerdict={setLastVerdict}
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
		onVerdict={() => {}}
	/>
);

export const LongProposerName = (): React.JSX.Element => (
	<ReviewHeader
		proposer={{
			name: "Agent-With-A-Very-Long-Descriptive-Name",
			timestamp: "1 day ago",
		}}
		onVerdict={() => {}}
	/>
);

export const WithArtifactView = (): React.JSX.Element => {
	const [lastVerdict, setLastVerdict] = useState<VerdictAction | null>(null);

	return (
		<div className="border border-[var(--surface-4)] rounded">
			<ReviewHeader
				proposer={{
					name: "Agent-CodeGen",
					avatarUrl:
						"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='16' fill='%23334155'/%3E%3Ctext x='50%25' y='55%25' fill='%2393c5fd' text-anchor='middle' dy='.3em' font-size='14'%3EC%3C/text%3E%3C/svg%3E",
					timestamp: "10 minutes ago",
				}}
				onVerdict={setLastVerdict}
			/>
			<div className="p-3">
				<pre className="text-xs font-mono bg-[var(--surface-2)] p-2 rounded">
					{`// Simulated diff below the header
- const x = 1;
+ const x = 2;`}
				</pre>
			</div>
			{lastVerdict && (
				<div className="px-3 pb-2 text-xs text-[var(--text-lo)]">
					Verdict: <strong className="text-[var(--text-hi)]">{lastVerdict}</strong>
				</div>
			)}
		</div>
	);
};
