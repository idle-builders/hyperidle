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
	attach(): void;
	detach(): void;
	writeSync(text: string): void;
}

export function createLogRotator(logDir: string, options?: LogRotatorOptions): LogRotator {
	const maxBytes = options?.maxBytes ?? 10 * 1024 * 1024; // 10MB default
	const maxFiles = options?.maxFiles ?? 3;
	const logPath = path.join(logDir, "server.log");

	let origStdoutWrite: typeof process.stdout.write | null = null;
	let origStderrWrite: typeof process.stderr.write | null = null;

	let currentSize = 0;

	function ensureDir(): void {
		if (!fs.existsSync(logDir)) {
			fs.mkdirSync(logDir, { recursive: true });
		}
	}

	function rotate(): void {
		const oldest = `${logPath}.${maxFiles}`;
		if (fs.existsSync(oldest)) {
			fs.rmSync(oldest);
		}

		for (let i = maxFiles - 1; i >= 1; i--) {
			const from = `${logPath}.${i}`;
			const to = `${logPath}.${i + 1}`;
			if (fs.existsSync(from)) {
				fs.renameSync(from, to);
			}
		}

		if (fs.existsSync(logPath)) {
			fs.renameSync(logPath, `${logPath}.1`);
		}

		currentSize = 0;
	}

	function writeSync(text: string): void {
		ensureDir();

		const buf = Buffer.from(text, "utf-8");

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

	function attach(): void {
		if (origStdoutWrite !== null) {
			return;
		}

		origStdoutWrite = process.stdout.write.bind(process.stdout);
		origStderrWrite = process.stderr.write.bind(process.stderr);

		// @lore: process.stdout.write — callback form must be preserved; originals captured to local vars to avoid closures over non-null-asserted values
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
