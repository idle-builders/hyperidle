import { useState } from "react";
import { SearchField } from "./SearchField.js";

export default {
	title: "SearchField",
	tier: "1" as const,
	order: [
		"Empty",
		"WithValue",
		"Loading",
		"WithKeyboardShortcut",
		"InteractiveTypeToTest",
		"InContextDemoCard",
	],
};

export const Empty = (): React.JSX.Element => (
	<div className="w-72">
		<SearchField placeholder="Search..." />
	</div>
);

export const WithValue = (): React.JSX.Element => (
	<div className="w-72">
		<SearchField placeholder="Search..." value="react component" onChange={() => {}} />
	</div>
);

export const Loading = (): React.JSX.Element => (
	<div className="w-72">
		<SearchField placeholder="Search..." value="fetching..." loading onChange={() => {}} />
	</div>
);

export const WithKeyboardShortcut = (): React.JSX.Element => (
	<div className="w-72">
		<SearchField placeholder="Search..." shortcutKey="/" />
	</div>
);

export const InteractiveTypeToTest = (): React.JSX.Element => {
	const [value, setValue] = useState("");
	return (
		<div className="w-72">
			<SearchField
				placeholder="Type something..."
				value={value}
				onChange={setValue}
				shortcutKey="/"
			/>
		</div>
	);
};

export const InContextDemoCard = (): React.JSX.Element => (
	<div className="max-w-[360px] rounded-lg bg-[var(--surface-container)] p-4">
		<SearchField placeholder="Search documents..." shortcutKey="/" />
	</div>
);
