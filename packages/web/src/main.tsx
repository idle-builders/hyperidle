import * as React from "react";
import { StrictMode } from "react";
import * as ReactJsxRuntime from "react/jsx-runtime";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "./index.css";
import { loadFolderSurfaces } from "./pages/review/surface-loader.js";

/**
 * AL5: Expose React and jsx-runtime on window globals so dropped surface modules
 * can share the host's single React instance.
 *
 * The import map in index.html maps "react" → /api/surfaces/_shims/react.js and
 * "react/jsx-runtime" → /api/surfaces/_shims/jsx-runtime.js. Those shims
 * re-export from these globals. This ensures dropped modules use the same React
 * instance as the host app — preventing the "invalid hook call" error that occurs
 * when two React copies coexist.
 *
 * @lore AL5: We use window globals (not a module export or context) because the
 * dropped .js modules are loaded via dynamic import() from a URL. They cannot
 * receive React via function arguments or React context at load time. The shim
 * approach is the standard pattern for micro-frontends with shared React.
 */
declare global {
	interface Window {
		__hyperidleReact: typeof React;
		__hyperidleJsxRuntime: typeof ReactJsxRuntime;
	}
}

window.__hyperidleReact = React;
window.__hyperidleJsxRuntime = ReactJsxRuntime;

/**
 * AL5: Load folder surfaces before mounting React so getReviewSurface() is
 * populated synchronously when components render for the first time.
 * Failures are isolated — a failed load does not block app startup.
 *
 * @lore AL5: Boot runs inside an async IIFE (NOT top-level await) — the Vite
 * build target (chrome87/es2020) does not allow top-level await, which breaks
 * `vite build`. The IIFE keeps "load surfaces before first render" without it.
 */
async function boot(): Promise<void> {
	await loadFolderSurfaces();

	const root = document.getElementById("root");
	if (!root) throw new Error("Root element not found");

	createRoot(root).render(
		<StrictMode>
			<App />
		</StrictMode>,
	);
}

void boot();
