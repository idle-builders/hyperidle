/**
 * AG4 — Pure parent-path resolver.
 *
 * Returns the explicit structural parent path for a known route, or null for
 * unmatched routes. Callers must no-op on null.
 *
 * @lore AE4: Up is never navigate(-1). An unmatched route returns null so the
 * caller does nothing — never silently falls back to history traversal. That
 * fallback conflates Up (structural) with Back (temporal) and breaks deep links.
 * See AppShell @lore AE4.
 *
 * @lore AG4: Extracted from AppShell navigateToParent (mobile-only in AE4) so
 * both the mobile back button and the desktop breadcrumb cluster compute the
 * same Up target from a single pure function.
 */

/**
 * Returns the structural parent path for a known app route, or null if the
 * pathname does not match any detail route with a defined parent.
 *
 * Matched route → parent mapping:
 *   /work/bet/:id/task/:taskId  → /work/bet/:id
 *   /work/bet/:id               → /work  (AD9: was /work/portfolio)
 *   /work/routine/:id           → /work  (AD9: was /work/portfolio)
 *   /work/team/:id              → /work  (AD9: was /work/portfolio)
 *   /knowledge/:id              → /knowledge  (excludes /knowledge/new)
 *   /agents/:id                 → /conversations
 *   /conversations/:id          → /conversations
 *
 * @param pathname - The current location.pathname
 * @returns The explicit parent path string, or null for unmatched routes.
 */
export function parentPathFor(pathname: string): string | null {
	// Task nested under bet: /work/bet/:id/task/:taskId → /work/bet/:id
	const betTaskMatch = pathname.match(/^\/work\/bet\/([^/]+)\/task\//);
	if (betTaskMatch) {
		return `/work/bet/${betTaskMatch[1]}`;
	}

	// Bet detail: /work/bet/:id → /work (AD9: was /work/portfolio)
	if (/^\/work\/bet\/[^/]+/.test(pathname)) {
		return "/work";
	}

	// Routine detail: /work/routine/:id → /work (AD9: was /work/portfolio)
	if (/^\/work\/routine\/[^/]+/.test(pathname)) {
		return "/work";
	}

	// Team detail: /work/team/:id → /work (AD9: was /work/portfolio)
	if (/^\/work\/team\/[^/]+/.test(pathname)) {
		return "/work";
	}

	// Knowledge detail: /knowledge/:id → /knowledge
	// @lore AE4: /knowledge/new is a create page — excluded from detail routes.
	if (/^\/knowledge\/(?!new$)[^/]+/.test(pathname)) {
		return "/knowledge";
	}

	// Agent detail: /agents/:id → /conversations
	if (/^\/agents\/[^/]+/.test(pathname)) {
		return "/conversations";
	}

	// Conversation thread: /conversations/:id → /conversations
	if (/^\/conversations\/[^/]+/.test(pathname)) {
		return "/conversations";
	}

	// Unmatched — no structural parent. Caller must no-op. Never navigate(-1).
	return null;
}
