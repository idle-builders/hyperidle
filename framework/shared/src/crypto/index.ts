/**
 * `@hyperidle/shared/crypto` — the AES-256-GCM credential cipher.
 *
 * @lore AU26 E1 (J1): a NODE-ONLY subpath, deliberately never re-exported as
 * values from the main `@hyperidle/shared` barrel — `credential-encryption.ts`
 * imports `node:crypto` and would break the browser bundle. Same idiom as the
 * shipped `@hyperidle/shared/net` (node:dns/net) and `@hyperidle/shared/http`
 * (node:crypto): the barrel may re-export TYPES from here, never values.
 *
 * @lore AU26 E1: the no-DB proof, re-discharged before the move (AU21 J3's
 * standing obligation). At its old home the cipher's only inputs were
 * `process.env.HYPERIDLE_CREDENTIAL_KEY` / `HYPERIDLE_API_KEY` and its
 * `node:crypto` calls — zero `@hyperidle/db` imports, zero table reads, no db
 * handle in any signature. That is what made it a primitive rather than a
 * Service, and it is why the whole thing moved rather than only the pure core
 * with the secret passed in.
 */
export { decryptCredentialValue, encryptCredentialValue } from "./credential-encryption.js";
