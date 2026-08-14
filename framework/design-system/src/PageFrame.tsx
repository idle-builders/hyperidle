import type { JSX, ReactNode } from "react";
import { dsProps } from "./ds-attrs.js";

export interface PageFrameProps {
	children: ReactNode;
}

/** Stable horizontal frame for routed pages. Content measure stays with the page. */
export function PageFrame({ children }: PageFrameProps): JSX.Element {
	return (
		<div
			className="mx-auto w-full max-w-[1120px] box-border px-[24px]"
			data-page-frame=""
			{...dsProps("PageFrame", "1")}
		>
			{children}
		</div>
	);
}
