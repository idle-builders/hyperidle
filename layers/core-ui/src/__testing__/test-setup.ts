/// <reference types="node" />
//
// @lore /// <reference types="node" /> is load-bearing — makes @types/node explicit in core-ui; without it, ~110 test files can't resolve Node global

import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

/**
 * @lore ws-client mocked at module level — ws calls apiFetch("/api/auth/ws-token") which intercepts per-test fetch mocks; corrupts call-count assertions
 */
vi.mock("../services/ws-client.js", () => ({
	getWsClient: () => ({
		subscribe: () => () => undefined,
	}),
}));

// @lore Node 26 globalThis.localStorage experimental (undefined without --localstorage-file); shadows jsdom's localStorage; in-memory polyfill ensures tests work
if (typeof window !== "undefined" && window.localStorage === undefined) {
	const store = new Map<string, string>();
	const storage: Storage = {
		get length() {
			return store.size;
		},
		clear() {
			store.clear();
		},
		getItem(key: string) {
			return store.get(key) ?? null;
		},
		key(index: number) {
			return [...store.keys()][index] ?? null;
		},
		removeItem(key: string) {
			store.delete(key);
		},
		setItem(key: string, value: string) {
			store.set(key, value);
		},
	};
	Object.defineProperty(window, "localStorage", {
		value: storage,
		writable: true,
		configurable: true,
	});
}

/**
 * @lore RTL's waitFor checks typeof jest for fake timers; without shim falls back to real setInterval (hangs under vi.useFakeTimers()); Vitest has no jest global
 */
// @lore globalThis cast to Record: no index signature (TS7017); jest namespace cast via unknown (TS2708); test-only shim for RTL waitFor fake-timer detection
const globalAny = globalThis as Record<string, unknown>;
globalAny.jest = {
	...(globalAny.jest as Record<string, unknown>),
	advanceTimersByTime: vi.advanceTimersByTime.bind(vi),
};

/**
 * @lore React Router v7: jsdom AbortSignal doesn't match Node's native class; PatchedRequest strips signal from RequestInit then re-applies it; test-only
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
 * @lore jsdom lacks window.matchMedia; useViewportBreakpoint hook uses it for sidebar mobile breakpoint; polyfill prevents throw on mount
 */
// jsdom defaults `window.innerWidth` to 1024, which is below the 1280px
// desktop breakpoint. Force a desktop viewport so tests that assume
// the sidebar-visible layout keep passing; individual tests can override
// via `Object.defineProperty(window, ...)`.
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
		value: (query: string): MediaQueryList => {
			// Stub event-listener methods — we don't dispatch matchMedia
			// changes from tests; reads are recomputed via window.innerWidth
			// at each `matchMedia()` call instead.
			const noop = (): void => undefined;
			return {
				matches: evaluateQuery(query),
				media: query,
				onchange: null,
				addListener: noop,
				removeListener: noop,
				addEventListener: noop,
				removeEventListener: noop,
				dispatchEvent: () => false,
			};
		},
	});
}

/**
 * @lore jsdom lacks HTMLDialogElement.showModal()/close(); polyfill lets component tests exercise dialog open/close (sets/removes 'open' attribute)
 */
if (typeof window !== "undefined" && !window.HTMLDialogElement.prototype.showModal) {
	Object.assign(window.HTMLDialogElement.prototype, {
		showModal(this: HTMLDialogElement) {
			this.setAttribute("open", "");
		},
		close(this: HTMLDialogElement) {
			this.removeAttribute("open");
			this.dispatchEvent(new Event("close"));
		},
	});
}

afterEach(() => {
	cleanup();
});
