import { LiveDot } from "./LiveDot";

export default { title: "LiveDot" };

export const Default = () => (
	<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
		<LiveDot />
		<span style={{ fontSize: 13, color: "var(--text-hi)" }}>In progress</span>
	</div>
);

export const WithTaskRow = () => (
	<div
		style={{
			display: "flex",
			alignItems: "center",
			gap: 8,
			padding: "12px 16px",
			background: "var(--surface-container)",
			borderRadius: 10,
		}}
	>
		<LiveDot />
		<span style={{ fontSize: 13, color: "var(--text-hi)" }}>Build auth flow</span>
	</div>
);

/**
 */
export const Tones = () => (
	<div style={{ display: "flex", alignItems: "center", gap: 16 }}>
		<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
			<LiveDot tone="primary" />
			<span style={{ fontSize: 13 }}>primary (default)</span>
		</div>
		<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
			<LiveDot tone="secondary" />
			<span style={{ fontSize: 13 }}>secondary</span>
		</div>
	</div>
);

export const MultipleInstances = () => (
	<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
		{["WorkBet task row", "WorkTask header", "TaskSheet session", "AgentProfile active"].map(
			(label) => (
				<div key={label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
					<LiveDot />
					<span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{label}</span>
				</div>
			),
		)}
	</div>
);
