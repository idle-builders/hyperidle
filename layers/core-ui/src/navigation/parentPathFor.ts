// @lore: Up — never navigate(-1); unmatched route returns null; caller must no-op; conflating Up (structural) with Back (temporal) breaks direct links

export function parentPathFor(pathname: string): string | null {
	if (/^\/work\/task\/[^/]+/.test(pathname)) {
		return "/work";
	}

	if (/^\/work\/team\/[^/]+/.test(pathname)) {
		return "/work";
	}

	// /documents/new is a create page — excluded from detail routes
	if (/^\/documents\/(?!new$)[^/]+/.test(pathname)) {
		return "/documents";
	}

	if (/^\/agents\/[^/]+/.test(pathname)) {
		return "/conversations";
	}

	if (/^\/conversations\/[^/]+/.test(pathname)) {
		return "/conversations";
	}

	// Unmatched — no structural parent. Caller must no-op. Never navigate(-1).
	return null;
}
