/**
 * AD2 — Provision Session Registry.
 *
 * A leaf module (no imports from app-runtime barrel or @hyperidle/server) that
 * holds a runtime-injected reference to provisionSession.
 *
 * This breaks the circular static import chain:
 *   server -> app-runtime -> server  (would cause Vite SSR TDZ errors in tests)
 *
 * Instead:
 *   app-runtime/task-dispatcher → provision-registry (leaf, no deps)
 *   server/bootstrap → provision-registry (registers provisionSession)
 *
 * In production: server registers the real provisionSession during bootstrap.
 * In tests: the test file registers it by importing directly from server.
 *
 * @lore AD2: The dynamic import approach `import("@hyperidle/server/...")` was
 * tried first but fails in Vite SSR test mode with a TDZ error. Vite SSR
 * processes dynamic imports through its module transform pipeline, which creates
 * a circular reference when session-provisioning imports legacy runtime package back.
 * The registry pattern avoids this by having no imports of its own — it's a
 * pure storage leaf that both sides can safely import.
 */

// biome-ignore lint/suspicious/noExplicitAny: validated request creator lives in server; app-runtime receives it at boot.
type SessionRequestCreateFn = (...args: any[]) => Promise<any>;

let sessionRequestCreateFnStore: SessionRequestCreateFn | null = null;

/**
 * Clear the registered function. Used in test teardown to reset module state
 * between registrations.
 */
export function clearProvisionSessionFn(): void {
	sessionRequestCreateFnStore = null;
}

/**
 * AU1: Register the validated request creation service. App-runtime domains must not
 * insert agent_session_requests directly; this keeps source-kind validation in one place.
 */
export function setAgentSessionRequestCreateFn(fn: SessionRequestCreateFn): void {
	sessionRequestCreateFnStore = fn;
}

export function getAgentSessionRequestCreateFn(): SessionRequestCreateFn | null {
	return sessionRequestCreateFnStore;
}
