/**
 * Structured logger for client-side code
 * Supports log levels: DEBUG, INFO, WARN, ERROR
 * Can be disabled in production by setting LOG_LEVEL to 'NONE'
 */

// Log levels (higher number = more important)
const LOG_LEVELS = {
	DEBUG: 0,
	INFO: 1,
	WARN: 2,
	ERROR: 3,
	NONE: 4,
} as const;

type LogLevel = keyof typeof LOG_LEVELS;

// Default log level (can be overridden via localStorage or environment)
let currentLogLevel: number = LOG_LEVELS.INFO;

// Initialize log level from localStorage or default
function initializeLogLevel(): void {
	try {
		const stored = localStorage.getItem("LOG_LEVEL");
		if (stored) {
			const level = stored.toUpperCase() as LogLevel;
			if (level in LOG_LEVELS) {
				currentLogLevel = LOG_LEVELS[level];
				return;
			}
		}
	} catch (error) {
		// localStorage unavailable (e.g., in private browsing mode)
		// Log to console as fallback since logger isn't initialized yet
		if (typeof console !== "undefined" && console.warn) {
			console.warn(
				"[LOGGER] localStorage unavailable, using default log level:",
				error instanceof Error ? error.message : String(error),
			);
		}
	}

	// Default to INFO in production, DEBUG in development
	// You can detect development mode via URL or other means
	const isDevelopment =
		window.location.hostname === "localhost" ||
		window.location.hostname === "127.0.0.1" ||
		window.location.search.includes("debug=true");

	currentLogLevel = isDevelopment ? LOG_LEVELS.DEBUG : LOG_LEVELS.INFO;
}

// Initialize on load
initializeLogLevel();

/**
 * Format log message with prefix
 */
function formatMessage(level: string, prefix: string, ...args: unknown[]): unknown[] {
	const timestamp = new Date().toISOString();
	return [`[${timestamp}] [${level}] ${prefix}`, ...args];
}

/**
 * Check if log level should be output
 */
function shouldLog(level: LogLevel): boolean {
	return LOG_LEVELS[level] >= currentLogLevel;
}

/**
 * Logger object with methods for each log level
 */
export const logger = {
	/**
	 * Set the log level
	 * @param level - One of: 'DEBUG', 'INFO', 'WARN', 'ERROR', 'NONE'
	 */
	setLevel(level: string): void {
		const upperLevel = level.toUpperCase() as LogLevel;
		if (upperLevel in LOG_LEVELS) {
			currentLogLevel = LOG_LEVELS[upperLevel];
			try {
				localStorage.setItem("LOG_LEVEL", upperLevel);
			} catch (error) {
				// localStorage unavailable - log using logger itself
				// Use console as fallback if logger fails
				try {
					logger.warn(
						"[LOGGER]",
						"Failed to persist log level to localStorage:",
						error instanceof Error ? error.message : String(error),
					);
				} catch {
					// If logger also fails, use console directly
					if (typeof console !== "undefined" && console.warn) {
						console.warn(
							"[LOGGER] Failed to persist log level:",
							error instanceof Error ? error.message : String(error),
						);
					}
				}
			}
		}
	},

	/**
	 * Get the current log level
	 * @returns Current log level name
	 */
	getLevel(): string {
		for (const [name, value] of Object.entries(LOG_LEVELS)) {
			if (value === currentLogLevel) {
				return name;
			}
		}
		return "INFO";
	},

	/**
	 * Debug level logging (most verbose)
	 */
	debug(prefix: string, ...args: unknown[]): void {
		if (shouldLog("DEBUG")) {
			console.debug(...formatMessage("DEBUG", prefix, ...args));
		}
	},

	/**
	 * Info level logging (default)
	 */
	info(prefix: string, ...args: unknown[]): void {
		if (shouldLog("INFO")) {
			console.log(...formatMessage("INFO", prefix, ...args));
		}
	},

	/**
	 * Warning level logging
	 */
	warn(prefix: string, ...args: unknown[]): void {
		if (shouldLog("WARN")) {
			console.warn(...formatMessage("WARN", prefix, ...args));
		}
	},

	/**
	 * Error level logging
	 */
	error(prefix: string, ...args: unknown[]): void {
		if (shouldLog("ERROR")) {
			console.error(...formatMessage("ERROR", prefix, ...args));
		}
	},
};

// Export default logger
export default logger;

