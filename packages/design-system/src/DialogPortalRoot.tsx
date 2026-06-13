/**
 * AI2 — DialogPortalRoot: mounts once in AppShell to eagerly create
 * #overlay-root as a sibling of #root under document.body.
 *
 * Renders null — it has no visual output. The #overlay-root node is
 * appended imperatively via useEffect so it is a SIBLING of #root,
 * not a child of AppShell's React tree (which would nest it inside #root
 * and break the `inert` contract — see D3 in architecture.md).
 *
 * @lore AI2: The deliberate choice to render null and append imperatively
 * (rather than rendering a JSX <div id="overlay-root">) is critical for
 * the inert contract. If DialogPortalRoot rendered a JSX child inside
 * AppShell, the #overlay-root would be nested inside #root (the element
 * that receives `inert` when a modal opens). That would inert the dialog
 * too, defeating the whole purpose. Imperative append to document.body
 * makes #overlay-root a true body sibling. See architecture §D3 Risk #4.
 *
 * Dialog and useDialogBehavior consumers also call ensureOverlayRoot() on
 * mount, so DialogPortalRoot is not required in tests — the eager-mount is
 * a production optimization only.
 */

import type { JSX } from "react";
import { useEffect } from "react";
import { ensureOverlayRoot } from "./useDialogBehavior.js";

export function DialogPortalRoot(): JSX.Element | null {
	useEffect(() => {
		ensureOverlayRoot();
	}, []);

	// Renders nothing into the React tree.
	// #overlay-root lives as a body sibling, outside of React's root.
	return null;
}
