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
 */

import { Option, Schema } from "effect";

import { logger } from "./logger.js";

const diagnosticTag = "[ERROR_TRACKING]";

interface SanitizedMessage {
  message: string;
  hash?: string;
}

interface SanitizedStack {
  stack?: string;
  hash?: string;
}

const errorLogKey = "error_tracking_log";

const metadataSchema = Schema.Record(
  Schema.String,
  Schema.Union([Schema.String, Schema.Number, Schema.Boolean, Schema.Null])
);

const diagnosticContextSchema = Schema.Struct({
  memberId: Schema.optionalKey(Schema.String),
  subdomain: Schema.optionalKey(Schema.String),
  url: Schema.optionalKey(Schema.String),
  metadata: Schema.optionalKey(metadataSchema),
});

const persistedErrorSchema = Schema.Struct({
  timestamp: Schema.String,
  expiresAt: Schema.optionalKey(Schema.String),
  message: Schema.String,
  messageHash: Schema.optionalKey(Schema.String),
  stack: Schema.optionalKey(Schema.String),
  stackHash: Schema.optionalKey(Schema.String),
  category: Schema.Literals([
    "scraping",
    "subdomain",
    "cache",
    "network",
    "parsing",
    "validation",
    "unknown",
  ]),
  severity: Schema.Literals(["low", "medium", "high", "critical"]),
  context: diagnosticContextSchema,
});

const readErrorLog = (): ErrorInfo[] => {
  const stored: unknown = JSON.parse(localStorage.getItem(errorLogKey) ?? "[]");

  const decoded = Schema.decodeUnknownOption(
    Schema.Array(persistedErrorSchema)
  )(stored);

  return [...Option.getOrElse(decoded, () => [])];
};

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

/** Importance attached to a diagnostic record. */
export type ErrorSeverity =
  (typeof ERROR_SEVERITY)[keyof typeof ERROR_SEVERITY];

/** Scraping stage that failed. */
export type ErrorCategory =
  (typeof ERROR_CATEGORY)[keyof typeof ERROR_CATEGORY];

/** Diagnostic context supplied by the failing operation. */
export interface ErrorContext {
  category?: ErrorCategory;
  severity?: ErrorSeverity;
  memberId?: string;
  subdomain?: string;
  url?: string;
  metadata?: Schema.Schema.Type<typeof metadataSchema>;
}

/** Sanitized diagnostic record with bounded retention. */
export interface ErrorInfo {
  timestamp: string;
  expiresAt?: string;
  message: string;
  messageHash?: string;
  stack?: string;
  stackHash?: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  context: {
    memberId?: string;
    subdomain?: string;
    url?: string;
    metadata?: Schema.Schema.Type<typeof metadataSchema>;
  };
}

// Configuration constants for error tracking
const ERROR_TRACKING_CONFIG = {
  MAX_ERRORS: 50,
  TTL_DAYS: 7,
  MESSAGE_MAX_LENGTH: 200,
  STACK_MAX_LENGTH: 500,
} as const;

// Sensitive query parameters that should be stripped from URLs
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

// Whitelist of safe query parameters that can be stored
// If empty, only origin + pathname is stored
const SAFE_QUERY_PARAMS = new Set<string>();

// Patterns to redact from error messages and stack traces
const SENSITIVE_PATTERNS = [
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/gu,
  /\b(?:token|api[_-]?key|bearer)\s*[:=]\s*['"]?(?:[a-z0-9._~+/=-]+)['"]?/giu,
  /\b(?:access|refresh|auth)[_-]?token\s*[:=]\s*['"]?(?:[a-z0-9._~+/=-]+)['"]?/giu,
  /\b(?:password|passwd|pwd|secret)\s*[:=]\s*['"]?(?:[^\s'"]+)['"]?/giu,
  /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/gu,
];

// Simple hash function for PII (non-cryptographic, for privacy only)
// Uses a simple string hash algorithm
/* oxlint-disable eslint/no-bitwise, unicorn/prefer-code-point -- Preserve the existing FNV-style UTF-16 diagnostic hashes. */
const hashValue = (value: string): string => {
  if (!value) {
    return "";
  }

  // Simple hash function (FNV-1a inspired)
  let hash = 2_166_136_261;

  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash +=
      (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }

  // Convert to hex and take first 16 chars
  return `hash_${Math.abs(hash).toString(16).slice(0, 16)}`;
};

/* oxlint-enable eslint/no-bitwise, unicorn/prefer-code-point */

// Redact sensitive patterns from text
const redactSensitive = (text: string): string => {
  let redacted = text;

  for (const pattern of SENSITIVE_PATTERNS) {
    redacted = redacted.replace(pattern, "[REDACTED]");
  }

  return redacted;
};

// Sanitize error message by redacting sensitive info and truncating
const sanitizeMessage = (message: string): SanitizedMessage => {
  const redacted = redactSensitive(message);

  const truncated =
    redacted.length > ERROR_TRACKING_CONFIG.MESSAGE_MAX_LENGTH
      ? `${redacted.slice(0, ERROR_TRACKING_CONFIG.MESSAGE_MAX_LENGTH)}...`
      : redacted;

  // If message was redacted or truncated, store hash of original
  const needsHash = redacted !== message || truncated !== redacted;
  const hash = needsHash ? hashValue(message) : undefined;

  return { message: truncated, hash };
};

// Sanitize stack trace by redacting sensitive info and truncating
const sanitizeStack = (stack: string | undefined): SanitizedStack => {
  if (!(stack !== null && stack !== undefined && stack !== "")) {
    return {};
  }

  const redacted = redactSensitive(stack);

  const truncated =
    redacted.length > ERROR_TRACKING_CONFIG.STACK_MAX_LENGTH
      ? `${redacted.slice(0, ERROR_TRACKING_CONFIG.STACK_MAX_LENGTH)}...`
      : redacted;

  // If stack was redacted or truncated, store hash of original
  const needsHash = redacted !== stack || truncated !== redacted;
  const hash = needsHash ? hashValue(stack) : undefined;

  return { stack: truncated, hash };
};

// Sanitize URL by removing sensitive query parameters and fragments
// Only stores origin + pathname, or origin + pathname + safe query params
const sanitizeUrl = (url: string | undefined): string | undefined => {
  if (!(url !== null && url !== undefined && url !== "")) {
    return undefined;
  }

  try {
    const urlObj = new URL(url);
    const { origin } = urlObj;
    const { pathname } = urlObj;

    // If no safe query params whitelist, return only origin + pathname
    if (SAFE_QUERY_PARAMS.size === 0) {
      return `${origin}${pathname}`;
    }

    // Otherwise, include only safe query parameters
    const safeParams = new URLSearchParams();

    for (const [key, value] of urlObj.searchParams) {
      const lowerKey = key.toLowerCase();

      if (
        SAFE_QUERY_PARAMS.has(lowerKey) &&
        !SENSITIVE_QUERY_PARAMS.has(lowerKey)
      ) {
        safeParams.set(key, value);
      }
    }

    const queryString = safeParams.toString();

    return queryString
      ? `${origin}${pathname}?${queryString}`
      : `${origin}${pathname}`;
  } catch {
    // If URL parsing fails, return a sanitized version
    // Remove fragments and try to extract origin + pathname
    const [withoutFragment] = url.split("#");
    const [withoutQuery] = withoutFragment.split("?");

    try {
      const urlObj = new URL(withoutQuery);

      return `${urlObj.origin}${urlObj.pathname}`;
    } catch {
      // If still fails, return a generic placeholder
      return "[INVALID_URL]";
    }
  }
};

// Purge expired errors based on TTL
const purgeExpiredErrors = (errors: ErrorInfo[]): ErrorInfo[] => {
  const now = Date.now();

  return errors.filter((error) => {
    if (
      !(
        error.expiresAt !== null &&
        error.expiresAt !== undefined &&
        error.expiresAt !== ""
      )
    ) {
      return true;
    }

    try {
      const expiresAt = new Date(error.expiresAt).getTime();

      return expiresAt > now;
    } catch {
      return false;
    }
  });
};

// Enforce retention limits (max N errors)
const enforceRetentionLimit = (errors: ErrorInfo[]): ErrorInfo[] => {
  if (errors.length <= ERROR_TRACKING_CONFIG.MAX_ERRORS) {
    return errors;
  }

  // Keep only the most recent N errors
  return errors.slice(-ERROR_TRACKING_CONFIG.MAX_ERRORS);
};

const sanitizeContext = (context: ErrorContext): ErrorInfo["context"] => {
  const sanitized: ErrorInfo["context"] = {};

  if (context.memberId !== undefined && context.memberId !== "") {
    sanitized.memberId = hashValue(context.memberId);
  }

  if (context.subdomain !== undefined && context.subdomain !== "") {
    sanitized.subdomain = hashValue(context.subdomain);
  }

  if (context.url !== undefined && context.url !== "") {
    sanitized.url = sanitizeUrl(context.url);
  }

  if (
    context.metadata !== undefined &&
    Object.keys(context.metadata).length > 0
  ) {
    sanitized.metadata = Object.fromEntries(
      Object.entries(context.metadata).map(([key, value]) => [
        key,
        Schema.is(Schema.String)(value) ? redactSensitive(value) : value,
      ])
    );
  }

  return sanitized;
};

/**
 * Track an error with structured context
 * All PII is sanitized/hashed before storage for privacy compliance.
 *
 * @param error - The error object or error message
 * @param context - Additional context about the error
 * @returns The tracked error information (sanitized)
 */
export const trackError = (
  error: Error | string,
  context: ErrorContext = {}
): ErrorInfo => {
  const rawMessage = error instanceof Error ? error.message : error;
  const rawStack = error instanceof Error ? error.stack : undefined;

  // Sanitize message and stack
  const { message, hash: messageHash } = sanitizeMessage(rawMessage);
  const { stack, hash: stackHash } = sanitizeStack(rawStack);

  // Calculate expiry timestamp (TTL-based retention)
  const now = new Date();

  const expiresAt = new Date(
    now.getTime() + ERROR_TRACKING_CONFIG.TTL_DAYS * 24 * 60 * 60 * 1000
  );

  // Build sanitized error info
  const errorInfo: ErrorInfo = {
    timestamp: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    message,
    ...(messageHash !== undefined &&
      messageHash !== null &&
      messageHash !== "" && { messageHash }),
    ...(stack !== undefined && stack !== null && stack !== "" && { stack }),
    ...(stackHash !== undefined &&
      stackHash !== null &&
      stackHash !== "" && { stackHash }),
    category: context.category ?? ERROR_CATEGORY.UNKNOWN,
    severity: context.severity ?? ERROR_SEVERITY.MEDIUM,
    context: sanitizeContext(context),
  };

  // Log the error with structured information (original message for debugging)
  logger.error(
    diagnosticTag,
    `[${errorInfo.category}] [${errorInfo.severity}] ${rawMessage}`,
    errorInfo
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
    const storedErrors = readErrorLog();

    // Purge expired errors (TTL-based retention)
    const activeErrors = purgeExpiredErrors(storedErrors);

    // Add new error
    activeErrors.push(errorInfo);

    // Enforce retention limit (max N errors)
    const trimmedErrors = enforceRetentionLimit(activeErrors);

    // Store back to localStorage (fail silently if quota exceeded)
    localStorage.setItem(errorLogKey, JSON.stringify(trimmedErrors));
  } catch (caughtError) {
    // Fail silently - localStorage may be unavailable or quota exceeded
    // This is intentional for compliance (don't break app if storage fails)
    // Only log to console if logger is available (won't affect user experience)

    try {
      logger.warn(
        diagnosticTag,
        "Failed to store error in localStorage (quota exceeded or unavailable):",
        caughtError instanceof Error ? caughtError.message : String(caughtError)
      );
    } catch {
      // If logger also fails, fail completely silently
    }
  }

  return errorInfo;
};

/**
 * Track a scraping error
 * @returns The sanitized diagnostic record.
 * @param error - The error object
 * @param context - Additional context
 */
export const trackScrapingError = (
  error: Error,
  context: Omit<ErrorContext, "category" | "severity"> = {}
): ErrorInfo =>
  trackError(error, {
    category: ERROR_CATEGORY.SCRAPING,
    severity: ERROR_SEVERITY.HIGH,
    ...context,
  });

/**
 * Track a subdomain detection error
 * @returns The sanitized diagnostic record.
 * @param error - The error object
 * @param context - Additional context
 */
export const trackSubdomainError = (
  error: Error,
  context: Omit<ErrorContext, "category" | "severity"> = {}
): ErrorInfo =>
  trackError(error, {
    category: ERROR_CATEGORY.SUBDOMAIN,
    severity: ERROR_SEVERITY.MEDIUM,
    ...context,
  });

/**
 * Track a network error
 * @returns The sanitized diagnostic record.
 * @param error - The error object
 * @param context - Additional context
 */
export const trackNetworkError = (
  error: Error,
  context: Omit<ErrorContext, "category" | "severity"> = {}
): ErrorInfo =>
  trackError(error, {
    category: ERROR_CATEGORY.NETWORK,
    severity: ERROR_SEVERITY.HIGH,
    ...context,
  });

/**
 * Track a parsing error
 * @returns The sanitized diagnostic record.
 * @param error - The error object
 * @param context - Additional context
 */
export const trackParsingError = (
  error: Error,
  context: Omit<ErrorContext, "category" | "severity"> = {}
): ErrorInfo =>
  trackError(error, {
    category: ERROR_CATEGORY.PARSING,
    severity: ERROR_SEVERITY.MEDIUM,
    ...context,
  });

/**
 * Get recent errors from localStorage
 * Automatically purges expired errors based on TTL.
 *
 * @param limit - Maximum number of errors to return
 * @returns Array of recent errors (sanitized)
 */
export const getRecentErrors = (limit = 10): ErrorInfo[] => {
  try {
    const storedErrors = readErrorLog();

    // Purge expired errors (TTL-based retention)
    const activeErrors = purgeExpiredErrors(storedErrors);

    // If expired errors were removed, update localStorage
    if (activeErrors.length !== storedErrors.length) {
      try {
        const trimmedErrors = enforceRetentionLimit(activeErrors);
        localStorage.setItem(
          "error_tracking_log",
          JSON.stringify(trimmedErrors)
        );
      } catch {
        // Fail silently if localStorage update fails
      }
    }

    return activeErrors.slice(-limit);
  } catch (error) {
    // Fail silently - localStorage may be unavailable

    try {
      logger.warn(diagnosticTag, "Failed to get recent errors:", error);
    } catch {
      // If logger fails, fail completely silently
    }

    return [];
  }
};

/**
 * Clear error tracking log
 * Fails silently if localStorage is unavailable (compliance requirement).
 */
export const clearErrorLog = (): void => {
  try {
    localStorage.removeItem(errorLogKey);

    try {
      logger.info(diagnosticTag, "Error log cleared");
    } catch {
      // If logger fails, fail completely silently
    }
  } catch (error) {
    // Fail silently - localStorage may be unavailable
    // This is intentional for compliance (don't break app if storage fails)

    try {
      logger.warn(diagnosticTag, "Failed to clear error log:", error);
    } catch {
      // If logger also fails, fail completely silently
    }
  }
};
