// @lore: scroll body is flex-1 overflow-y-auto with NO min-h-0 — overflow:auto zeros flex min-size already; min-h-0 only for managed body; do not add it

import type { JSX, ReactNode } from "react";
import { dsProps } from "./ds-attrs.js";
import { PageFrame } from "./PageFrame.js";

export interface PageScaffoldProps {
	header?: ReactNode;
	body?: "scroll" | "managed";
	frame?: "page" | "local";
	children: ReactNode;
	"data-testid"?: string;
}

export function PageScaffold({
	header,
	body = "scroll",
	frame = "local",
	children,
	"data-testid": testId,
}: PageScaffoldProps): JSX.Element {
	return (
		<div
			className="flex flex-col h-full"
			{...dsProps("PageScaffold", "1")}
			{...(testId ? { "data-testid": testId } : {})}
		>
			{header}
			{body === "managed" ? (
				<div className="flex-1 min-h-0 flex flex-col overflow-hidden">{children}</div>
			) : (
				<div className="flex-1 overflow-y-auto" data-page-scroll="">
					{frame === "page" ? <PageFrame>{children}</PageFrame> : children}
				</div>
			)}
		</div>
	);
}
