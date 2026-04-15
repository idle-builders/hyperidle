/** Domain error taxonomy for HyperIdle. */

export class InvalidTransitionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "InvalidTransitionError";
	}
}

export class VersionConflictError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "VersionConflictError";
	}
}

export class CapacityExceededError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "CapacityExceededError";
	}
}

export class CostCapExceededError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "CostCapExceededError";
	}
}

export class ConcurrencyLimitError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ConcurrencyLimitError";
	}
}

export class MissingCredentialError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "MissingCredentialError";
	}
}

export class ActiveRoutinesError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ActiveRoutinesError";
	}
}
