/**
 * Container for Row-based lists. Owns the list surface and the
 * empty/loading/error/populated state machine.
 *
 * State precedence: error → loading → empty (when isEmpty===true) → children.
 *
 * isEmpty is a required explicit signal — no implicit React.Children counting;
 * an empty children slot is not the same as "no data".
 */

import type { JSX, ReactNode } from "react";
import { dsProps } from "./ds-attrs.js";
import { EmptyState } from "./EmptyState.js";
import { ErrorState } from "./ErrorState.js";
import { ItemListContext } from "./Row.js";
import { SkeletonList } from "./Skeleton.js";

export interface ItemListEmpty {
	title: string;
	description: string;
	icon?: ReactNode;
	iconBg?: string;
	action?: ReactNode;
	dataTestId?: string;
}

export interface ItemListError {
	title?: string;
	description: string;
	onRetry?: () => void;
}

export interface ItemListProps {
	children?: ReactNode;
	/**
	 * default "contained". "boxed" = flush rows inside a hairline-border
	 * card (no shadow) — the one spelling for the bordered-container list,
	 * shared by SettingsHarnesses and DocumentSlotList.
	 */
	variant?: "contained" | "flush" | "boxed";
	/** "ul" → semantic list element; default "div" */
	as?: "div" | "ul";
	loading?: boolean;
	/** default 4 */
	loadingRows?: number;
	/** aria-label for the SkeletonList */
	loadingLabel?: string;
	error?: ItemListError | null;
	/** empty-state content, rendered when isEmpty && not loading/error */
	empty?: ItemListEmpty;
	/** REQUIRED explicit empty flag. No implicit React.Children counting. */
	isEmpty: boolean;
	"data-testid"?: string;
}

export function ItemList({
	children,
	variant = "contained",
	as: Tag = "div",
	loading = false,
	loadingRows = 4,
	loadingLabel,
	error,
	empty,
	isEmpty,
	"data-testid": dataTestId,
}: ItemListProps): JSX.Element {
	// @lore: contained surface — only in populated branch; empty/error/loading states render transparent; grey container around lone EmptyState looks broken
	// @lore: boxed variant — hairline-border container, no shadow; one spelling shared by all callers
	const containerClass =
		variant === "contained"
			? "rounded-[var(--r-subtle)] bg-[var(--surface-container)] p-[12px]"
			: variant === "boxed"
				? "border-width-thin border-[var(--border-subtle)] rounded-[var(--r-subtle)] bg-[var(--surface-elevated)] overflow-hidden"
				: "";

	// State precedence: error → loading → empty → children
	let content: JSX.Element;

	if (error) {
		content = (
			<ErrorState
				title={error.title ?? "Error"}
				description={error.description}
				onRetry={error.onRetry}
			/>
		);
	} else if (loading) {
		content = <SkeletonList rows={loadingRows} ariaLabel={loadingLabel ?? "Loading"} />;
	} else if (isEmpty) {
		content = empty ? (
			<EmptyState
				title={empty.title}
				description={empty.description}
				icon={empty.icon}
				iconBg={empty.iconBg}
				action={empty.action}
				dataTestId={empty.dataTestId}
			/>
		) : (
			<div />
		);
	} else {
		// Populated: render children inside the semantic list element WITH the container surface.
		return (
			<ItemListContext.Provider value={{ variant, as: Tag }}>
				<Tag {...dsProps("ItemList", "2")} data-testid={dataTestId} className={containerClass}>
					{children}
				</Tag>
			</ItemListContext.Provider>
		);
	}

	// For error/loading/empty states: render WITHOUT the container background.
	// The state components (EmptyState, ErrorState, SkeletonList) paint on the page
	// surface and do not need to be boxed inside a grey container.
	return (
		<ItemListContext.Provider value={{ variant, as: Tag }}>
			<div {...dsProps("ItemList", "2")} data-testid={dataTestId}>
				{content}
			</div>
		</ItemListContext.Provider>
	);
}
