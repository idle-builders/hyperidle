/**
 * Size-based log rotation for server stdout/stderr tee.
 */

import * as fs from "node:fs";
import * as path from "node:path";

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
export function createLogRotator(logDir: string, options?: LogRotatorOptions): LogRotator {
	const maxBytes = options?.maxBytes ?? 10 * 1024 * 1024; // 10MB default
	const maxFiles = options?.maxFiles ?? 3;
	const logPath = path.join(logDir, "server.log");

	// Track the original write functions for detach
	let origStdoutWrite: typeof process.stdout.write | null = null;
	let origStderrWrite: typeof process.stderr.write | null = null;

	/** Track current log file size in bytes */
	let currentSize = 0;

	/**
	 * Ensure log directory exists.
	 */
	function ensureDir(): void {
		if (!fs.existsSync(logDir)) {
			fs.mkdirSync(logDir, { recursive: true });
		}
	}

	/**
	 * Rotate the log files: shift existing .N files up, rename server.log → server.log.1.
	 * Deletes server.log.maxFiles if it exists.
	 */
	function rotate(): void {
		// Remove the oldest rotated file beyond maxFiles
		const oldest = `${logPath}.${maxFiles}`;
		if (fs.existsSync(oldest)) {
			fs.rmSync(oldest);
		}

		// Shift server.log.N → server.log.N+1 (from highest down to 1)
		for (let i = maxFiles - 1; i >= 1; i--) {
			const from = `${logPath}.${i}`;
			const to = `${logPath}.${i + 1}`;
			if (fs.existsSync(from)) {
				fs.renameSync(from, to);
			}
		}

		// Rename server.log → server.log.1
		if (fs.existsSync(logPath)) {
			fs.renameSync(logPath, `${logPath}.1`);
		}

		// Reset current size counter
		currentSize = 0;
	}

	/**
	 * Write text to the log file, rotating if necessary.
	 */
	function writeSync(text: string): void {
		ensureDir();

		const buf = Buffer.from(text, "utf-8");

		// Check if rotation is needed
		if (fs.existsSync(logPath)) {
			const stat = fs.statSync(logPath);
			currentSize = stat.size;
		} else {
			currentSize = 0;
		}

		if (currentSize + buf.length > maxBytes) {
			rotate();
		}

		fs.appendFileSync(logPath, buf);
		currentSize += buf.length;
	}

	/**
	 * Monkey-patch process.stdout.write and process.stderr.write to tee to log.
	 */
	function attach(): void {
		if (origStdoutWrite !== null) {
			// Already attached
			return;
		}

		origStdoutWrite = process.stdout.write.bind(process.stdout);
		origStderrWrite = process.stderr.write.bind(process.stderr);

		// @lore N4: We override process.stdout.write to tee output to the log file.
		// The callback form must be preserved to not break callers that pass a cb.
		// We capture the originals into local variables to avoid non-null assertions
		// inside the arrow function body.
		const capturedStdout = origStdoutWrite;
		const capturedStderr = origStderrWrite;

		// biome-ignore lint/suspicious/noExplicitAny: need to match Node's overloaded signature
		(process.stdout as any).write = (
			chunk: string | Uint8Array,
			encodingOrCallback?: BufferEncoding | ((err?: Error | null) => void),
			callback?: (err?: Error | null) => void,
		): boolean => {
			const text = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf-8");
			try {
				writeSync(text);
			} catch {
				// Don't let log failures kill stdout
			}
			if (typeof encodingOrCallback === "function") {
				return capturedStdout(chunk as string, encodingOrCallback);
			}
			return capturedStdout(chunk as string, encodingOrCallback as BufferEncoding, callback);
		};

		// biome-ignore lint/suspicious/noExplicitAny: need to match Node's overloaded signature
		(process.stderr as any).write = (
			chunk: string | Uint8Array,
			encodingOrCallback?: BufferEncoding | ((err?: Error | null) => void),
			callback?: (err?: Error | null) => void,
		): boolean => {
			const text = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf-8");
			try {
				writeSync(text);
			} catch {
				// Don't let log failures kill stderr
			}
			if (typeof encodingOrCallback === "function") {
				return capturedStderr(chunk as string, encodingOrCallback);
			}
			return capturedStderr(chunk as string, encodingOrCallback as BufferEncoding, callback);
		};
	}

	/**
	 * Restore original process.stdout.write and process.stderr.write.
	 */
	function detach(): void {
		if (origStdoutWrite === null) {
			return;
		}
		// biome-ignore lint/suspicious/noExplicitAny: restoring patched write
		(process.stdout as any).write = origStdoutWrite;
		// biome-ignore lint/suspicious/noExplicitAny: restoring patched write
		(process.stderr as any).write = origStderrWrite;
		origStdoutWrite = null;
		origStderrWrite = null;
	}

	return {
		logPath,
		attach,
		detach,
		writeSync,
	};
}
