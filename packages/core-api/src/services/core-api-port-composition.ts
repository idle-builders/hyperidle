/**
 * AU21 Increment 1 — `CoreApiPort` write seam: Application-layer composition
 * root (architecture.md §6 Decision A/C, §9 Increment 1, §10).
 *
 * This is the ONE place that adapts the seam's location-transparent
 * `CoreApiTransport` (a single-`Request` fetch-handler, `===` Hono's own
 * `app.fetch` shape) onto the real `hc<AppType>` Hono-RPC client — the exact
 * literal pattern already proven at `packages/web/src/api/client.ts`
 * (`hc<AppType>(baseUrl, {fetch})`), reused here Application-side instead of
 * client-side.
 *
 * `AppType` is bare `Hono` (`app.ts:673` — no per-route schema survives
 * `app.route(path, sub)` mutation), so `hc<AppType>(...)` resolves to an
 * opaque type at the TS level. `buildBetsHcClient` below performs the ONE
 * audited cast recovering a usable shape — contained in a named helper via
 * an intermediate `unknown`-typed variable (NOT a `X as unknown as T`
 * double-assertion, which `design/no-unknown-cast` bans; same idiom as
 * `run-orchestration-composition.ts`'s `widenWorkerRegistration`). Fidelity
 * between `CoreApiHcClient` and the real `POST /bets` route is a TESTED
 * obligation (§11 contract tests, `__tests__/core-api-port.integration.test.ts`),
 * never a compiler guarantee.
 */

import type {
	CoreApiPort,
	CoreApiTransport,
	CreateBetRequest,
	CreateBetResponse,
} from "@hyperidle/api-contract";
import type { Hono } from "hono";
import { hc } from "hono/client";
import type { AppType } from "../schemas/index.js";
import { CORE_API_ACTOR_OVERRIDE_HEADER } from "./actor-transport-header.js";

/**
 * Hand-typed mirror of the real `POST /bets` endpoint's `hc` client shape
 * (`bets.$post({json})` — `mergePath` + `$post` produce `${baseUrl}/bets`
 * POST, matching `app.route("/api", api)` + `api.route("/bets",
 * createBetRoutes(...))`, `app.ts:460`). The ONLY hand-written mirror
 * Increment 1 needs; Increment 2 adds one property per additional method.
 */
interface CoreApiHcClient {
	readonly bets: {
		$post(args: { readonly json: CreateBetRequest }): Promise<Response>;
	};
}

/** Placeholder origin for hc's internal URL construction — see this file's top `@lore`. */
const SEAM_PLACEHOLDER_BASE_URL = "http://core-api.internal/api";

function buildBetsHcClient(fetchAdapter: typeof fetch): CoreApiHcClient {
	const client: unknown = hc<AppType>(SEAM_PLACEHOLDER_BASE_URL, { fetch: fetchAdapter });
	return client as CoreApiHcClient;
}

/**
 * Builds a real `CoreApiPort` wired to the given transport. The transport
 * decides WHERE the request actually goes (in-process `app.fetch` or a real
 * network `fetch`) — this factory only ever adapts the seam's single-
 * `Request` transport shape onto hc's two-argument `(url, init) => fetch`
 * shape (architecture.md §10's `CoreApiTransport === hc's injectable fetch`).
 */
export function buildCoreApiPort(transport: CoreApiTransport): CoreApiPort {
	const fetchAdapter: typeof fetch = (input, init) => transport(new Request(input, init));
	const client = buildBetsHcClient(fetchAdapter);

	return {
		work: {
			async createBet(input: CreateBetRequest): Promise<CreateBetResponse> {
				const res = await client.bets.$post({ json: input });
				if (!res.ok) {
					const body = await res.text();
					throw new Error(`CoreApiPort.work.createBet: POST /bets failed (${res.status}): ${body}`);
				}
				return (await res.json()) as CreateBetResponse;
			},
		},
	};
}

/**
 * The in-process transport: core-api's own Hono app dispatches the request
 * directly via `app.fetch` (its real fetch-handler), with zero network hop.
 * `app.fetch` ignores the request's host/port entirely — it routes on
 * pathname only — so the seam's placeholder origin above is never actually
 * reached over a socket for this transport.
 */
export function createInProcessCoreApiTransport(app: Hono): CoreApiTransport {
	return async (req: Request) => app.fetch(req);
}

/**
 * The split/remote transport: a real network `fetch` against a real,
 * separately-running core-api instance at `baseUrl`. Preserves the seam
 * request's method/headers/body verbatim, retargeting only the origin —
 * proving the SAME `buildCoreApiPort` call site works whether core-api is
 * colocated or split out over the network (architecture.md §6 Decision A,
 * AC #1a).
 */
export function createNetworkCoreApiTransport(baseUrl: string): CoreApiTransport {
	return async (req: Request) => {
		const seamUrl = new URL(req.url);
		const target = new URL(`${seamUrl.pathname}${seamUrl.search}`, baseUrl);
		const hasBody = req.method !== "GET" && req.method !== "HEAD";
		const body = hasBody ? await req.text() : undefined;
		return fetch(target, { method: req.method, headers: req.headers, body });
	};
}

/**
 * Wraps a transport so every request carries the calling agent's own
 * identity as the route actor (architecture.md §12) plus the API key the
 * seam's Application-layer composition root already holds — never a
 * client-supplied header from outside that boundary (see
 * `actor-transport-header.ts`'s `@lore`). Reads `HYPERIDLE_API_KEY` at
 * call-time (not at wrap-time) so it always reflects the current
 * environment.
 */
export function withActorTransport(
	transport: CoreApiTransport,
	actor: { readonly userId: string },
): CoreApiTransport {
	return async (req: Request) => {
		const hasBody = req.method !== "GET" && req.method !== "HEAD";
		const body = hasBody ? await req.text() : undefined;
		const headers = new Headers(req.headers);
		const apiKey = process.env.HYPERIDLE_API_KEY;
		if (apiKey) {
			headers.set("X-API-Key", apiKey);
		}
		headers.set(CORE_API_ACTOR_OVERRIDE_HEADER, actor.userId);
		const wrapped = new Request(req.url, { method: req.method, headers, body });
		return transport(wrapped);
	};
}

/**
 * Module-level registration point for the boot-time transport, mirroring
 * how `server-factory.ts` builds `app` exactly once and hands it to every
 * other composition root. Registered once in production
 * (`server-factory.ts`'s `createServer`) right after `createApp` resolves;
 * tests register their own per-test `{app}` fixture instance explicitly
 * (see `core-api-port.integration.test.ts` / `create-bet-coreapiport-migration.integration.test.ts`).
 */
let registeredTransport: CoreApiTransport | undefined;

export function registerCoreApiTransport(transport: CoreApiTransport): void {
	registeredTransport = transport;
}

/**
 * Read by `tool-handlers-bindings.ts`'s `coreApi` accessor at call-time
 * (never cached across calls — each tool call may carry a different
 * calling agent's actor identity via `withActorTransport`).
 */
export function getRegisteredCoreApiTransport(): CoreApiTransport {
	if (!registeredTransport) {
		throw new Error(
			"CoreApiPort transport not registered — call registerCoreApiTransport(...) during " +
				"application boot (or in a test, before invoking a tool that writes through the seam).",
		);
	}
	return registeredTransport;
}
