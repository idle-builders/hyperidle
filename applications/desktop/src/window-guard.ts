import type { WebContents } from "electron";

/** True when `url` is on the app's own origin. Anything unparseable, opaque or `data:` is not. */
export function ownsUrl(appUrl: string, url: string): boolean {
	if (!URL.canParse(url)) return false;
	const origin = new URL(url).origin;
	return origin !== "null" && origin === new URL(appUrl).origin;
}

const isWeb = (url: string): boolean =>
	/^https?:$/.test(URL.canParse(url) ? new URL(url).protocol : "");

/**
 * What a window may do. Pages inside the app (a review's preview, an agent's app) are untrusted, so
 * the window itself refuses what they would reach for: new in-app windows, leaving the app's address,
 * and the mic for anything but the app's own pages. Web links go to the person's browser instead.
 */
export function guardContents(
	contents: Pick<WebContents, "setWindowOpenHandler" | "on" | "session">,
	appUrl: string,
	openExternal: (url: string) => void,
): void {
	// @lore: window.open from a page must never become an in-app window (it would inherit the preload and the API key) — only http(s) leaves, to the browser
	contents.setWindowOpenHandler(({ url }) => {
		if (isWeb(url) && !ownsUrl(appUrl, url)) openExternal(url);
		return { action: "deny" };
	});
	contents.on("will-navigate", (event, url) => {
		if (ownsUrl(appUrl, url)) return;
		event.preventDefault();
		if (isWeb(url)) openExternal(url);
	});
	// @lore: only the mic, only for the app's own pages — huddles need it; the Record button uses the native helper and asks nothing of the page
	contents.session.setPermissionRequestHandler((_wc, permission, callback, details) => {
		const mediaTypes = (details as { mediaTypes?: string[] }).mediaTypes ?? [];
		const audioOnly = mediaTypes.length > 0 && mediaTypes.every((t) => t === "audio");
		callback(permission === "media" && audioOnly && ownsUrl(appUrl, details.requestingUrl));
	});
	contents.session.setPermissionCheckHandler(
		(_wc, permission, requestingOrigin) =>
			permission === "media" && ownsUrl(appUrl, requestingOrigin),
	);
}
