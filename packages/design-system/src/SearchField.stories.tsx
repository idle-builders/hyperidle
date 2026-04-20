import { useState } from "react";
import { SearchField } from "./SearchField.js";

export default { title: "SearchField" };

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

export const WithShortcut = (): React.JSX.Element => (
	<div className="w-72">
		<SearchField placeholder="Search..." shortcutKey="/" />
	</div>
);

export const Interactive = (): React.JSX.Element => {
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
