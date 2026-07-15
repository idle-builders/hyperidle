/**
 * Typed Hono RPC client for the HyperIdle API.
 *
 * Creates a `hc<AppType>` client instance that gives TypeScript compile-time
 * visibility into request and response shapes for every registered route.
 *
 * Usage:
 *   import { apiClient } from "@/api/client";
 *   const res = await apiClient.bets[":id"].$get({ param: { id: betId } });
 *   const data = await res.json(); // typed as the bet detail response
 *
 * Base URL:
 *   - Production / Electron: window.location.origin + "/api"
 *   - Vite dev proxy: same, because vite.config.ts proxies /api → localhost:3001
 *
 * @lore api-typesafety C1: The base URL must include "/api". AppType has
 * BasePath "/" (routes are "/bets/:id", not "/api/bets/:id"). The `hc` client
 * prepends the base URL for every request, so base URL = "<origin>/api" ensures
 * requests reach /api/bets/:id on the server.
 *
 * @lore api-typesafety S4: The client uses the X-API-Key header injection from
 * apiFetch by passing `fetch: apiFetch` as the second argument to `hc`. This
 * keeps the auth logic in one place (services/api-fetch.ts) rather than
 * duplicating it in every call site.
 */

import type { AppType } from "@hyperidle/core-api/schemas";
import { hc } from "hono/client";
import { apiFetch } from "../services/api-fetch.js";

const baseUrl =
	typeof window !== "undefined" ? `${window.location.origin}/api` : "http://localhost:3001/api";

/**
 * Type-safe Hono RPC client for the HyperIdle API.
 *
 * All requests go through `apiFetch` which injects the X-API-Key header
 * on /api/* requests (both Electron preload key and Vite dev env key).
 */
export const apiClient = hc<AppType>(baseUrl, {
	fetch: apiFetch as typeof fetch,
});

export type { AppType };
