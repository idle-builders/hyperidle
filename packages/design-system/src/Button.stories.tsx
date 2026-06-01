/**
 * Button stories.
 */

import type { JSX } from "react";
import { Button } from "./Button.js";

export default { title: "Button" };

export function AllVariants(): JSX.Element {
	return (
		<div className="flex flex-wrap gap-[12px] p-[18px]">
			<Button variant="primary">Primary</Button>
			<Button variant="secondary">Secondary</Button>
			<Button variant="ghost">Ghost</Button>
			<Button variant="destructive">Destructive</Button>
			<Button variant="amber">Amber</Button>
		</div>
	);
}

export function SmallVariants(): JSX.Element {
	return (
		<div className="flex flex-wrap gap-[12px] p-[18px]">
			<Button variant="primary" size="sm">
				Primary
			</Button>
			<Button variant="secondary" size="sm">
				Secondary
			</Button>
			<Button variant="ghost" size="sm">
				Ghost
			</Button>
			<Button variant="destructive" size="sm">
				Destructive
			</Button>
			<Button variant="amber" size="sm">
				Amber
			</Button>
		</div>
	);
}

export function DisabledState(): JSX.Element {
	return (
		<div className="flex flex-wrap gap-[12px] p-[18px]">
			<Button variant="primary" disabled>
				Primary disabled
			</Button>
			<Button variant="secondary" disabled>
				Secondary disabled
			</Button>
		</div>
	);
}
