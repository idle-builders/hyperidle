import { useState } from "react";
import { type SettingsData, SettingsPanel } from "./SettingsPanel";

export default { title: "SettingsPanel" };

const mockSettings: SettingsData = {
	profile: {
		name: "Jane Doe",
		email: "jane@hyperidle.dev",
		avatarUrl: "",
	},
	products: [
		{ id: "p1", name: "HyperIdle", active: true },
		{ id: "p2", name: "SideProject", active: false },
		{ id: "p3", name: "Internal Tools", active: true },
	],
	agents: [
		{ id: "a1", name: "Builder Agent", autonomyLevel: "supervised", paused: false },
		{ id: "a2", name: "Review Agent", autonomyLevel: "autonomous", paused: true },
		{ id: "a3", name: "Deploy Agent", autonomyLevel: "manual", paused: false },
	],
	notifications: {
		reviewAlerts: true,
		costAlerts: true,
		blockerAlerts: false,
		quietHoursStart: "22:00",
		quietHoursEnd: "08:00",
		mutedProducts: [],
	},
	appearance: {
		density: "comfortable",
	},
};

function StoryWrapper({ initialOpen = true }: { initialOpen?: boolean }): JSX.Element {
	const [open, setOpen] = useState(initialOpen);
	return (
		<div>
			<button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>
				Open Settings
			</button>
			<SettingsPanel
				open={open}
				onClose={() => setOpen(false)}
				onSave={async (data) => {
					await new Promise((r) => setTimeout(r, 1000));
					window.alert(`Saved: ${JSON.stringify(data.profile.name)}`);
				}}
				settings={mockSettings}
				onFeedback={(fb) => window.alert(`${fb.type}: ${fb.message}`)}
			/>
		</div>
	);
}

export const Default = {
	name: "Default (Profile Tab)",
	render: (): JSX.Element => <StoryWrapper />,
};

export const Closed = {
	name: "Closed State",
	render: (): JSX.Element => <StoryWrapper initialOpen={false} />,
};

function SaveInFlightRender(): JSX.Element {
	const [open, setOpen] = useState(true);
	return (
		<SettingsPanel
			open={open}
			onClose={() => setOpen(false)}
			onSave={() => new Promise(() => {})}
			settings={mockSettings}
		/>
	);
}

export const SaveInFlight = {
	name: "Save In Flight",
	render: (): JSX.Element => {
		return <SaveInFlightRender />;
	},
};
