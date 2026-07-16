/**
 * `connections` Service (core-api) — outbound composition-boundary
 * (Mechanism C) DI port, per architecture §10.2's census: `connections`' one
 * real outbound edge is `users` (`connection-provisioning.ts`'s
 * `resolveOwningHumanUserId` → `user-store.ts`'s `getFirstUserByKind`).
 *
 * This is an ORDINARY downward core-api→core-api edge (NOT §10.3
 * against-grain) to a REAL, already-migrated target — no Increment-3
 * EventBus-rewire caveat needed.
 *
 * @lore AU19 Increment 1h — like `notifications`' Inc-1g precedent (NOT
 * `settings`' Inc-1f one): even though `users` is already real,
 * `composition-boundary-guard` bans a nested Service's `src/**` from
 * importing ANY `@hyperidle/*` other than `@hyperidle/db`/`@hyperidle/shared`,
 * full stop — so `connection-provisioning.ts`'s pre-existing direct import of
 * `@hyperidle/users`' `getFirstUserByKind` becomes illegal the moment this
 * file moves into `packages/core-api/connections/`, and converts to
 * `ConnectionsUserReader` below, wired at the real call site
 * (`session-provisioning.ts`'s Phase 8b-connections block) to
 * `@hyperidle/users`' real `getFirstUserByKind` export.
 */

import type { HyperIdleDb, User } from "@hyperidle/db";

// ---------------------------------------------------------------------------
// users — ConnectionsUserReader (ordinary downward core-api edge, real target)
// ---------------------------------------------------------------------------

/** Port for `users`' read surface `resolveOwningHumanUserId` calls directly today (`getFirstUserByKind`). */
export interface ConnectionsUserReader {
	getFirstUserByKind(db: HyperIdleDb, kind: string): Promise<User | undefined>;
}
