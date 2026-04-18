import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

/**
 * @lore RTL's waitFor checks `typeof jest !== 'undefined'` to detect fake
 * timers and use jest.advanceTimersByTime for retries. Without this shim,
 * waitFor falls back to real setInterval which never fires under
 * vi.useFakeTimers(), causing every waitFor call to hang until test timeout.
 * Vitest does not expose a `jest` global even with globals:true.
 */
globalThis.jest = {
	...globalThis.jest,
	advanceTimersByTime: vi.advanceTimersByTime.bind(vi),
} as typeof jest;

/**
 * @lore React Router v7 creates Request objects with AbortSignal via
 * `createClientSideRequest`. Under jsdom + Bun, the AbortSignal from jsdom
 * doesn't match Node's native AbortSignal class, causing:
 *   TypeError: RequestInit: Expected signal ("AbortSignal {}") to be an instance of AbortSignal
 * Fix: Replace the global Request constructor with one that strips the signal
 * from the RequestInit before passing to the native Request, then re-applies it.
 * This only affects tests — production code runs in a real browser.
 */
const OriginalRequest = globalThis.Request;
class PatchedRequest extends OriginalRequest {
	constructor(input: RequestInfo | URL, init?: RequestInit) {
		if (init?.signal) {
			const { signal, ...rest } = init;
			super(input, rest);
			// Re-define the signal property with the original value so React Router
			// can still read it, but the constructor doesn't throw.
			Object.defineProperty(this, "signal", {
				get() {
					return signal;
				},
			});
		} else {
			super(input, init);
		}
	}
}
globalThis.Request = PatchedRequest as typeof Request;

/**
 * @lore I4 R1/R2: jsdom does not implement `window.matchMedia`. The
 * `useViewportBreakpoint` hook uses it to compute whether Submenu/Rail should
 * collapse by default. Without this polyfill the hook throws on mount.
 *
 * We install a configurable mock so individual tests can override the return
 * value by setting `window.innerWidth` and re-stubbing the function; by
 * default we evaluate the query's `max-width` expression against the current
 * `window.innerWidth` so responsive tests "just work" when they set the
 * viewport size via `Object.defineProperty(window, 'innerWidth', ...)`.
 */
// jsdom defaults `window.innerWidth` to 1024, which lands the AppShell in
// the Rail-collapsed layout (the breakpoint is >=1280). Force a desktop
// viewport so legacy tests that assume the expanded layout keep passing;
// individual tests can override via `Object.defineProperty(window, ...)`.
Object.defineProperty(window, "innerWidth", {
	writable: true,
	configurable: true,
	value: 1920,
});
Object.defineProperty(window, "innerHeight", {
	writable: true,
	configurable: true,
	value: 1080,
});

if (typeof window.matchMedia !== "function") {
	function evaluateQuery(query: string): boolean {
		const maxMatch = query.match(/max-width:\s*(\d+)px/);
		const minMatch = query.match(/min-width:\s*(\d+)px/);
		const width = window.innerWidth;
		if (maxMatch) return width <= Number(maxMatch[1]);
		if (minMatch) return width >= Number(minMatch[1]);
		return false;
	}
	Object.defineProperty(window, "matchMedia", {
		writable: true,
		configurable: true,
		value: (query: string): MediaQueryList => ({
			matches: evaluateQuery(query),
			media: query,
			onchange: null,
			addListener: () => {},
			removeListener: () => {},
			addEventListener: () => {},
			removeEventListener: () => {},
			dispatchEvent: () => false,
		}),
	});
}

afterEach(() => {
	cleanup();
});
