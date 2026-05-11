/**
 * Size-based log rotation for server stdout/stderr tee.
 *
 * N4 stub — implementation pending.
 */

export interface LogRotatorOptions {
	/** Maximum log file size in bytes before rotating. Default: 10MB */
	maxBytes?: number;
	/** Number of rotated files to keep. Default: 3 */
	maxFiles?: number;
}

export interface LogRotator {
	readonly logPath: string;
	/** Monkey-patch process.stdout and process.stderr to also write to log file. */
	attach(): void;
	/** Restore original process.stdout and process.stderr write functions. */
	detach(): void;
	/** Write a string synchronously to the current log file. */
	writeSync(text: string): void;
}

/**
 * Create a log rotator that tees process.stdout/stderr to a file in logDir.
 * The file is named "server.log".
 */
export function createLogRotator(_logDir: string, _options?: LogRotatorOptions): LogRotator {
	throw new Error("not implemented");
}
