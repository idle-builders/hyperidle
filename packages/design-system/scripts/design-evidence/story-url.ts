/**
 * AJ4 — story-url: module title → viewer hash route.
 *
 * The design-system viewer (ds:serve, :8098) uses hash-based routing.
 * The title is percent-encoded so slashes (e.g. "AG6/RowDot") do not
 * conflict with URL path separators.
 */

/**
 * Build the viewer URL to open a story for inspection.
 *
 * @param title - Module title as it appears in the .snap key, e.g. "AG6/RowDot"
 * @param base  - Viewer origin; defaults to "http://localhost:8098"
 * @returns     - Hash route URL, e.g. "http://localhost:8098/#AG6%2FRowDot"
 */
export function storyViewerUrl(title: string, base = "http://localhost:8098"): string {
	return `${base}/#${encodeURIComponent(title)}`;
}
