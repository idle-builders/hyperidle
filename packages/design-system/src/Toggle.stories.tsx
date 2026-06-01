/**
 * Toggle stories.
 */

import type { JSX } from "react";
import { Toggle } from "./Toggle.js";

export default { title: "Toggle" };

export function Default(): JSX.Element {
	return (
		<div className="p-[18px] flex flex-col gap-[12px]">
			<Toggle label="Enable notifications" />
			<Toggle label="Enable notifications" on />
			<Toggle label="Enable feature" description="This enables the experimental feature." />
			<Toggle
				label="Enable feature with long description"
				description="This is a longer description that explains what this toggle controls in more detail."
				on
			/>
		</div>
	);
}

export function DisabledState(): JSX.Element {
	return (
		<div className="p-[18px] flex flex-col gap-[12px]">
			<Toggle label="Disabled off" disabled />
			<Toggle label="Disabled on" on disabled />
		</div>
	);
}
