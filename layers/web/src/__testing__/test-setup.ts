/// <reference types="node" />
//
// @lore AU28: the triple-slash reference above is load-bearing. `layers/web`'s
// ~110 test-file references to the Node `global` object were resolving only because
// the dead Hono RPC client (`src/api/client.ts`, zero call sites) imported
// `@hyperidle/core-api`, whose type graph pulled `@types/node` into the web program
// as a side effect. Deleting that file under AU28 Ruling 4.1 removed the accidental
// load and reded 111 `Cannot find name 'global'` errors. Declaring the reference here
// makes the dependency explicit instead of inherited from a file nobody imported.

import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

/**
 * @lore Q1: The ws-client singleton lazily connects to the WebSocket server.
 * In JSDOM tests, `global.fetch` is typically mocked per-test to return
 * specific responses for API calls. Without this module mock, the WS client's
 * `connect()` method would call `apiFetch("/api/auth/ws-token")` which
 * intercepts mocked `fetch` calls intended for other API endpoints (e.g.
 * `/api/threads`), corrupting per-test `fetchMock` call-count assertions.
 * Mocking the module here prevents any WS connection attempts in unit tests.
 */
vi.mock("../services/ws-client.js", () => ({
	getWsClient: () => ({
		subscribe: () => () => undefined,
	}),
	// @lore AU26 J3: the second socket (agent-orchestration's `session:<id>`
	// stream) needs the same no-op stub as core's.
	getSessionStreamClient: () => ({
		subscribe: () => () => undefined,
	}),
}));

// @lore Node 26 defines globalThis.localStorage as experimental (returns undefined
// without --localstorage-file). This shadows jsdom's localStorage on the window object.
// Provide an in-memory Storage polyfill so tests that use localStorage work.
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
 * @lore RTL's waitFor checks `typeof jest !== 'undefined'` to detect fake
 * timers and use jest.advanceTimersByTime for retries. Without this shim,
 * waitFor falls back to real setInterval which never fires under
 * vi.useFakeTimers(), causing every waitFor call to hang until test timeout.
 * Vitest does not expose a `jest` global even with globals:true.
 */
// @lore AF5: globalThis has no index signature; cast to Record to suppress TS7017.
// typeof jest is a namespace not a value; cast via unknown to suppress TS2708.
// This shim is test-only and the cast is safe — we are constructing the minimal
// jest-compat shape that RTL's waitFor checks for fake-timer detection.
const globalAny = globalThis as Record<string, unknown>;
globalAny.jest = {
	...(globalAny.jest as Record<string, unknown>),
	advanceTimersByTime: vi.advanceTimersByTime.bind(vi),
};

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
 * `useViewportBreakpoint` hook uses it to determine the sidebar mobile
 * breakpoint. Without this polyfill the hook throws on mount.
 *
 * We install a configurable mock so individual tests can override the return
 * value by setting `window.innerWidth` and re-stubbing the function; by
 * default we evaluate the query's `max-width` expression against the current
 * `window.innerWidth` so responsive tests "just work" when they set the
 * viewport size via `Object.defineProperty(window, 'innerWidth', ...)`.
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
 * @lore AB3: jsdom does not implement HTMLDialogElement.showModal() or
 * HTMLDialogElement.close(). Native <dialog> elements used in AgentEditDialog
 * and AgentAddDialog call these methods. We polyfill them so component tests
 * can exercise dialog open/close behavior without a real browser.
 *
 * The polyfill sets/removes the `open` attribute (which is what browsers do)
 * so `getByRole("dialog")` still works via the dialog element's `open` state.
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
