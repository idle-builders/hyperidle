/**
 * AF6 §4 — server re-export of the routine-session reaper.
 *
 * The reaper logic lives in `@hyperidle/fabric` (pure DB; injected into the
 * scheduler poll loop without a layer violation). This module re-exports it so
 * server callers (boot one-shot in server-factory) and server tests can import
 * it from the server layer alongside the rest of the session machinery.
 */
export {
	type ReapStaleRoutineSessionsOpts,
	reapStaleRoutineSessions,
} from "@hyperidle/fabric";
