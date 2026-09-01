/**
 * Work-service transition error classes — re-exported from @hyperidle/domain-model.
 *
 * @lore AU44: These three classes are a contract between thrower and catcher —
 * `instanceof` is identity, so both sides must share the same class reference.
 * policy and work both throw them; the composition root's error-handler catches
 * them by instanceof. One declaration in @hyperidle/domain-model; both services
 * re-export from there. The old per-service copies had the same `.name` so the
 * name-matching fallback in error-handler.ts worked, but `instanceof` would
 * silently return false for errors thrown by the other service. Now it is
 * construction, not luck.
 */
export {
	CapacityExceededError,
	InvalidTransitionError,
	TaskCycleError,
	TaskInvalidTransitionError,
} from "@hyperidle/domain-model";
