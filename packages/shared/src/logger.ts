type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
};

interface LogEntry {
	level: LogLevel;
	msg: string;
	ts: string;
	pkg?: string;
	[key: string]: unknown;
}

interface LoggerOptions {
	pkg: string;
	minLevel?: LogLevel;
}

function shouldLog(level: LogLevel, minLevel: LogLevel): boolean {
	return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[minLevel];
}

function formatEntry(entry: LogEntry): string {
	const { level, msg, ts, pkg, ...extra } = entry;
	const prefix = pkg ? `[${pkg}]` : "";
	const suffix = Object.keys(extra).length > 0 ? ` ${JSON.stringify(extra)}` : "";
	return `${ts} ${level.toUpperCase()} ${prefix} ${msg}${suffix}`;
}

export function createLogger(options: LoggerOptions): Logger {
	const minLevel = options.minLevel ?? "info";

	function log(level: LogLevel, msg: string, extra?: Record<string, unknown>): void {
		if (!shouldLog(level, minLevel)) return;

		const entry: LogEntry = {
			level,
			msg,
			ts: new Date().toISOString(),
			pkg: options.pkg,
			...extra,
		};

		const formatted = formatEntry(entry);

		switch (level) {
			case "error":
				console.error(formatted);
				break;
			case "warn":
				console.warn(formatted);
				break;
			default:
				console.log(formatted);
				break;
		}
	}

	return {
		debug: (msg, extra) => log("debug", msg, extra),
		info: (msg, extra) => log("info", msg, extra),
		warn: (msg, extra) => log("warn", msg, extra),
		error: (msg, extra) => log("error", msg, extra),
	};
}

export interface Logger {
	debug(msg: string, extra?: Record<string, unknown>): void;
	info(msg: string, extra?: Record<string, unknown>): void;
	warn(msg: string, extra?: Record<string, unknown>): void;
	error(msg: string, extra?: Record<string, unknown>): void;
}
