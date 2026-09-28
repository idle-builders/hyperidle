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
		</div>
	);
}

/**
 * @lore size="icon": 32×32 desktop square control; 44×44 touch floor below lg
 */
export function IconSize(): JSX.Element {
	return (
		<div className="flex flex-wrap items-center gap-[12px] p-[18px]">
			<Button variant="primary" size="icon" aria-label="Add">
				+
			</Button>
			<Button variant="secondary" size="icon" aria-label="More options">
				⋯
			</Button>
			<Button variant="ghost" size="icon" aria-label="Close">
				×
			</Button>
			<Button variant="destructive" size="icon" aria-label="Delete">
				×
			</Button>
		</div>
	);
}

/**
 * @lore ghost tone="neutral": swaps default --accent-deep for --text-secondary — plain icon/utility affordance, not a text-link look
 */
export function GhostTone(): JSX.Element {
	return (
		<div className="flex flex-wrap items-center gap-[12px] p-[18px]">
			<Button variant="ghost">Accent (default)</Button>
			<Button variant="ghost" tone="neutral">
				Neutral
			</Button>
			<Button variant="ghost" size="icon" tone="neutral" aria-label="Close">
				×
			</Button>
			<Button variant="ghost" tone="danger">
				Delete
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

/**
 * AI6: Focus ring demonstration — 1px `focus-visible:outline-1` (converged from 2px).
 * Inline style forces the focus ring visible for documentation purposes.
 */
export function FocusRing(): JSX.Element {
	return (
		<div className="flex flex-wrap gap-[12px] p-[18px]">
			<Button
				variant="primary"
				style={{ outline: "1px solid var(--accent-primary)", outlineOffset: "0px" }}
			>
				Primary (focused)
			</Button>
			<Button
				variant="secondary"
				style={{ outline: "1px solid var(--accent-primary)", outlineOffset: "0px" }}
			>
				Secondary (focused)
			</Button>
			<Button
				variant="destructive"
				style={{ outline: "1px solid var(--accent-primary)", outlineOffset: "0px" }}
			>
				Destructive (focused)
			</Button>
		</div>
	);
}
