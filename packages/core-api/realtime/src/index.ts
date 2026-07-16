/**
 * Barrel for @hyperidle/realtime (core-api Layer, non-SQL Service).
 *
 * Typed functions only. `realtime` owns ZERO tables — it is a pure
 * core→ui event-push capability (architecture §10.2 line 138: "broadcasts
 * domain events to UI clients … not infra of any one domain"), same shape
 * as `policy`'s Increment 2a / `git-export`'s Increment 2c / `observability`'s
 * Increment 2d / `model-gateway`'s Increment 2e zero-table findings. No
 * `TABLE_OWNER` row is added. `sessions` (read for session-topic authz) is
 * a direct `@hyperidle/db` read via `UNOWNED_SHARED_TABLES` — not an owned
 * table, see `ports.ts`'s top comment.
 *
 * @lore AU19 Increment 2f: this is the real cut-over — `ws-broadcaster.ts`
 * (`WsBroadcaster`/`createDbSubscribeAuthorizer`) moved here from
 * `packages/server/src/services/ws-broadcaster.ts` (behavior-preserving
 * move). Three of its real outbound edges were already census-listed
 * (architecture §10.2 lines 384-386: `realtime → work`, `realtime →
 * conversation`, `realtime → users`); a FOURTH, `realtime → org`
 * (`teamMembers` read via `senderInTeam`), was missing from the original
 * census — see `ports.ts`'s top `@lore` for the correction (§10.1/§10.2
 * row update: `realtime` moves from "3 edges / 3 calls" to "4 edges /
 * 4 calls"). All four are ordinary same-layer core-api→core-api edges, no
 * §10.3 against-grain caveat. Every real consumer
 * (`packages/server/src/server-factory.ts`, `packages/server/src/routes/ws.ts`,
 * the `ws-broadcaster.thread-topic.test.ts` + `ws-broadcaster.test.ts` unit
 * tests, and the `ws-subscribe-authz.integration.test.ts` integration test
 * needing `{db, eventBus}` fixtures) now imports from `@hyperidle/realtime`
 * instead of the deleted `packages/server/src/services/ws-broadcaster.ts`.
 */

export type {
	RealtimeOrgTeamReader,
	RealtimeTaskReader,
	RealtimeTeamMembersRow,
	RealtimeThreadReader,
	RealtimeThreadRow,
	RealtimeUserDirectory,
	RealtimeUserRow,
	SubscribeAuthorizerDeps,
} from "./ports.js";
export type { SubscribeResult, WsClient } from "./ws-broadcaster.js";
export { createDbSubscribeAuthorizer, WsBroadcaster } from "./ws-broadcaster.js";
