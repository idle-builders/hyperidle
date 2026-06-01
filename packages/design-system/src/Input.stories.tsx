/**
 * Input stories.
 */

import type { JSX } from "react";
import { Input } from "./Input.js";

export default { title: "Input" };

export function Default(): JSX.Element {
	return (
		<div className="p-[18px] flex flex-col gap-[12px]">
			<Input placeholder="Enter text..." />
			<Input label="Name" placeholder="Full name" />
			<Input label="Email" hint="We'll never share your email." placeholder="you@example.com" />
			<Input label="Username" error="Username is already taken." placeholder="username" />
		</div>
	);
}

export function TextareaVariant(): JSX.Element {
	return (
		<div className="p-[18px]">
			<Input label="Description" textarea placeholder="Enter a description..." />
		</div>
	);
}

export function DisabledState(): JSX.Element {
	return (
		<div className="p-[18px] flex flex-col gap-[12px]">
			<Input label="Name" placeholder="Disabled input" disabled />
			<Input label="Description" textarea placeholder="Disabled textarea" disabled />
		</div>
	);
}
