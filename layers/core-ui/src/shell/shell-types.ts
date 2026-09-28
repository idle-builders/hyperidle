import type { ReactNode } from "react";
import { createElement } from "react";

export const VIEW_IDS = Object.freeze(["conversations", "work", "knowledge"] as const);

export type ViewId = (typeof VIEW_IDS)[number];

export interface ViewIconEntry {
	label: string;
	icon: ReactNode;
}

const svgProps = { width: 16, height: 16, viewBox: "0 0 16 16", fill: "currentColor" };

export const VIEW_ICONS: Record<ViewId, ViewIconEntry> = {
	conversations: {
		label: "Conversations",
		icon: createElement(
			"svg",
			{ ...svgProps, "aria-hidden": true },
			createElement("path", {
				d: "M2 2h12a1 1 0 011 1v8a1 1 0 01-1 1H6l-3 3v-3H2a1 1 0 01-1-1V3a1 1 0 011-1z",
			}),
		),
	},
	work: {
		label: "Work",
		icon: createElement(
			"svg",
			{ ...svgProps, "aria-hidden": true },
			createElement("path", {
				d: "M6 1v2H2a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1V4a1 1 0 00-1-1h-4V1H6zm0 2h4v1H6V3z",
			}),
		),
	},
	knowledge: {
		label: "Knowledge",
		icon: createElement(
			"svg",
			{ ...svgProps, "aria-hidden": true },
			createElement("path", {
				d: "M2 1h5a2 2 0 012 2v11l-2.5-1.5L4 14V3a2 2 0 00-2-2zm12 0H9a2 2 0 00-2 2v11l2.5-1.5L12 14V3a2 2 0 012-2z",
			}),
		),
	},
};
