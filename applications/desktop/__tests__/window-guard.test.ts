import { describe, expect, it, vi } from "vitest";
import { guardContents, ownsUrl } from "../src/window-guard.js";

const APP = "http://127.0.0.1:3001";

type Handler = (...args: never[]) => unknown;
type Any = (...args: unknown[]) => unknown;
function fakeContents() {
	const on: Record<string, Handler> = {};
	let open: Handler = () => ({ action: "allow" });
	let request: Handler = () => undefined;
	let check: Handler = () => undefined;
	return {
		contents: {
			setWindowOpenHandler: (h: Handler) => {
				open = h;
			},
			on: (name: string, h: Handler) => {
				on[name] = h;
			},
			session: {
				setPermissionRequestHandler: (h: Handler) => {
					request = h;
				},
				setPermissionCheckHandler: (h: Handler) => {
					check = h;
				},
			},
		},
		on,
		open: (url: string) => (open as (d: { url: string }) => unknown)({ url }),
		request: (permission: string, url: string, mediaTypes?: string[]) => {
			const cb = vi.fn();
			(request as Any)({}, permission, cb, { requestingUrl: url, mediaTypes });
			return cb.mock.calls[0]?.[0];
		},
		check: (permission: string, origin: string) =>
			(check as Any)({}, permission, origin, { requestingUrl: origin }),
	};
}

describe("ownsUrl", () => {
	it("is true only for the app's own origin", () => {
		expect(ownsUrl(APP, `${APP}/x?y=1`)).toBe(true);
		expect(ownsUrl(APP, "http://127.0.0.1:3002/")).toBe(false);
		expect(ownsUrl(APP, "https://evil.example/")).toBe(false);
		expect(ownsUrl(APP, "not a url")).toBe(false);
		expect(ownsUrl(APP, "data:text/html,x")).toBe(false);
	});
});

describe("guardContents", () => {
	it("denies window.open and sends only http(s) to the browser", () => {
		const f = fakeContents();
		const openExternal = vi.fn();
		guardContents(f.contents as never, APP, openExternal);
		expect(f.open("https://example.com/a")).toEqual({ action: "deny" });
		expect(f.open("javascript:alert(1)")).toEqual({ action: "deny" });
		expect(f.open("file:///etc/passwd")).toEqual({ action: "deny" });
		expect(f.open(`${APP}/page`)).toEqual({ action: "deny" });
		expect(openExternal).toHaveBeenCalledTimes(1);
		expect(openExternal).toHaveBeenCalledWith("https://example.com/a");
	});

	it("blocks navigation away from the app and sends web links out", () => {
		const f = fakeContents();
		const openExternal = vi.fn();
		guardContents(f.contents as never, APP, openExternal);
		const nav = f.on["will-navigate"] as (e: { preventDefault(): void }, url: string) => void;
		const own = { preventDefault: vi.fn() };
		nav(own, `${APP}/c/1`);
		expect(own.preventDefault).not.toHaveBeenCalled();
		const away = { preventDefault: vi.fn() };
		nav(away, "https://evil.example/");
		expect(away.preventDefault).toHaveBeenCalled();
		expect(openExternal).toHaveBeenCalledWith("https://evil.example/");
	});

	it("grants the mic to the app's own pages only", () => {
		const f = fakeContents();
		guardContents(f.contents as never, APP, vi.fn());
		expect(f.request("media", `${APP}/`, ["audio"])).toBe(true);
		expect(f.request("media", "https://evil.example/", ["audio"])).toBe(false);
		expect(f.request("media", "about:srcdoc", ["audio"])).toBe(false);
		expect(f.request("media", `${APP}/`, ["video"])).toBe(false);
		expect(f.request("geolocation", `${APP}/`)).toBe(false);
		expect(f.check("media", APP)).toBe(true);
		expect(f.check("media", "https://evil.example")).toBe(false);
		expect(f.check("notifications", APP)).toBe(false);
	});
});
