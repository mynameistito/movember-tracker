/**
 * Structured error tracking module
 * Can be extended to integrate with Sentry or other error tracking services
 * @module error-tracking
 */

import logger from "./logger.js";

/**
 * Error severity levels
 */
export const ERROR_SEVERITY = {
	LOW: "low",
	MEDIUM: "medium",
	HIGH: "high",
	CRITICAL: "critical",
} as const;

/**
 * Error categories
 */
export const ERROR_CATEGORY = {
	SCRAPING: "scraping",
	SUBDOMAIN: "subdomain",
	CACHE: "cache",
	NETWORK: "network",
	PARSING: "parsing",
	VALIDATION: "validation",
	UNKNOWN: "unknown",
} as const;

export type ErrorSeverity = (typeof ERROR_SEVERITY)[keyof typeof ERROR_SEVERITY];
export type ErrorCategory = (typeof ERROR_CATEGORY)[keyof typeof ERROR_CATEGORY];

export interface ErrorContext {
	category?: ErrorCategory;
	severity?: ErrorSeverity;
	memberId?: string;
	subdomain?: string;
	url?: string;
	metadata?: Record<string, unknown>;
}

export interface ErrorInfo {
	timestamp: string;
	message: string;
	stack?: string;
	category: ErrorCategory;
	severity: ErrorSeverity;
	context: {
		memberId?: string;
		subdomain?: string;
		url?: string;
		[key: string]: unknown;
	};
}

/**
 * Track an error with structured context
 * @param error - The error object or error message
 * @param context - Additional context about the error
 * @returns The tracked error information
 */
export function trackError(error: Error | string, context: ErrorContext = {}): ErrorInfo {
	const errorInfo: ErrorInfo = {
		timestamp: new Date().toISOString(),
		message: error instanceof Error ? error.message : String(error),
		stack: error instanceof Error ? error.stack : undefined,
		category: context.category || ERROR_CATEGORY.UNKNOWN,
		severity: context.severity || ERROR_SEVERITY.MEDIUM,
		context: {
			memberId: context.memberId,
			subdomain: context.subdomain,
			url: context.url,
			...(context.metadata || {}),
		},
	};

	// Log the error with structured information
	logger.error(
		"[ERROR_TRACKING]",
		`[${errorInfo.category}] [${errorInfo.severity}] ${errorInfo.message}`,
		errorInfo,
	);

	// In the future, this can be extended to send to Sentry:
	// if (window.Sentry) {
	//   window.Sentry.captureException(error, {
	//     tags: {
	//       category: errorInfo.category,
	//       severity: errorInfo.severity,
	//     },
	//     extra: errorInfo.context,
	//   });
	// }

	// Store errors in localStorage for debugging (limit to last 50 errors)
	try {
		const storedErrors = JSON.parse(
			localStorage.getItem("error_tracking_log") || "[]",
		) as ErrorInfo[];
		storedErrors.push(errorInfo);
		// Keep only last 50 errors
		if (storedErrors.length > 50) {
			storedErrors.shift();
		}
		localStorage.setItem("error_tracking_log", JSON.stringify(storedErrors));
	} catch (e) {
		// Ignore localStorage errors
		logger.warn(
			"[ERROR_TRACKING]",
			"Failed to store error in localStorage:",
			e,
		);
	}

	return errorInfo;
}

/**
 * Track a scraping error
 * @param error - The error object
 * @param context - Additional context
 */
export function trackScrapingError(error: Error, context: Omit<ErrorContext, "category" | "severity"> = {}): ErrorInfo {
	return trackError(error, {
		category: ERROR_CATEGORY.SCRAPING,
		severity: ERROR_SEVERITY.HIGH,
		...context,
	});
}

/**
 * Track a subdomain detection error
 * @param error - The error object
 * @param context - Additional context
 */
export function trackSubdomainError(error: Error, context: Omit<ErrorContext, "category" | "severity"> = {}): ErrorInfo {
	return trackError(error, {
		category: ERROR_CATEGORY.SUBDOMAIN,
		severity: ERROR_SEVERITY.MEDIUM,
		...context,
	});
}

/**
 * Track a network error
 * @param error - The error object
 * @param context - Additional context
 */
export function trackNetworkError(error: Error, context: Omit<ErrorContext, "category" | "severity"> = {}): ErrorInfo {
	return trackError(error, {
		category: ERROR_CATEGORY.NETWORK,
		severity: ERROR_SEVERITY.HIGH,
		...context,
	});
}

/**
 * Track a parsing error
 * @param error - The error object
 * @param context - Additional context
 */
export function trackParsingError(error: Error, context: Omit<ErrorContext, "category" | "severity"> = {}): ErrorInfo {
	return trackError(error, {
		category: ERROR_CATEGORY.PARSING,
		severity: ERROR_SEVERITY.MEDIUM,
		...context,
	});
}

/**
 * Get recent errors from localStorage
 * @param limit - Maximum number of errors to return
 * @returns Array of recent errors
 */
export function getRecentErrors(limit = 10): ErrorInfo[] {
	try {
		const storedErrors = JSON.parse(
			localStorage.getItem("error_tracking_log") || "[]",
		) as ErrorInfo[];
		return storedErrors.slice(-limit);
	} catch (e) {
		logger.warn("[ERROR_TRACKING]", "Failed to get recent errors:", e);
		return [];
	}
}

/**
 * Clear error tracking log
 */
export function clearErrorLog(): void {
	try {
		localStorage.removeItem("error_tracking_log");
		logger.info("[ERROR_TRACKING]", "Error log cleared");
	} catch (e) {
		logger.warn("[ERROR_TRACKING]", "Failed to clear error log:", e);
	}
}

