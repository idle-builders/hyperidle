/**
 * Select stories.
 */

import type { JSX } from "react";
import { Select } from "./Select.js";

export default { title: "Select" };

const OPTIONS = [
	{ value: "light", label: "Light" },
	{ value: "dark", label: "Dark" },
	{ value: "system", label: "System" },
];

export function Default(): JSX.Element {
	return (
		<div className="p-[18px] flex flex-col gap-[12px]">
			<Select options={OPTIONS} />
			<Select label="Theme" options={OPTIONS} />
			<Select label="Theme" options={OPTIONS} disabled />
		</div>
	);
}
