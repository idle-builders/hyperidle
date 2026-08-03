/**
 * Barrel for @hyperidle/realtime (core-api Layer, non-SQL Service).
 *
 * Typed functions only. `realtime` owns ZERO tables — it is a pure
 * core→ui push transport (architecture §10.2 line 138: "broadcasts
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
 * §10.3 against-grain caveat.
 *
 * @lore AU20 Ab2: collapsed from 12 exports to 5. The 7 leaf DI reader/row
 * types (RealtimeThread/User/OrgTeam/TaskReader + RealtimeThread/User/TeamMembersRow)
 * are now file-internal in ports.ts — callers satisfy SubscribeAuthorizerDeps
 * structurally and never need to name the leaf types.
 *
 * @lore AU21 §6 Decision L4 / §9 Increment 14d: `ws-broadcaster.ts` (class
 * `WsBroadcaster`) is renamed to `ws-connection-hub.ts` (class
 * `WsConnectionHub`) — the generic `BROADCAST_ROUTES` event→topic forwarder
 * + its `start()`/`stop()` lifecycle are DELETED (the founder: "there is no
 * refetch … core submits the changed version"). The class that remains is
 * pure connection/subscription/authz/broadcast transport with no EventBus
 * dependency and no domain routing table of its own — every domain that
 * wants to push data now calls `broadcast(topic, data)` directly (or drives
 * it via its own small forwarder, e.g. `work-state-push-gateway.ts`,
 * `session-activity-gateway.ts`). Public surface: WsConnectionHub,
 * createDbSubscribeAuthorizer, SubscribeAuthorizerDeps, SubscribeResult,
 * WsClient.
 */

export type { SubscribeAuthorizerDeps } from "./ports.js";
export type { SubscribeResult, WsClient } from "./ws-connection-hub.js";
export { createDbSubscribeAuthorizer, WsConnectionHub } from "./ws-connection-hub.js";
