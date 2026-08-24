/**
 * Policy-service transition error classes — re-exported from @hyperidle/domain-model.
 *
 * @lore AU44: Previously copied from the work service (service→service import
 * is forbidden by governance). The copy had the same `.name` so the error-
 * handler's name-matching fallback worked, but `instanceof` silently returned
 * false when a policy error was caught by work's class reference. Now both
 * services import from @hyperidle/domain-model — one class, one reference,
 * instanceof works across the boundary.
 */
export {
	InvalidTransitionError,
	TaskInvalidTransitionError,
} from "@hyperidle/domain-model";
