import { useState } from "react";
import type { PitchSelectorPitch } from "./PitchSelector";
import { PitchSelector } from "./PitchSelector";

export default { title: "PitchSelector" };

const samplePitches: PitchSelectorPitch[] = [
	{
		id: "p1",
		title: "Mobile App V2",
		hypothesis: "Users want mobile access to manage their teams on the go",
		proposer: "Alice",
		status: "shaped",
		appetite: "6 weeks",
		kind: "feature",
	},
	{
		id: "p2",
		title: "Analytics Dashboard",
		hypothesis: "Data-driven decisions improve team velocity by 30%",
		proposer: "Bob",
		status: "shaped",
		appetite: "4 weeks",
		kind: "feature",
	},
	{
		id: "p3",
		title: "CLI Tool",
		hypothesis: "Developers prefer terminal workflows over GUIs",
		proposer: "Charlie",
		status: "shaped",
		appetite: "2 weeks",
		kind: "tooling",
	},
	{
		id: "p4",
		title: "Notification Overhaul",
		hypothesis: "Reducing notification noise increases focus time",
		proposer: "Diana",
		status: "shaped",
		appetite: "3 weeks",
	},
];

export const Default = (): React.JSX.Element => (
	<div className="max-w-md">
		<PitchSelector
			pitches={samplePitches}
			selectedIds={[]}
			onSelect={() => {}}
			onClose={() => {}}
		/>
	</div>
);

export const WithSelection = (): React.JSX.Element => (
	<div className="max-w-md">
		<PitchSelector
			pitches={samplePitches}
			selectedIds={["p1", "p3"]}
			onSelect={() => {}}
			onClose={() => {}}
		/>
	</div>
);

export const Empty = (): React.JSX.Element => (
	<div className="max-w-md">
		<PitchSelector pitches={[]} selectedIds={[]} onSelect={() => {}} onClose={() => {}} />
	</div>
);

export const Interactive = (): React.JSX.Element => {
	const [selected, setSelected] = useState<string[]>([]);
	return (
		<div className="max-w-md">
			<PitchSelector
				pitches={samplePitches}
				selectedIds={selected}
				onSelect={(id) => {
					setSelected((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
				}}
				onClose={() => {}}
			/>
		</div>
	);
};
