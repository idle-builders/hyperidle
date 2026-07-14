/**
 * `settings` Service (core-api) — outbound composition-boundary (Mechanism C)
 * DI ports, per architecture §10.2's census: `settings`' five real outbound
 * edges are `routine` (`plugin-configuration.ts` → `routine-service.ts`'s
 * `listRoutines`), `users` (`plugin-configuration.ts` → `user-store.ts`'s
 * `listUsersByKind`), `connections` (`server-config.ts` →
 * `credential-encryption.ts`'s cipher functions), `model-gateway`
 * (`server-config.ts` → `model-gateway.ts`'s `BUILT_IN_GATEWAY_CONFIG`), and
 * the catalog edge (`plugin-configuration.ts` → `config/builtin-tool-catalog.ts`).
 *
 * All four non-catalog edges are ORDINARY downward core-api→core-api edges
 * (NOT §10.3 against-grain) — none needs an Increment-3 EventBus-rewire
 * caveat, only a straight DI-target swap once each target Service migrates
 * (same idiom as `@hyperidle/work`'s `UserStoreReader` / `@hyperidle/org`'s
 * `OrgUserDirectory`).
 *
 * @lore AU19 Increment 1i — `RoutineReader` (→ `routine`) is CLOSED: `routine`
 * migrated this Increment. Every real call site now wires it directly to
 * `@hyperidle/routine`'s real `listRoutines` export (`server-factory.ts`) — no
 * more interim indirection through `packages/server`'s (now-deleted)
 * `routine-service.ts`, same closure shape as `users`' Inc-1d closure of
 * `work`'s `UserStoreReader`/`org`'s `OrgUserDirectory` and `connections`'
 * Inc-1h closure of `SettingsCredentialCipher`/`SettingsCredentialStore`.
 *
 * @lore AU19 Increment 1h — `connections` migrated: `SettingsCredentialCipher`
 * AND `SettingsCredentialStore` (both previously INTERIM) are CLOSED. Every
 * real call site now wires the cipher directly to `@hyperidle/connections`'
 * real `getServerSecret`/`encryptCredentialValue`/`decryptCredentialValue`
 * exports, and the store to its real `findCredentialByName`/`insertCredential`
 * exports (`credential-store.ts`, added this Increment specifically to give
 * the store port a real target) — no more interim indirection, same closure
 * shape as `users`' Inc-1d closure of `work`'s `UserStoreReader`/`org`'s
 * `OrgUserDirectory`. `ServiceConnectionsReader` (below) deliberately stays
 * INTERIM — this Increment's explicit scope named only the credential-
 * cipher/store pair for `settings`+`notifications`, not the
 * `serviceConnections`-table reader; its raw-table wiring in
 * `packages/server` is legal (unguarded) and carried forward.
 *
 * @lore AU19 Increment 1f — `SettingsUserDirectory` (→ `users`, already a REAL
 * migrated package) is wired directly to `@hyperidle/users`' real exported
 * `listUsersByKind` at every call site — no interim indirection needed, same
 * precedent as `org`'s `OrgUserDirectory` once `users` existed.
 *
 * @lore AU19 Increment 1f — the fifth edge (`plugin-configuration.ts` →
 * `config/builtin-tool-catalog.ts`) dissolves per §10.3: `builtin-tool-catalog.ts`
 * moves to `@hyperidle/shared` (pure static data), imported directly — no port.
 *
 * @lore AU19 Increment 1f — `model-gateway`'s edge also dissolves, one level
 * further than the plan's literal §10.2 listing: the only symbol
 * `server-config.ts` needs from `model-gateway.ts` is `BUILT_IN_GATEWAY_CONFIG`,
 * a plain data constant (no domain/DB reference) composed from
 * `@hyperidle/shared`'s `MODEL_CATALOG`/`ModelGatewayConfig` — and
 * `packages/shared/src/model-gateway.ts` already hosts this exact class of
 * "gateway default" constant (`DEFAULT_AGENT_MODEL_ID`/
 * `DEFAULT_AGENT_MODEL_PROVIDER`/`DEFAULT_AGENT_HARNESS`). Reclassifying it
 * there (not wiring a `ModelGatewayDefaults` DI port here) avoids threading a
 * new mandatory parameter through `readServerConfig`/`updateServerConfig`'s
 * ~40 production call sites + ~120 test call sites for a single constant —
 * the same "pure data with no domain/DB reference → shared" rationale §5
 * already applies to `config/builtin-tool-catalog.ts`. Flagged here as an
 * implementation-level judgment call (not in the plan's literal §10.2/§10.3
 * text) for review; `model-gateway.ts`'s own domain logic
 * (`resolveModelTier`/`resolveAgentModel`) is untouched and stays put.
 *
 * @lore AU19 Increment 1f — `table-ownership-guard`'s completeness check
 * surfaced THREE more real foreign-table accesses the §10.2 function-level
 * census missed entirely, because they are raw inline `db.select`/`db.insert`
 * calls inside `backfillLegacyConfigurationDefaults`/
 * `migrateCredentialsToStore`, not calls to another Service's exported
 * function: `serviceConnections` (read, for MCP-server config seeds) and
 * `serverCredentials` (read + insert, for the AH1 one-shot credential
 * migration) — both real `connections`-owned tables per architecture §4
 * (`connections | server_credentials, service_connections`) — became the
 * `ServiceConnectionsReader`/`SettingsCredentialStore` ports below (originally
 * the same INTERIM treatment `RoutineReader` still has; `SettingsCredentialStore`
 * CLOSED in Increment 1h, see this file's top-level `@lore` — only
 * `ServiceConnectionsReader` remains interim). Per ground-rule #10, this is
 * the census staying "a floor, refinable during migration" — not scope creep.
 *
 * `userSkills` (read, for per-agent skill/autonomy seeds) is DIFFERENT: it
 * has NO single owner named anywhere in architecture §4's roster, and is
 * accessed today from settings' `plugin-configuration.ts`, the now-real
 * `@hyperidle/agent-selection` package (Increment 3e), and two remaining
 * still-monolithic `packages/server` files destined for future Services
 * (`routes/users.ts`, `services/policy-engine.ts`) — the exact "no single
 * owner, genuinely cross-cutting" shape `UNOWNED_SHARED_TABLES` exists for (matching
 * `sessions`/`propagationLog`/`taskDispatchAttempts`'s precedent), not a
 * candidate for a false single-owner `TABLE_OWNER` claim. Added to
 * `UNOWNED_SHARED_TABLES` in `scripts/table-ownership-guard.ts` instead of a
 * port here — no DI needed, direct access stays legal.
 */

import type {
	HyperIdleDb,
	Routine,
	ServerCredential,
	ServiceConnectionRow,
	User,
} from "@hyperidle/db";

// ---------------------------------------------------------------------------
// routine — RoutineReader (CLOSED Increment 1i, real target)
// ---------------------------------------------------------------------------

/** Port for `routine`'s read surface `settings` calls directly today (`@hyperidle/routine`'s `listRoutines`). */
export interface RoutineReader {
	listRoutines(db: HyperIdleDb, opts?: { includeDeleted?: boolean }): Promise<Routine[]>;
}

// ---------------------------------------------------------------------------
// users — SettingsUserDirectory (ordinary downward core-api edge, real target)
// ---------------------------------------------------------------------------

/** Port for `users`' read surface `settings` calls directly today (`@hyperidle/users`). */
export interface SettingsUserDirectory {
	listUsersByKind(db: HyperIdleDb, kind: string): Promise<User[]>;
}

// ---------------------------------------------------------------------------
// connections — SettingsCredentialCipher (CLOSED Increment 1h, real target)
// ---------------------------------------------------------------------------

/**
 * Port for `connections`' credential-cipher surface `settings` calls (real,
 * `@hyperidle/connections`' `getServerSecret`/`encryptCredentialValue`/
 * `decryptCredentialValue`) — used by `migrateCredentialsToStore`'s one-shot
 * boot migration.
 */
export interface SettingsCredentialCipher {
	getServerSecret(): string | null;
	encryptCredentialValue(plaintext: string, serverSecret: string): string;
	decryptCredentialValue(encrypted: string, serverSecret: string): string | null;
}

// ---------------------------------------------------------------------------
// connections — ServiceConnectionsReader (interim, ordinary downward core-api edge)
// ---------------------------------------------------------------------------

/**
 * Port for `connections`' `serviceConnections` read surface `settings` calls
 * directly today (the raw `db.select().from(serviceConnections).where(...)`
 * inline in `backfillLegacyConfigurationDefaults`, table-ownership-guard
 * completeness finding — see this file's top-level `@lore`).
 */
export interface ServiceConnectionsReader {
	listByAuthSource(db: HyperIdleDb, authSource: string): Promise<ServiceConnectionRow[]>;
}

// ---------------------------------------------------------------------------
// connections — SettingsCredentialStore (CLOSED Increment 1h, real target)
// ---------------------------------------------------------------------------

/**
 * Port for `connections`' `serverCredentials` read/write surface `settings`
 * calls (real, `@hyperidle/connections`'s `findCredentialByName`/
 * `insertCredential`) — used by `migrateCredentialsToStore`'s one-shot boot
 * migration (originally a table-ownership-guard completeness finding — see
 * this file's top-level `@lore`).
 */
export interface SettingsCredentialStore {
	findByName(db: HyperIdleDb, name: string): Promise<ServerCredential | undefined>;
	insert(
		db: HyperIdleDb,
		values: {
			readonly name: string;
			readonly encryptedValue: string;
			readonly validationState: string;
			readonly lastValidatedAt: string | null;
			readonly updatedAt: string;
		},
	): Promise<void>;
}
