/**
 * Progress stories.
 */

import type { JSX } from "react";
import { Progress } from "./Progress.js";

export default { title: "Progress" };

export function Default(): JSX.Element {
	return (
		<div className="p-[18px] flex flex-col gap-[12px]" style={{ width: "320px" }}>
			<Progress value={0} />
			<Progress value={25} />
			<Progress value={60} />
			<Progress value={100} />
		</div>
	);
}

export function WithLabels(): JSX.Element {
	return (
		<div className="p-[18px] flex flex-col gap-[12px]" style={{ width: "320px" }}>
			<Progress value={60} label="Budget" />
			<Progress value={35} label="Tasks completed" variant="amber" />
		</div>
	);
}

export function Variants(): JSX.Element {
	return (
		<div className="p-[18px] flex flex-col gap-[12px]" style={{ width: "320px" }}>
			<Progress value={70} label="Green (accent-primary)" variant="green" />
			<Progress value={70} label="Amber (accent-secondary)" variant="amber" />
		</div>
	);
}
