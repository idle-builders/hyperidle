/**
 * PageScaffold — Tier 1 DS component (AZ2).
 *
 * The one place a page declares its scroll contract. Before AZ2, the contract
 * was prose in `docs/ui-design/page-anatomy.md` that each page hand-copied —
 * incompletely, in three places (see AZ2 round.md §2.2). PageScaffold makes it
 * a component: a page that wants to scroll calls this; it cannot hand-write the
 * combination of classes that scrolls (or that silently clips) instead.
 *
 * Two body modes:
 *   "scroll"  (default) — the scaffold owns the scroll region; children are
 *             page content, laid out inside it.
 *   "managed" — the child owns its own scrolling (SplitView, ConversationSurface,
 *             a detail pane). The scaffold still guarantees the child a bounded
 *             flex column to size against — that bound is the whole fix for the
 *             WorkTeam live defect (AZ2 round.md §2.3 shape C → the managed body).
 *
 * @lore AZ2 §2.3: the scroll body below is `flex-1 overflow-y-auto` with
 * **no `min-h-0`**. This is deliberate, not an oversight — a headless Chromium
 * probe proved `min-h-0` is a no-op here: an element whose computed overflow is
 * not `visible` already receives an automatic flex-item minimum size of zero, so
 * `overflow-y-auto` supplies the reset by itself (shape A ≡ shape B in the
 * probe). `min-h-0` earns its keep in exactly one place — the managed body,
 * which is an intermediate flex column that does NOT set its own overflow, so it
 * needs the explicit reset (shape F → G in the probe). Do not add `min-h-0` to
 * the scroll body "to be safe"; it was the thing that looked plausible and
 * turned out not to be the fix for the underlying WorkTeam bug (a block wrapper
 * between root and body, not a missing `min-h-0`).
 */

import type { JSX, ReactNode } from "react";
import { dsProps } from "./ds-attrs.js";

export interface PageScaffoldProps {
	/** Pinned header strip. Normally a `<PageHeader>`. Omit for a page with no title strip. */
	header?: ReactNode;
	/**
	 * "scroll"  (default) — the scaffold owns the scroll region; children are
	 *           page content.
	 * "managed" — the child owns its own scrolling (SplitView, ConversationSurface,
	 *             a detail pane). The scaffold still guarantees the child a
	 *             bounded flex column to size against.
	 */
	body?: "scroll" | "managed";
	children: ReactNode;
	/** Test hook passthrough on the root element. */
	"data-testid"?: string;
}

export function PageScaffold({
	header,
	body = "scroll",
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
					{children}
				</div>
			)}
		</div>
	);
}
