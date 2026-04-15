export class InvalidTransitionError extends Error {
	constructor(
		public readonly from: string,
		public readonly to: string,
	) {
		super(`Invalid transition from '${from}' to '${to}'`);
		this.name = "InvalidTransitionError";
	}
}

export class VersionConflictError extends Error {
	constructor(
		public readonly entityId: string,
		public readonly expected: number,
		public readonly actual: number,
	) {
		super(`Version conflict for '${entityId}': expected ${expected}, got ${actual}`);
		this.name = "VersionConflictError";
	}
}

export class CapacityExceededError extends Error {
	constructor(
		public readonly teamId: string,
		public readonly capacity: number,
	) {
		super(`Team '${teamId}' is at capacity (${capacity})`);
		this.name = "CapacityExceededError";
	}
}

export class CostCapExceededError extends Error {
	constructor(
		public readonly entityId: string,
		public readonly spend: number,
		public readonly cap: number,
	) {
		super(`Cost cap exceeded for '${entityId}': ${spend}/${cap}`);
		this.name = "CostCapExceededError";
	}
}

export class ConcurrencyLimitError extends Error {
	constructor(
		public readonly agentId: string,
		public readonly limit: number,
	) {
		super(`Agent '${agentId}' concurrency limit reached (${limit})`);
		this.name = "ConcurrencyLimitError";
	}
}

export class MissingCredentialError extends Error {
	constructor(public readonly credential: string) {
		super(`Missing credential: '${credential}'`);
		this.name = "MissingCredentialError";
	}
}

export class ActiveRoutinesError extends Error {
	constructor(
		public readonly agentId: string,
		public readonly count: number,
	) {
		super(`Agent '${agentId}' has ${count} active routines`);
		this.name = "ActiveRoutinesError";
	}
}
