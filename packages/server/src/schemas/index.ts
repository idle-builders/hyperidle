/**
 * Server schemas barrel re-export.
 *
 * Exports all composite Zod schemas and the AppType for Hono RPC.
 * Available via @hyperidle/server/schemas subpath.
 *
 * @lore api-typesafety: AppType is exported here (as a type re-export from
 * app.ts) so the web package can import it without importing the full server
 * module (which has many heavy dependencies). The subpath export in
 * package.json makes this a clean import: `import type { AppType } from
 * '@hyperidle/server/schemas'`.
 */

export type { AppType } from "../app.js";
export * from "@hyperidle/core-app";
export * from "@hyperidle/core-app";
