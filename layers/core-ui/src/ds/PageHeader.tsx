// hearth-internal-padding
import type { JSX, ReactNode } from "react";
import { dsProps } from "./ds-attrs.js";
import { PageFrame } from "./PageFrame.js";

export const pageTitleClassName = "text-[var(--text-primary)] min-w-0 truncate";

export const paneTitleClassName = "text-[var(--text-primary)] min-w-0 truncate";

export interface PageHeaderProps {
	title: ReactNode;
	/** Default 1 — the page's single h1. Pass 2 only when this title is NOT the document's top heading. Visual treatment is identical for both levels. */
	level?: 1 | 2;
	presentation?: "page" | "pane";
	paneTitleProfile?: "lead" | "subheading";
	reservePaneControls?: boolean;
	leading?: ReactNode;
	subtitle?: ReactNode;
	actions?: ReactNode;
	"data-testid"?: string;
}

export function PageHeader({
	title,
	level = 1,
	presentation = "page",
	paneTitleProfile = "lead",
	reservePaneControls = false,
	leading,
	subtitle,
	actions,
	"data-testid": testId,
}: PageHeaderProps): JSX.Element {
	const TitleTag = presentation === "pane" || level === 2 ? "h2" : "h1";
	const resolvedTitleProfile = presentation === "pane" ? paneTitleProfile : "title";
	const content = (
		<>
			{leading && <div className="mb-[6px] min-w-0 overflow-hidden">{leading}</div>}

			<div className="flex items-center justify-between gap-[12px]">
				<TitleTag
					data-az16-profile={resolvedTitleProfile}
					className={`${
						resolvedTitleProfile === "subheading"
							? "type-subheading"
							: resolvedTitleProfile === "lead"
								? "type-lead"
								: "type-title"
					} ${presentation === "pane" ? paneTitleClassName : `${pageTitleClassName} hidden md:block`}`}
				>
					{title}
				</TitleTag>
				{actions && <div className="flex items-center gap-[9px] shrink-0">{actions}</div>}
			</div>

			{subtitle && (
				<div data-az16-profile="small" className="type-small mt-[3px]  text-[var(--text-tertiary)]">
					{subtitle}
				</div>
			)}
		</>
	);
	return (
		<header
			data-az16-profile="thin"
			className={
				presentation === "pane"
					? `shrink-0 pl-[18px] ${reservePaneControls ? "pr-[84px]" : "pr-[18px]"} py-[12px] border-width-thin-b border-[var(--border-subtle)]`
					: "shrink-0 py-[18px] border-width-thin-b border-[var(--border-subtle)]"
			}
			{...dsProps("PageHeader", "1")}
			{...(testId ? { "data-testid": testId } : {})}
		>
			{presentation === "page" ? <PageFrame>{content}</PageFrame> : content}
		</header>
	);
}
