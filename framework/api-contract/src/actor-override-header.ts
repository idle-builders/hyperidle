/**
 * The actor-override header name for a service-to-service write that must
 * run as a specific user rather than the request's own caller — the
 * transport-level identity override `agent-orchestration` sets when it
 * calls back into `core-api` on an agent's behalf.
 *
 * @lore BC5 T11: this constant used to live in `core-api-port.ts` beside
 * `CoreApiPort` — the whole write seam that constant served. That seam is
 * deleted (the last two tools it carried, `create_team`/`add_agent`, are
 * gone), but BOTH sides still need this ONE name: core-api's
 * `middleware/auth.ts` reads it server-side, and any transport that still
 * dials core-api on another actor's behalf sets it client-side. A
 * wire-protocol constant both layers must agree on belongs in the contract
 * package, not inside either layer — so it gets its own file instead of
 * going down with the seam.
 */
export const CORE_API_ACTOR_OVERRIDE_HEADER = "x-hyperidle-actor-id";
