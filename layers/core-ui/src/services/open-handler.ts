/**
 * AM1 — the OpenTarget → navigation seam (CONFUSION-A; AC8 / N1).
 *
 * The PartList renderer carries routing DESCRIPTORS (`OpenTarget`), never
 * `navigate` calls. The page binds the renderer's `onOpen` to a handler that
 * resolves an OpenTarget to a path and navigates. This factory IS that binding,
 * extracted so it is unit-testable without mounting the page (the red-phase
 * test drives `createOpenHandler(spiedNavigate)` with the real `resolveHostRoute`).
 *
 * Route map (the §6 routing contract):
 *   host    → resolveHostRoute(hostKind, hostId)   (total over HostKind; null = no-op, e.g. user)
 *   review  → /reviews/:reviewId
 *   session → fires the page-supplied `onOpenSession` callback (AM3); no route,
 *             the page owns where the session view mounts
 *
 * @lore AM1 C1: a block/entity routes to its HOST surface via `resolveHostRoute`
 * — the existing resolver, total over `HostKind`. No new route table, no
 * fabricated `knowledgeId`. `user` resolves to null → no navigation (matching
 * the resolver's existing null return).
 *
 * @lore The review route used to require a betId a task-hosted thread has no
 * way to supply (the page had to source it from thread→host context and the
 * handler fell back to a no-op when it couldn't). Once the loader names the
 * review's own thread directly, the URL needs nothing but the reviewId —
 * `/reviews/:id` resolves for every host, so there is no longer a no-op case
 * to document here.
 */

import type { OpenHandler, OpenTarget } from "../components/parts";
import { type RouteHostKind, resolveHostRoute } from "./host-route.js";
import { type ProductObjectKind, presentationFor } from "./object-presentation.js";

export type NavigateFn = (path: string) => void;

/** Page-supplied routing context the source-agnostic adapter cannot know. */
export interface OpenHandlerContext {
	/**
	 * AM3: callback to open a session view (entry + sub-agent recursion).
	 * When supplied, fires for `case "session"` instead of the old no-op.
	 * A sub-agent `tool` row fires the SAME open seam → the same surface, recursed.
	 *
	 * @lore AM3 R3: AM1 documented this as a no-op; AM3 fills it. No new route —
	 * the surface is opened via this callback (the page owns the placement).
	 */
	readonly onOpenSession?: (sessionId: string) => void;
	readonly onInspectPath?: (path: string) => void;
}

function objectKindForHost(hostKind: RouteHostKind): ProductObjectKind | null {
	switch (hostKind) {
		case "task":
		case "knowledge_item":
		case "agent":
		case "team":
			return hostKind;
		case "user":
		case "factory":
			return null;
	}
}

function openInspect(
	kind: ProductObjectKind,
	path: string,
	navigate: NavigateFn,
	ctx?: OpenHandlerContext,
): void {
	if (presentationFor(kind, "inspect") !== "pane") return;
	if (ctx?.onInspectPath) ctx.onInspectPath(path);
	else navigate(path);
}

export function createOpenHandler(navigate: NavigateFn, ctx?: OpenHandlerContext): OpenHandler {
	return (target: OpenTarget): void => {
		switch (target.route) {
			case "host": {
				const path = resolveHostRoute(target.hostKind, target.hostId);
				const kind = objectKindForHost(target.hostKind);
				if (path === null || kind === null) return;
				// @lore AM5 T8: append #block-<encodeURIComponent(blockId)> for block-anchored open (AC2).
				// No selector concat — the fragment is matched by value at the scroll site (KnowledgeDetail).
				openInspect(
					kind,
					target.blockId ? `${path}#block-${encodeURIComponent(target.blockId)}` : path,
					navigate,
					ctx,
				);
				return;
			}
			case "review": {
				// @lore BC3: `threadId` rides the query string — `open_thread` needs
				// it and no action resolves it from a bare message id (part.ts's
				// `ReviewTarget`).
				const path = `/reviews/${target.reviewId}?threadId=${encodeURIComponent(target.threadId)}`;
				if (target.intent === "inspect") openInspect("review", path, navigate, ctx);
				else navigate(path);
				return;
			}
			case "session":
				// AM3: fire the page-supplied callback to open/recurse the session view.
				// A sub-agent tool row carries the same `session` OpenTarget → same surface.
				// No navigation: the surface is opened via the callback (page owns placement).
				if (presentationFor("session", "inspect") === "pane") {
					ctx?.onOpenSession?.(target.sessionId);
				}
				return;
		}
	};
}
