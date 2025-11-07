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
};

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
};

/**
 * Track an error with structured context
 * @param {Error|string} error - The error object or error message
 * @param {Object} context - Additional context about the error
 * @param {string} context.category - Error category (from ERROR_CATEGORY)
 * @param {string} context.severity - Error severity (from ERROR_SEVERITY)
 * @param {string} context.memberId - Member ID if applicable
 * @param {string} context.subdomain - Subdomain if applicable
 * @param {string} context.url - URL if applicable
 * @param {Object} context.metadata - Additional metadata
 * @returns {Object} The tracked error information
 */
export function trackError(error, context = {}) {
	const errorInfo = {
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
		);
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
 * @param {Error} error - The error object
 * @param {Object} context - Additional context
 * @param {string} context.memberId - Member ID
 * @param {string} context.subdomain - Subdomain
 * @param {string} context.url - URL
 */
export function trackScrapingError(error, context = {}) {
	return trackError(error, {
		category: ERROR_CATEGORY.SCRAPING,
		severity: ERROR_SEVERITY.HIGH,
		...context,
	});
}

/**
 * Track a subdomain detection error
 * @param {Error} error - The error object
 * @param {Object} context - Additional context
 * @param {string} context.memberId - Member ID
 */
export function trackSubdomainError(error, context = {}) {
	return trackError(error, {
		category: ERROR_CATEGORY.SUBDOMAIN,
		severity: ERROR_SEVERITY.MEDIUM,
		...context,
	});
}

/**
 * Track a network error
 * @param {Error} error - The error object
 * @param {Object} context - Additional context
 * @param {string} context.url - URL
 */
export function trackNetworkError(error, context = {}) {
	return trackError(error, {
		category: ERROR_CATEGORY.NETWORK,
		severity: ERROR_SEVERITY.HIGH,
		...context,
	});
}

/**
 * Track a parsing error
 * @param {Error} error - The error object
 * @param {Object} context - Additional context
 * @param {string} context.memberId - Member ID
 * @param {string} context.htmlLength - HTML length
 */
export function trackParsingError(error, context = {}) {
	return trackError(error, {
		category: ERROR_CATEGORY.PARSING,
		severity: ERROR_SEVERITY.MEDIUM,
		...context,
	});
}

/**
 * Get recent errors from localStorage
 * @param {number} limit - Maximum number of errors to return
 * @returns {Array} Array of recent errors
 */
export function getRecentErrors(limit = 10) {
	try {
		const storedErrors = JSON.parse(
			localStorage.getItem("error_tracking_log") || "[]",
		);
		return storedErrors.slice(-limit);
	} catch (e) {
		logger.warn("[ERROR_TRACKING]", "Failed to get recent errors:", e);
		return [];
	}
}

/**
 * Clear error tracking log
 */
export function clearErrorLog() {
	try {
		localStorage.removeItem("error_tracking_log");
		logger.info("[ERROR_TRACKING]", "Error log cleared");
	} catch (e) {
		logger.warn("[ERROR_TRACKING]", "Failed to clear error log:", e);
	}
}
