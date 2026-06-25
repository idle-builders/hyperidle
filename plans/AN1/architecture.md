# AN1 — Connect a service once · Architecture

**Gate:** `ci-required` (schema migration + auth + encrypted secrets at rest).
**Concept (fixed):** `plans/AN1/concept.md` — held (`token`/`mcp`) vs `inherited`; closed auth-source set `{token,mcp,inherited}`; closed health set `{working,needs-attention}`; 5 hard rules; `ServiceConnection*` code prefix.
**Design (fixed):** `plans/AN1/design/approved.md` — grouped-by-source, inherited first, per-row health chip. Do not re-litigate the visual contract.
**Reference (recoverable, not authoritative):** `16c3fe62` (#353) — `serviceConnections` pgTable, `ServiceConnectionResolver`, `connections.ts` routes, `harness-connection-projection.ts`. **Strip `trustTier`; rename `harness→inherited`, `mcp-oauth→mcp`; collapse health to 2-set.**

## Required reading (builder, before implementing)
- `docs/architecture/credential-model.md` — one-store/one-resolver contract; AN1 reuses the **encryption primitive**, adds a **separate** open table + resolver (never touches the closed catalog).
- `packages/server/src/services/credential-encryption.ts` — `encryptCredentialValue` / `decryptCredentialValue` / `requireServerSecret` / `getServerSecret`. **Reuse verbatim — do not fork the crypto.**
- `packages/server/src/services/credential-resolver.ts` + `routes/credentials.ts` — the parallel pattern this mirrors.
- `packages/shared/src/harness/harness-capability-descriptor.ts` + `packages/server/src/harness/harness-discovery.ts` — AM2 descriptor + probes; this WP extends both.
- `packages/db/src/schema.ts` (`serverCredentials`, `users`) — table conventions, FK style.
- `packages/server/src/routes/credentials.ts` — `requireBoundary` / `authorizeRead` / `authorizeWrite` / `createRateLimiter` middleware wiring.
- `packages/web/src/pages/SettingsPage.tsx` — section-wiring pattern.

---

## Plan reconciliation (spec ⇆ reality)

| Spec assumption | Reality on `origin/main` | Plan handling |
|---|---|---|
| `serviceConnections` table | **absent** (reverted with #353) | Task 2 recreates it (no `trustTier`). |
| `ServiceConnectionResolver` | absent | Task 3 recreates (reuses `decryptCredentialValue`). |
| `/api/connections` routes | absent | Task 4 recreates (no trust-tier, no broker framing). |
| `@hyperidle/shared` `connection.ts` types | absent | Task 1 creates with the **locked** closed sets. |
| `HarnessCapabilityDescriptor.inheritedTools` | absent — descriptor exposes only `runtime.mcpSupport: boolean` | Task 5 adds the field; Task 6 populates it in discovery. |
| `projectHarnessConnections(null)` (#353 left inherited empty) | n/a | Task 7 projects the **live** inherited set from descriptors (founder scope decision). |
| `encryptCredentialValue` etc. | **present**, unchanged | reuse. |
| `requireBoundary` / `authorizeRead/Write` / `createRateLimiter` | present (used by credentials route) | reuse. |
| `Row/ItemList/SectionLabel/StatusChip/Dialog/Select/Input/Button/Menu/SkeletonList` | present in `@hyperidle/design-system` | design already binds them. |
| `apiFetch` (`packages/web/src/services/api-fetch.ts`) | present | reuse. |
| `users.id` text PK, `onDelete: cascade` style | present | FK target. |

**Harness-surface research (current, 2026-06; presumed-stale knowledge re-verified):**
- Claude Code: `claude mcp list` → `<name>: <command|url> - <status>` lines; status ∈ {`✓ Connected`, `⏸ Pending approval`, `✗ Rejected`, `✗ Failed to connect`}. Config at `~/.claude.json` (`mcpServers`) + project `.mcp.json`. Identity = name before `:`; **env/token values are never in `list` output.** (`https://code.claude.com/docs/en/mcp`)
- Codex: `codex mcp list`; config `~/.codex/config.toml` `[mcp_servers.<name>]` table keys. (`https://developers.openai.com/codex/mcp`, `/codex/config-reference`)
- gh CLI: `gh auth status --json hosts` → structured JSON, **always exits 0**, lists hosts + accounts; token only with `--show-token` (we never pass it). (`https://cli.github.com/manual/gh_auth_status`)

---

## Phase 0 decisions (pinned — confirm, don't re-open)
1. **Inherited is never a DB row.** Projected live from the harness descriptor at GET time; no persistence, no DELETE target. (Concept hard-rule 4.)
2. **Health on create = `needs-attention`** (unvalidated) until `POST …/validate`. The 2-set has no "expired" — a token that stops working is `needs-attention`.
3. **`via` is server-constructed**, never a raw URL/secret echo. token→"API key · stored encrypted"; mcp→"`<host>`"; inherited→"`<harness>` · `<name>`".
4. **CLI logins (e.g. `gh`) are inherited tools** attributed to harness `"environment"` (PATH-level, not a specific harness). MCP servers are attributed to the harness whose config declares them.

---

## 1. Shared types — `packages/shared/src/connection.ts` (NEW)

```ts
/** Where a connection's authority lives. CLOSED set (concept Phase 4). */
export const CONNECTION_AUTH_SOURCES = ["token", "mcp", "inherited"] as const;
export type ConnectionAuthSource = (typeof CONNECTION_AUTH_SOURCES)[number];

/** Whether the connection currently works. CLOSED set (concept Phase 4). */
export const CONNECTION_HEALTH = ["working", "needs-attention"] as const;
export type ConnectionHealth = (typeof CONNECTION_HEALTH)[number];

/** Held auth sources only — what a user can create. (inherited is never created.) */
export const HELD_AUTH_SOURCES = ["token", "mcp"] as const;
export type HeldAuthSource = (typeof HELD_AUTH_SOURCES)[number];

/**
 * The UI/agent-facing view of a connection. NEVER carries a secret — only the
 * FACT of availability + health (concept hard-rule 1). Safe to send to the browser.
 */
export interface ServiceConnectionView {
  id: string;                      // sc-<uuid> (held) | inherited:<harness>:<name> (projected)
  service: string;                 // display name
  via: string;                     // server-constructed "where the tools come from" string
  authSource: ConnectionAuthSource;
  health: ConnectionHealth;
  removable: boolean;              // false for inherited (HyperIdle stores nothing)
}

export function isConnectionAuthSource(v: string): v is ConnectionAuthSource { /* … */ }
export function isHeldAuthSource(v: string): v is HeldAuthSource { /* … */ }
```
Export from `packages/shared/src/index.ts`. **No `TRUST_TIERS`, no `trustTier`.**

> Note: the design story (`SettingsConnections.stories.tsx`) inlines an equivalent fixture type; the production `SettingsConnections.tsx` binds to this `ServiceConnectionView`. Aligning them is part of Task 8.

## 2. Schema — `packages/db/src/schema.ts` (extend) + migration

`service_connections` pgTable, per-(user × service × authSource). Recover #353 shape, **strip `trustTier`**:

```ts
export const serviceConnections = pgTable(
  "service_connections",
  {
    id: text("id").primaryKey(),                       // sc-<uuid>
    userId: text("user_id").notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    service: text("service").notNull(),
    authSource: text("auth_source").notNull(),         // "token" | "mcp"  (inherited NEVER stored)
    encryptedToken: text("encrypted_token"),           // AES-GCM base64(iv+ct+tag); NULL for mcp
    serverUrl: text("server_url"),                     // mcp only; NULL for token
    health: text("health").notNull().default("needs-attention"), // "working" | "needs-attention"
    lastValidatedAt: text("last_validated_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("service_connections_user_service_source_idx")
      .on(t.userId, t.service, t.authSource),
    index("service_connections_user_idx").on(t.userId),
  ],
);
export type ServiceConnectionRow = typeof serviceConnections.$inferSelect;
export type NewServiceConnectionRow = typeof serviceConnections.$inferInsert;
```
- Migration: `npm run db:generate` → review generated SQL under `packages/db/drizzle/` → `npm run db:migrate`. **Invariant:** `auth_source` only ever holds `token`/`mcp` (DB-level: app-enforced via Zod at insert; no `inherited` write path exists).
- Export `serviceConnections` from `packages/db/src/index.ts`.

**Design-it-twice (schema shape):** *(A)* one wide table with nullable `encryptedToken`/`serverUrl` discriminated by `authSource` — chosen: matches #353, one resolver, trivial union query. *(B)* two tables (`token_connections`, `mcp_connections`) — rejected: doubles query/projection surface and the unique-per-source constraint becomes cross-table; no payoff at this cardinality.

## 3. Resolver — `packages/server/src/services/service-connection-resolver.ts` (NEW)

Recover #353 verbatim (it has no trust-tier coupling). Per-user-scoped decrypt; **reuses `decryptCredentialValue`** (no forked crypto). Returns plaintext for a `token` row, `null` for absent/cross-user/missing-secret/`mcp` row.

```ts
export class ServiceConnectionResolver {
  constructor(private db: HyperIdleDb, private serverSecret: string | null) {}
  async resolve(userId: string, connectionId: string): Promise<string | null>;
}
```
- Query scoped on `and(eq(id), eq(userId))` — cross-user → `null` (hard-rule 3; never leaks existence). Never throws. **This resolver is the AN2 seam** (AN2 injects into the sandbox); AN1 ships + unit-tests it.
- **Invariant (never display/log the secret):** the resolver is the *only* path that returns plaintext; it is wired to sandbox injection (AN2), never to a route response or logger. AN1 proves no route reads `encryptedToken` into a response (Task 4 + test).

## 4. Routes — `packages/server/src/routes/connections.ts` (NEW), mounted `/api/connections`

Recover #353; **remove** `trustTier` from inserts/views and any AF11/broker comment framing. Each route: `requireBoundary({kind:"enforced"})` + `authorizeRead`/`authorizeWrite` (self-access: `hostKind:"user", hostId:userId, participants:[userId]`).

| Method | Path | Body / param | Success | Notes |
|---|---|---|---|---|
| GET | `/` | — | `200 ServiceConnectionView[]` | held rows (`rowToView`) **∪** projected inherited (Task 7). Secrets never in response. |
| POST | `/` | discriminated union (below) | `201 ServiceConnectionView` | rate-limit 20/min; `409` on unique violation. |
| DELETE | `/:id` | id param | `204` \| `404` | userId-scoped delete; cross-user/inherited-id → `404` (never 403). rate-limit 20/min. |
| POST | `/:id/validate` | id param | `200 {health}` | probe health; rate-limit 3/min. |

```ts
const createConnectionSchema = z.discriminatedUnion("authSource", [
  z.object({ service: z.string().min(1).max(200), authSource: z.literal("token"),
             token: z.string().min(1).max(10_000) }),
  z.object({ service: z.string().min(1).max(200).optional(), authSource: z.literal("mcp"),
             serverUrl: z.string().min(1).max(2000)
               .refine(u => u.startsWith("https://"), "serverUrl must be https://") }),
]);
```
- **token POST:** `requireServerSecret()` (fail-loud `500 MISSING_ROOT_SECRET` if no key) → `encryptCredentialValue(token, secret)` → insert `health:"needs-attention"`. Never echo the token.
- **mcp POST:** derive `service` from `serverUrl` host when omitted; store `serverUrl`, `encryptedToken:null`.
- **`rowToView`:** builds `via` server-side (`buildVia`), `removable:true`, `health` cast to the 2-set. **Never** includes `encryptedToken`.
- **`/:id/validate`:** AN1 probes lightly — token: presence + decrypt-OK → `working`, else `needs-attention`; mcp: HTTPS reachability of `serverUrl` (HEAD/initialize) → `working`/`needs-attention`. (AN2 may upgrade to a real tool-call probe; the endpoint is the write-back seam.) **SSRF note:** AN1 only stores/validates `https://` URLs; the full private-IP block lands with AN2's outbound client — recorded as a known follow-up, not a silent gap.
- Mount in the server route table next to `credentials` (read `server-factory.ts` / the route-registration file for the exact wiring).

## 5. Descriptor extension — `packages/shared/src/harness/harness-capability-descriptor.ts`

Add an identity-only inherited-tool enumeration. **No command, no env, no token — only name + kind + source + health.**

```ts
/** One tool the environment already provides, identity only (concept hard-rule 4). */
export interface InheritedToolDescriptor {
  readonly name: string;                       // server/CLI identity, e.g. "github", "linear", "gh"
  readonly kind: "mcp-server" | "cli";
  readonly harness: string;                    // source: "claude-code" | "codex" | "opencode" | "environment"
  readonly health: ConnectionHealth | "unknown"; // evidence-first; "unknown" when not provable
}

export interface HarnessCapabilityDescriptor {
  // …existing fields…
  /** AN1: tools the harness/environment is already configured with. Identity only. */
  readonly inheritedTools: readonly InheritedToolDescriptor[];
}
```
- Import `ConnectionHealth` from `../connection.js` (shared internal).
- **Design-it-twice (placement):** *(A)* top-level `inheritedTools` on the descriptor — chosen: inherited tools are a harness-level fact peer to `runtime`/`models`, and the projection consumes the descriptor directly. *(B)* nest under `runtime` — rejected: `runtime` is capability booleans/flags; a list of named external tools is a different axis and would bloat the legacy `HarnessRuntimeCapabilities` consumers.
- **Additive, non-breaking:** existing descriptor consumers ignore the new field. Default `inheritedTools: []` everywhere a descriptor is constructed.

## 6. Discovery — `packages/server/src/harness/harness-discovery.ts` (extend)

Populate `inheritedTools` per harness, **non-destructive probes only, evidence-first** (AM2 contract: `unknown`/omit when unprovable, never fabricate). Add to `HarnessDiscoveryInput` an optional `inheritedTools?: readonly InheritedToolDescriptor[]`; the descriptor builder maps it through (default `[]`).

- **claude-code** (`probeClaudeCodeCli`): when `ready`, run `claude mcp list`. Parse each line `^(?<name>[^:]+):` → `{name, kind:"mcp-server", harness:"claude-code", health}`; map status token → `✓ Connected`→`working`, `⏸/✗/Failed`→`needs-attention`, unparseable→`unknown`. On non-zero exit or empty → `[]` (omit, don't fabricate).
- **codex** (`probeCodexCli`): when `ready`, run `codex mcp list` (fallback: read `~/.codex/config.toml`, take `[mcp_servers.<name>]` keys via a TOML parse — names only, never `env`/`command`). `health:"unknown"` (list shows config, not live status). `harness:"codex"`.
- **opencode** (`probeOpenCodeCli`): parse opencode MCP config if present; else `[]`.
- **environment CLIs** (new `probeEnvironmentClis`): `gh auth status --json hosts` (always exit 0) → for each host with an account, emit `{name:"github", kind:"cli", harness:"environment", health:"working"}`. Extensible to other login-bearing CLIs by the same evidence-first shape; absent/parse-fail → omit. **Never** pass `--show-token`.
- **Token-safety invariant (hard-rule 4):** probes read only *names/identities and liveness*; no code path copies an `env`, `command`, keychain value, or token into an `InheritedToolDescriptor`. Enforced by the descriptor type (no secret field exists) + an ESLint-able review check.

## 7. Projection — `packages/server/src/services/service-connection-projection.ts` (NEW; supersedes #353 `harness-connection-projection.ts`)

```ts
export function projectInheritedConnections(
  descriptors: readonly HarnessCapabilityDescriptor[],
): ServiceConnectionView[];
```
- Flatten `descriptors[].inheritedTools` → one `ServiceConnectionView` each: `authSource:"inherited"`, `removable:false`, `health` (`unknown`→`working` for display, or keep needs-attention; pick `working` so a healthy inherited tool shows no chip per design), derived `id:"inherited:<harness>:<name>"`, `via:"<harness> · <name>"`, `service:<name>`.
- Dedupe by `(service)` across harnesses if needed (a tool inherited from two harnesses → one row, first wins) — keeps the list honest.
- **GET `/` wiring:** the route obtains current descriptors from the existing harness discovery/pool (inject the same source the `/api/harnesses` route uses — read that route to find the cached-descriptor accessor; do **not** re-probe per request if a cache exists). `[...projectInheritedConnections(descriptors), ...storedViews]`.

## 8. UI wiring — `packages/web/src/`
- `settings/SettingsConnections.tsx` + `.stories.tsx` — **already placed** by `/design` (adapted, ethos-corrected). Builder: align `SettingsConnections.tsx`'s imported `ServiceConnectionView`/`ConnectionAuthSource`/`ConnectionHealth` against the Task-1 shared types (they match by design); confirm it compiles.
- `pages/SettingsPage.tsx` — add a `Connections` section. Placement: **after "Agent backends", before "Assistant"** (adjacent to harness config). Wrap `<SettingsConnections />` in the standard `<section id="settings-section-connections" …><SectionTitle>Connections</SectionTitle>…`. **Note:** `SettingsConnections.tsx` already renders its own `<h2>Connections</h2>` header; either drop the page-level `SectionTitle` for this section or the component header (builder picks one — avoid double heading; recommend keeping the component header, omit the `SectionTitle` like other rich panels, or strip the component `<h2>` to match the page convention).

---

## Acceptance criteria → verification

| # | AC (from TRACK-AN) | Verification |
|---|---|---|
| AC1 | Connect by token / mcp / inherited; appears listed with auth source recorded | integration: POST token → `201`; GET → row present, `authSource:"token"`. Projection unit test: descriptor with `inheritedTools` → GET includes `authSource:"inherited"` row. |
| AC2 | Remove a connection; agents lose access | integration: DELETE own row → `204`; GET no longer lists it; resolver returns `null` after delete. |
| AC3 | Records where auth comes from + whether it works; stopped-working shows needs-attention | integration: create token → `health:"needs-attention"`; validate happy → `working`; tamper/expire → `validate` → `needs-attention`. Type test: health ∈ closed 2-set. |
| AC4 | Pasted secret stored encrypted, never shown/logged (but used by tools) | integration: POST token → DB `encrypted_token` ≠ plaintext, decrypts via resolver; GET/POST responses contain no `encryptedToken`/plaintext (assert absent). Resolver unit: returns plaintext for owner. |
| AC5 | Per-user isolation | integration: user B GET excludes user A's rows; user B DELETE of A's id → `404`; resolver(B, A's id) → `null`. |
| AC6 | No per-service OAuth app; never an OAuth provider | static/review: grep — no authorization-code exchange, no client registration, no consent-screen/redirect-URI handling in `connections.ts`/resolver/discovery. Inherited path stores nothing (Task 7 emits no secret). |
| AC7 (concept) | Inherited never persisted | integration: projection-only rows have `removable:false` + `inherited:` id; no `service_connections` row is written for an inherited tool; DELETE of an `inherited:` id → `404`. |
| AC8 (concept) | Closed catalog stays closed | static/review: `CREDENTIAL_NAMES` unchanged; `service_connections` is a separate table; no Connection writes into `serverCredentials`. |

**Validation scenarios** (TRACK-AN) map to AC1 (token connect), AC2 (remove), AC3 (expired→needs-attention), AC5 (two-user isolation) — covered by `connections.integration.test.ts`.

## Security & abuse cases (required)
- **Rate-limit:** POST 20/min, DELETE 20/min, validate 3/min (`createRateLimiter`). ✅ addressed.
- **Secret handling:** AES-GCM at rest (reused primitive); fail-loud on missing root secret; resolver is the only plaintext path, wired to sandbox-injection not responses/logs. ✅
- **Input trust:** Zod discriminated union; `service` ≤200, `token` ≤10 000, `serverUrl` ≤2000 + `https://` refine. ✅
- **SSRF:** AN1 stores/validates only `https://`; private-IP/DNS-rebinding block is AN2's outbound-client scope — **explicit follow-up, not silent**. ⚠️ partial-by-design (no outbound tool call in AN1).
- **Cross-user / IDOR:** every query scoped on `userId`; cross-user DELETE/resolve → `404`/`null`, never leaks existence. ✅
- **Inherited token leakage:** descriptor type has no secret field; probes read identities/liveness only; never `--show-token`, never copies `env`/`command`. ✅ (hard-rule 4)
- **Path traversal:** N/A (no path inputs).

## Ordered task list (builder)
1. **Shared types** — `packages/shared/src/connection.ts` + barrel export. (red: `connection.types.test.ts` — closed sets, guards, no `trustTier`.) *Satisfies AC3/AC8 type-level.*
2. **Schema + migration** — `serviceConnections` pgTable (no `trustTier`); `db:generate` + review SQL + `db:migrate`; barrel export. (red: migration runs; unique index present.) *AC1/AC5/AC7.* — **sharedFile: `packages/db/src/schema.ts`, `packages/db/src/index.ts`.**
3. **Resolver** — `service-connection-resolver.ts` reusing `decryptCredentialValue`. (red: owner→plaintext, cross-user/absent/mcp/no-secret→null.) *AC4/AC5.*
4. **Routes** — `connections.ts` (GET/POST/DELETE/validate), strip trust-tier; mount `/api/connections`. (red: `connections.integration.test.ts` — full CRUD + isolation + 409 + no-secret-in-response.) *AC1–AC5.* — **sharedFile: server route-registration file.**
5. **Descriptor field** — add `InheritedToolDescriptor` + `inheritedTools` (default `[]` at all construction sites). (red: type test; existing descriptor consumers still compile.) — **sharedFile: `packages/shared/src/harness/harness-capability-descriptor.ts`.**
6. **Discovery probes** — populate `inheritedTools` (claude `mcp list`, codex config, gh `auth status --json`), evidence-first, names-only. (red: discovery unit tests with stubbed `run` — parse fixtures → identities + health; failure → `[]`; **no** secret fields emitted.) *AC6/AC7/hard-rule 4.*
7. **Projection + GET wiring** — `service-connection-projection.ts`; union into GET from cached descriptors. (red: projection unit — descriptor→inherited views `removable:false`, `inherited:` id; integration — GET unions held + inherited.) *AC1/AC7.*
8. **UI wiring** — align `SettingsConnections.tsx` to shared types; add section to `SettingsPage.tsx` (resolve double-heading). (red/proof: existing component-test render + a focused render asserting three groups, inherited first; viewer paint already confirmed.) — **sharedFile: `packages/web/src/pages/SettingsPage.tsx`.**
9. **Verify** — `npm run check` + `npm run lint` + `npm run test` + `test:integration`; re-bless snapshot net only after reviewing the SettingsConnections story diff. *(builder green-phase; ci-required gate.)*

**Dependencies:** 1→{2,3,5}; 2→{3,4}; {2,4}→7; 5→6→7; 7→8; all→9.

## protectedTests
- `packages/server/src/services/__tests__/*credential-encryption*` — the reused crypto must not be altered to fit Connection tests.
- `packages/server/src/**/credentials*.integration.test.ts` — the closed-catalog path must stay green (Connection is additive).

## sharedFiles
- `packages/db/src/schema.ts`, `packages/db/src/index.ts`
- `packages/shared/src/index.ts`, `packages/shared/src/harness/harness-capability-descriptor.ts`
- `packages/server/src/harness/harness-discovery.ts`
- the server route-registration file (mounts `/api/connections`)
- `packages/web/src/pages/SettingsPage.tsx`

## Risks / ambiguities
- **GET descriptor source:** the route must read **cached** descriptors (the `/api/harnesses` accessor), not re-probe per request (a `claude mcp list` spawn per GET is too slow). Builder confirms the cache accessor exists; if not, scope a thin cache read — do not re-probe inline.
- **Inherited health fidelity:** codex/opencode lists show config not liveness → `unknown`→displayed `working`. Acceptable for AN1 (identity is the point); AN2 can enrich. Documented, not silent.
- **Double heading** in SettingsPage (component `<h2>` vs page `SectionTitle`) — builder resolves to one.
- **`@hyperidle/shared` import in descriptor** pulling `ConnectionHealth` from `connection.ts` — keep `connection.ts` dependency-free (no server imports) so shared stays leaf.
