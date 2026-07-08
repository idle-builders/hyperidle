/**
 * AD2 — Provision Session Registry.
 *
 * A leaf module (no imports from fabric barrel or @hyperidle/server) that
 * holds a runtime-injected reference to provisionSession.
 *
 * This breaks the circular static import chain:
 *   server → fabric → server  (would cause Vite SSR TDZ errors in tests)
 *
 * Instead:
 *   fabric/task-dispatcher → provision-registry (leaf, no deps)
 *   server/bootstrap → provision-registry (registers provisionSession)
 *
 * In production: server registers the real provisionSession during bootstrap.
 * In tests: the test file registers it by importing directly from server.
 *
 * @lore AD2: The dynamic import approach `import("@hyperidle/server/...")` was
 * tried first but fails in Vite SSR test mode with a TDZ error. Vite SSR
 * processes dynamic imports through its module transform pipeline, which creates
 * a circular reference when session-provisioning imports @hyperidle/fabric back.
 * The registry pattern avoids this by having no imports of its own — it's a
 * pure storage leaf that both sides can safely import.
 */

// biome-ignore lint/suspicious/noExplicitAny: runtime injection across package boundary — no shared type without circular dep
type ProvisionFn = (...args: any[]) => Promise<any>;
// biome-ignore lint/suspicious/noExplicitAny: runtime injection across package boundary — no shared type without circular dep
type SessionRequestConsumerFn = (...args: any[]) => Promise<any>;
// biome-ignore lint/suspicious/noExplicitAny: validated request creator lives in server; fabric receives it at boot.
type SessionRequestCreateFn = (...args: any[]) => Promise<any>;

let provisionFnStore: ProvisionFn | null = null;
let sessionRequestConsumerFnStore: SessionRequestConsumerFn | null = null;
let sessionRequestCreateFnStore: SessionRequestCreateFn | null = null;

/**
 * Register the provisionSession function. Called by the server layer during
 * bootstrap (server-factory.ts) and by tests that need dispatch to work.
 *
 * Idempotent: subsequent calls replace the previous registration.
 */
export function setProvisionSessionFn(fn: ProvisionFn): void {
	provisionFnStore = fn;
}

/**
 * Retrieve the registered provisionSession function, or null if not yet
 * registered (pre-bootstrap or test without registration).
 */
export function getProvisionSessionFn(): ProvisionFn | null {
	return provisionFnStore;
}

/**
 * Clear the registered function. Used in test teardown to reset module state
 * between registrations.
 */
export function clearProvisionSessionFn(): void {
	provisionFnStore = null;
	sessionRequestConsumerFnStore = null;
	sessionRequestCreateFnStore = null;
}

/**
 * AU1: Register the local runtime request consumer. Collaboration-domain
 * dispatchers enqueue an AgentSessionRequest, then invoke this runtime hook.
 * The older provisionSession hook remains for protected pre-AU1 tests.
 */
export function setAgentSessionRequestConsumerFn(fn: SessionRequestConsumerFn): void {
	sessionRequestConsumerFnStore = fn;
}

export function getAgentSessionRequestConsumerFn(): SessionRequestConsumerFn | null {
	return sessionRequestConsumerFnStore;
}

/**
 * AU1: Register the validated request creation service. Fabric domains must not
 * insert agent_session_requests directly; this keeps source-kind validation in one place.
 */
export function setAgentSessionRequestCreateFn(fn: SessionRequestCreateFn): void {
	sessionRequestCreateFnStore = fn;
}

export function getAgentSessionRequestCreateFn(): SessionRequestCreateFn | null {
	return sessionRequestCreateFnStore;
}
