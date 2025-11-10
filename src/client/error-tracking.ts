/**
 * Structured error tracking module
 * Can be extended to integrate with Sentry or other error tracking services
 *
 * PRIVACY & COMPLIANCE NOTES:
 * - All PII (memberId, subdomain) is hashed before storage
 * - URLs are sanitized to remove sensitive query parameters and fragments
 * - Error messages and stack traces are redacted to remove tokens/emails
 * - localStorage writes fail silently to prevent quota errors
 * - Error logs have TTL-based retention (default: 7 days)
 * - Maximum retention: last 50 errors (configurable)
 *
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

export type ErrorSeverity =
	(typeof ERROR_SEVERITY)[keyof typeof ERROR_SEVERITY];
export type ErrorCategory =
	(typeof ERROR_CATEGORY)[keyof typeof ERROR_CATEGORY];

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
	expiresAt?: string; // ISO timestamp for TTL-based retention
	message: string;
	messageHash?: string; // Hashed summary of message for sensitive errors
	stack?: string;
	stackHash?: string; // Hashed summary of stack for sensitive errors
	category: ErrorCategory;
	severity: ErrorSeverity;
	context: {
		memberId?: string; // Hashed value
		subdomain?: string; // Hashed value
		url?: string; // Sanitized (origin + pathname only)
		[key: string]: unknown;
	};
}

/**
 * Configuration constants for error tracking
 */
const ERROR_TRACKING_CONFIG = {
	MAX_ERRORS: 50, // Maximum number of errors to retain
	TTL_DAYS: 7, // Time-to-live in days for error entries
	MESSAGE_MAX_LENGTH: 200, // Maximum length for error messages
	STACK_MAX_LENGTH: 500, // Maximum length for stack traces
} as const;

/**
 * Sensitive query parameters that should be stripped from URLs
 */
const SENSITIVE_QUERY_PARAMS = new Set([
	"token",
	"access_token",
	"refresh_token",
	"api_key",
	"apikey",
	"password",
	"secret",
	"auth",
	"authorization",
	"session",
	"sessionid",
	"sid",
	"csrf",
	"csrf_token",
	"email",
	"user",
	"username",
	"memberid",
	"member_id",
]);

/**
 * Whitelist of safe query parameters that can be stored
 * If empty, only origin + pathname is stored
 */
const SAFE_QUERY_PARAMS = new Set<string>([
	// Add safe query params here if needed, e.g. "page", "limit"
]);

/**
 * Patterns to redact from error messages and stack traces
 */
const SENSITIVE_PATTERNS = [
	/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Email addresses
	/\b(?:token|api[_-]?key|access[_-]?token|refresh[_-]?token|auth[_-]?token|bearer)\s*[:=]\s*['"]?([A-Za-z0-9\-._~+/]+=*)['"]?/gi, // Tokens
	/\b(?:password|passwd|pwd|secret)\s*[:=]\s*['"]?([^\s'"]+)['"]?/gi, // Passwords
	/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, // Credit card numbers
];

/**
 * Simple hash function for PII (non-cryptographic, for privacy only)
 * Uses a simple string hash algorithm
 */
function hashValue(value: string): string {
	if (!value) return "";

	// Simple hash function (FNV-1a inspired)
	let hash = 2166136261;
	for (let i = 0; i < value.length; i++) {
		hash ^= value.charCodeAt(i);
		hash +=
			(hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
	}

	// Convert to hex and take first 16 chars
	return `hash_${Math.abs(hash).toString(16).substring(0, 16)}`;
}

/**
 * Redact sensitive patterns from text
 */
function redactSensitive(text: string): string {
	let redacted = text;
	for (const pattern of SENSITIVE_PATTERNS) {
		redacted = redacted.replace(pattern, "[REDACTED]");
	}
	return redacted;
}

/**
 * Sanitize error message by redacting sensitive info and truncating
 */
function sanitizeMessage(message: string): { message: string; hash?: string } {
	const redacted = redactSensitive(message);
	const truncated =
		redacted.length > ERROR_TRACKING_CONFIG.MESSAGE_MAX_LENGTH
			? `${redacted.substring(0, ERROR_TRACKING_CONFIG.MESSAGE_MAX_LENGTH)}...`
			: redacted;

	// If message was redacted or truncated, store hash of original
	const needsHash = redacted !== message || truncated !== redacted;
	const hash = needsHash ? hashValue(message) : undefined;

	return { message: truncated, hash };
}

/**
 * Sanitize stack trace by redacting sensitive info and truncating
 */
function sanitizeStack(stack: string | undefined): {
	stack?: string;
	hash?: string;
} {
	if (!stack) return {};

	const redacted = redactSensitive(stack);
	const truncated =
		redacted.length > ERROR_TRACKING_CONFIG.STACK_MAX_LENGTH
			? `${redacted.substring(0, ERROR_TRACKING_CONFIG.STACK_MAX_LENGTH)}...`
			: redacted;

	// If stack was redacted or truncated, store hash of original
	const needsHash = redacted !== stack || truncated !== redacted;
	const hash = needsHash ? hashValue(stack) : undefined;

	return { stack: truncated, hash };
}

/**
 * Sanitize URL by removing sensitive query parameters and fragments
 * Only stores origin + pathname, or origin + pathname + safe query params
 */
function sanitizeUrl(url: string | undefined): string | undefined {
	if (!url) return undefined;

	try {
		const urlObj = new URL(url);
		const origin = urlObj.origin;
		const pathname = urlObj.pathname;

		// If no safe query params whitelist, return only origin + pathname
		if (SAFE_QUERY_PARAMS.size === 0) {
			return `${origin}${pathname}`;
		}

		// Otherwise, include only safe query parameters
		const safeParams = new URLSearchParams();
		urlObj.searchParams.forEach((value, key) => {
			const lowerKey = key.toLowerCase();
			if (
				SAFE_QUERY_PARAMS.has(lowerKey) &&
				!SENSITIVE_QUERY_PARAMS.has(lowerKey)
			) {
				safeParams.set(key, value);
			}
		});

		const queryString = safeParams.toString();
		return queryString
			? `${origin}${pathname}?${queryString}`
			: `${origin}${pathname}`;
	} catch {
		// If URL parsing fails, return a sanitized version
		// Remove fragments and try to extract origin + pathname
		const withoutFragment = url.split("#")[0];
		const withoutQuery = withoutFragment.split("?")[0];
		try {
			const urlObj = new URL(withoutQuery);
			return `${urlObj.origin}${urlObj.pathname}`;
		} catch {
			// If still fails, return a generic placeholder
			return "[INVALID_URL]";
		}
	}
}

/**
 * Purge expired errors based on TTL
 */
function purgeExpiredErrors(errors: ErrorInfo[]): ErrorInfo[] {
	const now = Date.now();
	return errors.filter((error) => {
		if (!error.expiresAt) return true; // Keep errors without expiry (legacy)
		try {
			const expiresAt = new Date(error.expiresAt).getTime();
			return expiresAt > now;
		} catch {
			return false; // Remove errors with invalid expiry
		}
	});
}

/**
 * Enforce retention limits (max N errors)
 */
function enforceRetentionLimit(errors: ErrorInfo[]): ErrorInfo[] {
	if (errors.length <= ERROR_TRACKING_CONFIG.MAX_ERRORS) {
		return errors;
	}
	// Keep only the most recent N errors
	return errors.slice(-ERROR_TRACKING_CONFIG.MAX_ERRORS);
}

/**
 * Track an error with structured context
 * All PII is sanitized/hashed before storage for privacy compliance.
 *
 * @param error - The error object or error message
 * @param context - Additional context about the error
 * @returns The tracked error information (sanitized)
 */
export function trackError(
	error: Error | string,
	context: ErrorContext = {},
): ErrorInfo {
	const rawMessage = error instanceof Error ? error.message : String(error);
	const rawStack = error instanceof Error ? error.stack : undefined;

	// Sanitize message and stack
	const { message, hash: messageHash } = sanitizeMessage(rawMessage);
	const { stack, hash: stackHash } = sanitizeStack(rawStack);

	// Calculate expiry timestamp (TTL-based retention)
	const now = new Date();
	const expiresAt = new Date(
		now.getTime() + ERROR_TRACKING_CONFIG.TTL_DAYS * 24 * 60 * 60 * 1000,
	);

	// Build sanitized error info
	const errorInfo: ErrorInfo = {
		timestamp: now.toISOString(),
		expiresAt: expiresAt.toISOString(),
		message,
		...(messageHash && { messageHash }),
		...(stack && { stack }),
		...(stackHash && { stackHash }),
		category: context.category || ERROR_CATEGORY.UNKNOWN,
		severity: context.severity || ERROR_SEVERITY.MEDIUM,
		context: {
			// Hash PII before storage
			...(context.memberId && { memberId: hashValue(context.memberId) }),
			...(context.subdomain && { subdomain: hashValue(context.subdomain) }),
			// Sanitize URL (remove sensitive query params and fragments)
			...(context.url && { url: sanitizeUrl(context.url) }),
			// Sanitize metadata if present (redact sensitive patterns)
			...(context.metadata &&
				Object.keys(context.metadata).length > 0 && {
					metadata: Object.fromEntries(
						Object.entries(context.metadata).map(([key, value]) => [
							key,
							typeof value === "string" ? redactSensitive(value) : value,
						]),
					),
				}),
		},
	};

	// Log the error with structured information (original message for debugging)
	logger.error(
		"[ERROR_TRACKING]",
		`[${errorInfo.category}] [${errorInfo.severity}] ${rawMessage}`,
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

	// Store errors in localStorage for debugging
	// localStorage writes fail silently to prevent quota errors (compliance requirement)
	try {
		// Get existing errors
		const storedErrors = JSON.parse(
			localStorage.getItem("error_tracking_log") || "[]",
		) as ErrorInfo[];

		// Purge expired errors (TTL-based retention)
		const activeErrors = purgeExpiredErrors(storedErrors);

		// Add new error
		activeErrors.push(errorInfo);

		// Enforce retention limit (max N errors)
		const trimmedErrors = enforceRetentionLimit(activeErrors);

		// Store back to localStorage (fail silently if quota exceeded)
		localStorage.setItem("error_tracking_log", JSON.stringify(trimmedErrors));
	} catch (e) {
		// Fail silently - localStorage may be unavailable or quota exceeded
		// This is intentional for compliance (don't break app if storage fails)
		// Only log to console if logger is available (won't affect user experience)
		if (logger?.warn) {
			try {
				logger.warn(
					"[ERROR_TRACKING]",
					"Failed to store error in localStorage (quota exceeded or unavailable):",
					e instanceof Error ? e.message : String(e),
				);
			} catch {
				// If logger also fails, fail completely silently
			}
		}
	}

	return errorInfo;
}

/**
 * Track a scraping error
 * @param error - The error object
 * @param context - Additional context
 */
export function trackScrapingError(
	error: Error,
	context: Omit<ErrorContext, "category" | "severity"> = {},
): ErrorInfo {
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
export function trackSubdomainError(
	error: Error,
	context: Omit<ErrorContext, "category" | "severity"> = {},
): ErrorInfo {
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
export function trackNetworkError(
	error: Error,
	context: Omit<ErrorContext, "category" | "severity"> = {},
): ErrorInfo {
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
export function trackParsingError(
	error: Error,
	context: Omit<ErrorContext, "category" | "severity"> = {},
): ErrorInfo {
	return trackError(error, {
		category: ERROR_CATEGORY.PARSING,
		severity: ERROR_SEVERITY.MEDIUM,
		...context,
	});
}

/**
 * Get recent errors from localStorage
 * Automatically purges expired errors based on TTL.
 *
 * @param limit - Maximum number of errors to return
 * @returns Array of recent errors (sanitized)
 */
export function getRecentErrors(limit = 10): ErrorInfo[] {
	try {
		const storedErrors = JSON.parse(
			localStorage.getItem("error_tracking_log") || "[]",
		) as ErrorInfo[];

		// Purge expired errors (TTL-based retention)
		const activeErrors = purgeExpiredErrors(storedErrors);

		// If expired errors were removed, update localStorage
		if (activeErrors.length !== storedErrors.length) {
			try {
				const trimmedErrors = enforceRetentionLimit(activeErrors);
				localStorage.setItem(
					"error_tracking_log",
					JSON.stringify(trimmedErrors),
				);
			} catch {
				// Fail silently if localStorage update fails
			}
		}

		return activeErrors.slice(-limit);
	} catch (e) {
		// Fail silently - localStorage may be unavailable
		if (logger?.warn) {
			try {
				logger.warn("[ERROR_TRACKING]", "Failed to get recent errors:", e);
			} catch {
				// If logger fails, fail completely silently
			}
		}
		return [];
	}
}

/**
 * Clear error tracking log
 * Fails silently if localStorage is unavailable (compliance requirement).
 */
export function clearErrorLog(): void {
	try {
		localStorage.removeItem("error_tracking_log");
		if (logger?.info) {
			try {
				logger.info("[ERROR_TRACKING]", "Error log cleared");
			} catch {
				// If logger fails, fail completely silently
			}
		}
	} catch (e) {
		// Fail silently - localStorage may be unavailable
		// This is intentional for compliance (don't break app if storage fails)
		if (logger?.warn) {
			try {
				logger.warn("[ERROR_TRACKING]", "Failed to clear error log:", e);
			} catch {
				// If logger also fails, fail completely silently
			}
		}
	}
}
