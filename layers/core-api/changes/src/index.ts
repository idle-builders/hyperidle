// Barrel for @hyperidle/changes. Must not re-export the raw `changes` table — Table ACL.
export { appendChange, type ListChangesFilter, listChanges } from "./changes-repository.js";
