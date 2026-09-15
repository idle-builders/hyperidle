/**
 * Barrel for @hyperidle/changes (core-api Layer, SQL-owning Service).
 *
 * Owns the `changes` table only. Typed functions only — the barrel must not
 * re-export the raw `changes` pgTable object, same discipline every other
 * Service in this layer follows (Table ACL / Mechanism A).
 */
export { appendChange, type ListChangesFilter, listChanges } from "./changes-repository.js";
