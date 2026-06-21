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
 */

import type { OpenHandler, OpenTarget } from "@hyperidle/shared";
import { resolveHostRoute } from "./host-route.js";

export type NavigateFn = (path: string) => void;

export function createOpenHandler(navigate: NavigateFn): OpenHandler {
	return (target: OpenTarget): void => {
		switch (target.route) {
			case "host": {
				const path = resolveHostRoute(target.hostKind, target.hostId);
				if (path !== null) navigate(path);
				return;
			}
			case "artifact":
				navigate(`/artifacts/${target.artifactId}`);
				return;
			case "review":
				navigate(`/work/bet/${target.betId}/review/${target.reviewId}`);
				return;
			case "session":
				// AM3 owns the session dial-in destination. AM1 wires the hook but
				// builds no route — a documented no-op until AM3 lands (R3).
				return;
		}
	};
}
