/**
 * `org` Service (core-api) — outbound composition-boundary (Mechanism C) DI
 * ports, per architecture §10.2's census: `org`'s real outbound edge target is
 * `users` (two call sites — `scaffold-agents.ts` → `getUserById`/`insertUser`,
 * `org-routing.ts` → `listUsersByKind`) — an ORDINARY downward core-api→
 * core-api edge (NOT a §10.3 against-grain edge; `users` just hasn't migrated
 * to its own package yet, same idiom as `work`'s `UserStoreReader`, AU19
 * Increment 1b).
 *
 * Structural port, same idiom as `@hyperidle/work`'s `UserStoreReader`: it
 * types directly off `@hyperidle/db`'s row types (`org` keeps `@hyperidle/db`
 * — architecture §7.3 W4, core-api Services may type ports off `@hyperidle/db`
 * row types directly) so the concrete caller (still `packages/server`'s
 * `user-store.ts`) passes its existing function references unchanged — zero
 * behavior change.
 */

import type { NewUser, User, WriteExecutor } from "@hyperidle/db";

/** Port for `users`' read/write surface `org` calls directly today (`user-store.ts`). */
export interface OrgUserDirectory {
	getUserById(db: WriteExecutor, id: string): Promise<User | undefined>;
	insertUser(db: WriteExecutor, values: NewUser): Promise<void>;
	listUsersByKind(db: WriteExecutor, kind: string): Promise<User[]>;
}
