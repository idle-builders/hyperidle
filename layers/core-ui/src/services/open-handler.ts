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
 *   host    → resolveHostRoute(hostKind, hostId)   (total over BlockHostKind; null = no-op, e.g. user)
 *   artifact→ /artifacts/:id
 *   review  → /work/bet/:betId/review/:reviewId
 *   session → AM3 dial-in — NO destination yet; documented no-op (R3). AM1 must
 *             not invent a fabricated path.
 *
 * @lore AM1 C1: a block/entity routes to its HOST surface via `resolveHostRoute`
 * — the existing resolver, total over `BlockHostKind`. No new route table, no
 * fabricated `knowledgeId`. `user` resolves to null → no navigation (matching
 * the resolver's existing null return).
 *
 * @lore AM1 ARCH-1: a review Message carries NO betId (`ReviewPayload` has none),
 * so the source-agnostic Message→Part adapter cannot source it and emits an empty
 * placeholder `betId`. The betId is owned by the PAGE, which holds the thread→host
 * context (a bet-hosted thread's host id IS the bet). The page supplies it via
 * `createOpenHandler(navigate, { betId })`. The handler prefers the page-supplied
 * betId, falls back to a non-empty betId carried on the target, and — when NEITHER
 * is available — performs a documented NO-OP rather than navigating to a malformed
 * `/work/bet//review/:id` dead URL (graceful degradation). The adapter stays
 * source-agnostic; betId resolution lives entirely at this page/handler seam.
 */

import type { OpenHandler, OpenTarget } from "@hyperidle/conversation-parts";
import { resolveHostRoute } from "./host-route.js";

export type NavigateFn = (path: string) => void;

/** Page-supplied routing context the source-agnostic adapter cannot know (ARCH-1). */
export interface OpenHandlerContext {
	/**
	 * The bet the conversation belongs to, when resolvable from thread→host
	 * context (host IS a bet). `null`/absent when the host is a task/other and the
	 * bet cannot be cheaply sourced — the review open action then no-ops instead of
	 * routing to a dead URL.
	 */
	readonly betId?: string | null;
	/**
	 * AM3: callback to open a session view (entry + sub-agent recursion).
	 * When supplied, fires for `case "session"` instead of the old no-op.
	 * A sub-agent `tool` row fires the SAME open seam → the same surface, recursed.
	 *
	 * @lore AM3 R3: AM1 documented this as a no-op; AM3 fills it. No new route —
	 * the surface is opened via this callback (the page owns the placement).
	 */
	readonly onOpenSession?: (sessionId: string) => void;
}

export function createOpenHandler(navigate: NavigateFn, ctx?: OpenHandlerContext): OpenHandler {
	return (target: OpenTarget): void => {
		switch (target.route) {
			case "host": {
				const path = resolveHostRoute(target.hostKind, target.hostId);
				if (path === null) return;
				// @lore AM5 T8: append #block-<encodeURIComponent(blockId)> for block-anchored open (AC2).
				// No selector concat — the fragment is matched by value at the scroll site (KnowledgeDetail).
				navigate(target.blockId ? `${path}#block-${encodeURIComponent(target.blockId)}` : path);
				return;
			}
			case "artifact":
				navigate(`/artifacts/${target.artifactId}`);
				return;
			case "review": {
				// Prefer the page-supplied betId (authoritative — it has thread→host
				// context); fall back to a non-empty betId carried on the target.
				const pageBetId =
					ctx?.betId !== undefined && ctx.betId !== null && ctx.betId !== "" ? ctx.betId : null;
				const targetBetId = target.betId !== "" ? target.betId : null;
				const betId = pageBetId ?? targetBetId;
				// No bet → no valid review route. Documented no-op (no dead URL).
				if (betId === null) return;
				navigate(`/work/bet/${betId}/review/${target.reviewId}`);
				return;
			}
			case "session":
				// AM3: fire the page-supplied callback to open/recurse the session view.
				// A sub-agent tool row carries the same `session` OpenTarget → same surface.
				// No navigation: the surface is opened via the callback (page owns placement).
				ctx?.onOpenSession?.(target.sessionId);
				return;
		}
	};
}
