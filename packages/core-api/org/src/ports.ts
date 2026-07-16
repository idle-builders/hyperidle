/**
 * `org` Service (core-api) — outbound composition-boundary (Mechanism C) DI
 * ports, per architecture §10.2's census: `org`'s real outbound edge target is
 * `users` (two call sites — `scaffold-agents.ts` → `getUserById`/`insertUser`,
 * `org-routing.ts` → `listUsersByKind`) — an ORDINARY downward core-api→
 * core-api edge (NOT a §10.3 against-grain edge).
 *
 * Structural port, same idiom as `@hyperidle/work`'s `UserStoreReader`: it
 * types directly off `@hyperidle/db`'s row types (`org` keeps `@hyperidle/db`
 * — architecture §7.3 W4, core-api Services may type ports off `@hyperidle/db`
 * row types directly).
 *
 * @lore AU19 Increment 1d: `users` migrated for real. This port is now wired
 * at every real call site (`server-factory.ts`, `tools/add-agent.ts`,
 * `tools/create-team.ts`, `tools/create-item.ts`,
 * `services/session-review-creator.ts`) to `@hyperidle/users`' real exported
 * `getUserById`/`insertUser`/`listUsersByKind` — no more forward-reference to
 * `packages/server`'s (now-deleted) `user-store.ts` copy; the DI port
 * abstraction itself is unchanged (zero behavior change).
 */

import type { NewUser, User, WriteExecutor } from "@hyperidle/db";

/** Port for `users`' read/write surface `org` calls directly today (`@hyperidle/users`). */
export interface OrgUserDirectory {
	getUserById(db: WriteExecutor, id: string): Promise<User | undefined>;
	insertUser(db: WriteExecutor, values: NewUser): Promise<void>;
	listUsersByKind(db: WriteExecutor, kind: string): Promise<User[]>;
}
