import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ command, mode }) => {
	// @lore proven-bug trap: setting `process.env.NODE_ENV` here is NOT enough — Vite's
	// own `resolveConfig` already pins `NODE_ENV` to "production" for a build before this
	// config function even runs (defaultNodeEnv is a build-time constant), so that write is
	// a no-op. The actual leak happens LATER: `resolveConfig` still calls `loadEnv`, which
	// reads any `NODE_ENV=development` line from a machine-local `.env` into the internal
	// `process.env.VITE_USER_NODE_ENV` (only if that var is `undefined` — checked with
	// `=== void 0`), and then unconditionally forces `process.env.NODE_ENV` back to
	// "development" whenever that internal var reads "development" — flipping
	// `import.meta.env.DEV`/`.PROD` for the WHOLE production bundle even under `vite build`
	// (confirmed by grepping the built bundle: a dev-only string shipped in production; see
	// abb6b26cb for the ws-client.ts symptom this caused elsewhere). Since `loadEnv` only
	// writes `VITE_USER_NODE_ENV` when it is still `undefined`, pre-setting it here (which
	// runs before `loadEnv`, since Vite loads this config file first) blocks the .env value
	// from ever landing — an empty string is intentionally falsy so the later "was it
	// exactly 'development'?" check is skipped with no warning noise. Dev (`serve`) and test
	// modes are untouched — this config function is not used by vitest.
	if (command === "build" && mode === "production") {
		process.env.VITE_USER_NODE_ENV = "";
	}
	return {
		plugins: [tailwindcss(), react()],
		server: {
			port: 5173,
			fs: {
				allow: ["../.."],
			},
			proxy: {
				"/api": {
					// @lore N2: rewrite removed — the Hono server mounts all routes under
					// app.route("/api", api) so it expects the full /api/* path. The old
					// rewrite stripped the /api prefix, causing 404s on every proxied call.
					// apiFetch sets X-API-Key on the client side before the proxy sees the
					// request; Vite's http-proxy forwards all incoming headers by default.
					target: "http://localhost:3001",
					changeOrigin: true,
				},
			},
		},
	};
});
