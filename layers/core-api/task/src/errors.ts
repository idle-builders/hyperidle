// @lore: transition error classes — instanceof identity; both sides must use same class from @hyperidle/domain-model; same-named copy silently returns false
export {
	CapacityExceededError,
	InvalidTransitionError,
	TaskCycleError,
	TaskDependencyBlockedError,
	TaskDependencyKilledError,
	TaskDependencyNotFoundError,
	TaskInvalidTransitionError,
} from "@hyperidle/domain-model";
