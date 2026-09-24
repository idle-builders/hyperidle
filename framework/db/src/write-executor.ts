/**
 * AU13: shared executor type for domain write-owning services
 * (`task-service.ts`, `user-actions.ts`). A function typed `exec:
 * WriteExecutor` accepts either the top-level `HyperIdleDb` or a `tx` handle
 * inside an open `db.transaction(async (tx) => …)` callback, so callers that
 * already coordinate multi-table writes in one transaction can join the
 * service call into their existing transaction unchanged.
 *
 * @lore AU13: `Parameters<Parameters<HyperIdleDb["transaction"]>[0]>[0]`
 * resolves to Drizzle's `PgTransaction<PgQueryResultHKT, typeof schema,
 * ExtractTablesWithRelations<typeof schema>>` — confirmed compiling against
 * drizzle-orm 0.45.2's `PgDatabase.transaction<T>(transaction: (tx:
 * PgTransaction<...>) => Promise<T>): Promise<T>` signature (see
 * node_modules/drizzle-orm/pg-core/db.d.ts). Both `HyperIdleDb` and the `tx`
 * parameter type expose the same `.select/.insert/.update/.transaction`
 * surface used by these services, so `WriteExecutor` is a plain union — no
 * runtime discrimination needed.
 */
import type { HyperIdleDb } from "./connection.js";

export type WriteExecutor = HyperIdleDb | Parameters<Parameters<HyperIdleDb["transaction"]>[0]>[0];
