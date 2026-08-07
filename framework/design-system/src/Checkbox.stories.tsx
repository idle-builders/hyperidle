/**
 * Checkbox stories.
 */

import type { JSX } from "react";
import { Checkbox } from "./Checkbox.js";

export default { title: "Checkbox" };

export function Default(): JSX.Element {
	return (
		<div className="p-[18px] flex flex-col gap-[12px]">
			<Checkbox label="Accept terms and conditions" />
			<Checkbox label="Send me marketing emails" checked />
			<Checkbox label="Disabled unchecked" disabled />
			<Checkbox label="Disabled checked" checked disabled />
		</div>
	);
}
