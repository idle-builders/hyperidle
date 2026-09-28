/**
 * The OpenTarget → navigation seam.
 *
 * The PartList renderer carries routing DESCRIPTORS (`OpenTarget`), never
 * `navigate` calls. The page binds the renderer's `onOpen` to a handler that
 * resolves an OpenTarget to a path and navigates. This factory IS that binding,
 * extracted so it is unit-testable without mounting the page.
 *
 * Route map:
 *   host    → resolveHostRoute(hostKind, hostId)   (total over HostKind; null = no-op, e.g. user)
 *   review  → /reviews/:reviewId
 *   session → fires the page-supplied `onOpenSession` callback; no route
 */

import type { OpenHandler, OpenTarget } from "../components/parts";
import { type RouteHostKind, resolveHostRoute } from "./host-route.js";
import { type ProductObjectKind, presentationFor } from "./object-presentation.js";

export type NavigateFn = (path: string) => void;

/** Page-supplied routing context the source-agnostic adapter cannot know. */
export interface OpenHandlerContext {
	/** Callback to open a session view (entry + sub-agent recursion). No route — page owns placement. */
	readonly onOpenSession?: (sessionId: string) => void;
	readonly onInspectPath?: (path: string) => void;
}

function objectKindForHost(hostKind: RouteHostKind): ProductObjectKind | null {
	switch (hostKind) {
		case "task":
		case "document":
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
				openInspect(
					kind,
					target.blockId ? `${path}#block-${encodeURIComponent(target.blockId)}` : path,
					navigate,
					ctx,
				);
				return;
			}
			case "review": {
				const path = `/reviews/${target.reviewId}?threadId=${encodeURIComponent(target.threadId)}`;
				if (target.intent === "inspect") openInspect("review", path, navigate, ctx);
				else navigate(path);
				return;
			}
			case "session":
				if (presentationFor("session", "inspect") === "pane") {
					ctx?.onOpenSession?.(target.sessionId);
				}
				return;
		}
	};
}
