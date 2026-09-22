/**
 * Menu stories — AG5: generalized anchored action menu primitive.
 *
 * Shows key states: default open, with shortcuts, with destructive item,
 * disabled item, align="start", and dataAttrs passthrough.
 */

import { type JSX, useState } from "react";
import { Menu, type MenuItem } from "./Menu.js";

export default { title: "Menu" };

const BASIC_ITEMS: MenuItem[] = [
	{ id: "activate", label: "Activate bet", onSelect: () => {} },
	{ id: "adjust", label: "Adjust appetite", onSelect: () => {} },
	{ id: "unblock", label: "Unblock", onSelect: () => {} },
	{ id: "kill", label: "Kill", destructive: true, onSelect: () => {} },
];

const WITH_SHORTCUTS: MenuItem[] = [
	{ id: "copy", label: "Copy permalink", shortcut: "⌘L", onSelect: () => {} },
	{ id: "threads", label: "View threads", shortcut: "↵", onSelect: () => {} },
	{ id: "move", label: "Move to bet", onSelect: () => {} },
	{ id: "delete", label: "Delete block", shortcut: "⌫", destructive: true, onSelect: () => {} },
];

function ToggleMenu({
	items,
	label,
	align,
}: {
	items: MenuItem[];
	label: string;
	align?: "start" | "end";
}): JSX.Element {
	const [open, setOpen] = useState(false);
	return (
		<div className="relative inline-block">
			<button
				type="button"
				aria-haspopup="menu"
				aria-expanded={open}
				className="inline-flex items-center justify-center w-[32px] h-[32px] rounded-[var(--r-pill)] border-[1.5px] border-[var(--border-default)] bg-transparent text-[var(--text-secondary)] text-[16px] cursor-pointer hover:border-[var(--accent-deep)]"
				onClick={() => setOpen((v) => !v)}
			>
				···
			</button>
			<Menu open={open} onClose={() => setOpen(false)} items={items} label={label} align={align} />
		</div>
	);
}

export function Default(): JSX.Element {
	return (
		<div className="p-[18px] flex gap-[24px]">
			<div>
				<p className="text-[12px] text-[var(--text-tertiary)] mb-[6px]">Click · · · to open</p>
				<ToggleMenu items={BASIC_ITEMS} label="Bet actions" align="end" />
			</div>
		</div>
	);
}

export function WithShortcuts(): JSX.Element {
	return (
		<div className="p-[18px] flex gap-[24px]">
			<ToggleMenu items={WITH_SHORTCUTS} label="Block actions" align="end" />
		</div>
	);
}

export function WithDisabledItem(): JSX.Element {
	const items: MenuItem[] = [
		{
			id: "archive",
			label: "Archive",
			disabled: true,
			onSelect: () => {},
			dataAttrs: { "data-testid": "document-archive" },
		},
		{
			id: "change-scope",
			label: "Change scope",
			onSelect: () => {},
			dataAttrs: { "data-testid": "document-change-scope" },
		},
	];
	return (
		<div className="p-[18px] flex gap-[24px]">
			<ToggleMenu items={items} label="Document actions" align="end" />
		</div>
	);
}

export function AlignStart(): JSX.Element {
	return (
		<div className="p-[18px] flex justify-end gap-[24px]">
			<p className="text-[12px] text-[var(--text-tertiary)] self-center">
				align="start" (left-aligned panel)
			</p>
			<ToggleMenu items={BASIC_ITEMS} label="Bet actions" align="start" />
		</div>
	);
}

export function WithIcons(): JSX.Element {
	const iconItems: MenuItem[] = [
		{
			id: "add",
			label: "Add document",
			icon: (
				<svg
					viewBox="0 0 16 16"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.5"
					aria-hidden="true"
				>
					<path d="M8 3v10M3 8h10" strokeLinecap="round" />
				</svg>
			),
			onSelect: () => {},
		},
		{
			id: "activate",
			label: "Activate bet",
			icon: (
				<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
					<path d="M5 3.5l8 4.5-8 4.5V3.5z" />
				</svg>
			),
			onSelect: () => {},
		},
		{
			id: "kill",
			label: "Kill",
			destructive: true,
			icon: (
				<svg
					viewBox="0 0 16 16"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.5"
					aria-hidden="true"
				>
					<path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
				</svg>
			),
			onSelect: () => {},
		},
	];
	return (
		<div className="p-[18px] flex gap-[24px]">
			<div>
				<p className="text-[12px] text-[var(--text-tertiary)] mb-[6px]">Items with leading icons</p>
				<ToggleMenu items={iconItems} label="Bet actions" align="end" />
			</div>
		</div>
	);
}

export function DataAttrsPassthrough(): JSX.Element {
	const betItems: MenuItem[] = [
		{
			id: "activate",
			label: "Activate",
			onSelect: () => {},
			dataAttrs: { "data-bet-action": "activate" },
		},
		{
			id: "kill",
			label: "Kill",
			destructive: true,
			onSelect: () => {},
			dataAttrs: { "data-bet-action": "kill" },
		},
	];
	return (
		<div className="p-[18px] flex gap-[24px]">
			<div>
				<p className="text-[12px] text-[var(--text-tertiary)] mb-[6px]">
					Items emit data-bet-action attrs (C4)
				</p>
				<ToggleMenu items={betItems} label="Bet actions" align="end" />
			</div>
		</div>
	);
}
