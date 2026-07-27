/**
 * AU21 — `CoreApiPort`: the location-transparent `agent-orchestration →
 * core-api` write seam (architecture.md §6 Decision A/C, §10, §11).
 *
 * TYPE-ONLY. `@hyperidle/api-contract` stays zero-runtime-deps
 * (`package.json` declares no `dependencies`) — every type below is a
 * hand-written mirror of a real core-api route, NOT generated from
 * `AppType` (bare `Hono`, `packages/core-api/src/app.ts:673` — no per-route
 * schema survives `app.route(path, sub)` mutation, per that file's own
 * `@lore AF4/§4g`). Because `AppType` carries no schema, `tsc` cannot verify
 * these mirrors against the real routes — fidelity is a TESTED obligation
 * (§11 contract tests: each `CoreApiPort` method gets a test that reaches
 * its real backing route through the in-process transport), never a
 * compiler guarantee.
 *
 * Seeded (Increment 1) with `work.createBet`, mirroring `POST /bets`'s
 * validated request body (`createBetSchema`, `routes/bets.ts:53-75`) and
 * 201 response body (`routes/bets.ts:609-638`). Later increments (§9
 * Increment 2) add the remaining `tool-handlers` capabilities as more
 * narrow methods on more `CoreApiPort` families — never a generic
 * pass-through, per Decision C's "narrow hand-typed method groups" ruling.
 */

/** Mirrors `POST /bets`'s validated request body (`createBetSchema`, `routes/bets.ts:53-75`). */
export interface CreateBetRequest {
	readonly teamId: string;
	readonly description: string;
	readonly doneCondition?: string;
	readonly hypothesis?: string;
	readonly costAppetite?: { readonly minor: number; readonly currency: string } | null;
	readonly sourceKnowledgeItemId?: string;
}

/**
 * Mirrors `POST /bets`'s 201 response body — the created bet row
 * (`work.get(db,"bet",id)`) plus the structured `costAppetite` override
 * (`routes/bets.ts:623-638`). Not an exhaustive column-for-column mirror of
 * the `bets` table (per this file's top `@lore`, only the fields a
 * `CoreApiPort` consumer relies on are declared) — the real response may
 * carry additional raw columns this type does not name.
 */
export interface CreateBetResponse {
	readonly id: string;
	readonly teamId: string;
	readonly description: string;
	readonly doneCondition: string | null;
	readonly hypothesis: string | null;
	readonly status: string;
	readonly createdAt: string;
	readonly revisionLog: string | null;
	readonly costAppetite: { readonly minor: number; readonly currency: string } | null;
	readonly sourceKnowledgeItemId: string | null;
}

/**
 * The agent's tool-facing `work` capability family (Decision C). `work` is
 * the only populated family in Increment 1; Increment 2 adds the remaining
 * `tool-handlers` reads/writes (`getTaskById`/`getBetById`/`updateBetById`/…)
 * and later increments add `conversation`/`knowledge`/`org`/`routine`/`users`.
 */
export interface CoreApiWorkPort {
	createBet(input: CreateBetRequest): Promise<CreateBetResponse>;
}

/**
 * `CoreApiPort` — a per-core-Service family of narrow hand-typed method
 * groups, each Application-adapted onto the `hc<AppType>` client
 * (`buildCoreApiPort`, `packages/core-api/src/services/
 * core-api-port-composition.ts`).
 */
export interface CoreApiPort {
	readonly work: CoreApiWorkPort;
}

/**
 * The seam's injectable transport. Deliberately the single-`Request`
 * fetch-HANDLER shape (`(req: Request) => Promise<Response>` — Hono's own
 * `app.fetch` signature), NOT the two-argument `(url, init) => Promise<Response>`
 * shape `hc`'s own `fetch` option expects. `buildCoreApiPort` adapts one to
 * the other at its boundary — this is what makes the SAME transport type
 * usable both in-process (`app.fetch`, ignores host/port, routes on
 * pathname only) and over a real network (a real remote core-api's fetch
 * handler) with zero call-site change (architecture.md §10 — "=== hc's
 * injectable fetch").
 */
export type CoreApiTransport = (req: Request) => Promise<Response>;
