// localStorage cache manager with TTL support
// Subdomain stored in separate cache key (movember:subdomain:${memberId}) with 24h TTL
// Data stored in separate cache key (movember:data:${memberId}) with 5min TTL
import { SUBDOMAIN_CACHE_TTL } from "./constants.js";
import logger from "./logger.js";

/**
 * Get cached donation data for a member (includes subdomain)
 * @param {string} memberId - Member ID
 * @returns {Object|null} Cached data or null if expired/not found
 * Data structure: { amount, currency, target, percentage, timestamp, subdomain }
 */
export function getCachedData(memberId) {
	try {
		const cacheKey = `movember:data:${memberId}`;
		const cached = localStorage.getItem(cacheKey);
		if (!cached) return null;

		const { data, cachedAt, ttl } = JSON.parse(cached);
		const now = Date.now();

		// Check if cache is expired
		if (now - cachedAt > ttl) {
			localStorage.removeItem(cacheKey);
			return null;
		}

		return data;
	} catch (error) {
		logger.warn("[CACHE]", "Error reading cached data:", error);
		return null;
	}
}

/**
 * Get stale cached data for a member (even if expired)
 * Used for stale-while-revalidate pattern
 * @param {string} memberId - Member ID
 * @returns {Object|null} Stale cached data or null if not found
 * Data structure: { amount, currency, target, percentage, timestamp, subdomain }
 */
export function getStaleCachedData(memberId) {
	try {
		const cacheKey = `movember:data:${memberId}`;
		const cached = localStorage.getItem(cacheKey);
		if (!cached) return null;

		const { data } = JSON.parse(cached);

		// Return data even if expired (for stale-while-revalidate)
		// Only return null if cache doesn't exist
		return data;
	} catch (error) {
		logger.warn("[CACHE]", "Error reading stale cached data:", error);
		return null;
	}
}

/**
 * Check if cached data is stale (expired but still available)
 * @param {string} memberId - Member ID
 * @returns {boolean} True if data exists but is expired, false otherwise
 */
export function isCachedDataStale(memberId) {
	try {
		const cacheKey = `movember:data:${memberId}`;
		const cached = localStorage.getItem(cacheKey);
		if (!cached) return false;

		const { cachedAt, ttl } = JSON.parse(cached);
		const now = Date.now();

		// Check if cache is expired
		return now - cachedAt > ttl;
	} catch (error) {
		logger.warn("[CACHE]", "Error checking if cached data is stale:", error);
		return false;
	}
}

/**
 * Set cached donation data for a member (includes subdomain)
 * @param {string} memberId - Member ID
 * @param {Object} data - Data to cache (must include subdomain)
 * @param {number} ttl - Time to live in milliseconds
 */
export function setCachedData(memberId, data, ttl) {
	try {
		const cacheKey = `movember:data:${memberId}`;
		const cacheValue = {
			data,
			cachedAt: Date.now(),
			ttl,
		};
		localStorage.setItem(cacheKey, JSON.stringify(cacheValue));
	} catch (error) {
		logger.warn("[CACHE]", "Error setting cached data:", error);
	}
}

/**
 * Get cached subdomain for a member (from separate cache key)
 * Uses subdomain TTL (24h) independent of data TTL (5min) - subdomain persists longer
 * @param {string} memberId - Member ID
 * @returns {string|null} Cached subdomain or null if expired/not found
 */
export function getCachedSubdomain(memberId) {
	try {
		const cacheKey = `movember:subdomain:${memberId}`;
		const cached = localStorage.getItem(cacheKey);
		if (!cached) return null;

		const { subdomain, cachedAt, ttl } = JSON.parse(cached);
		const now = Date.now();

		// Check if cache is expired using the stored TTL
		if (now - cachedAt > ttl) {
			localStorage.removeItem(cacheKey);
			return null;
		}

		return subdomain;
	} catch (error) {
		logger.warn("[CACHE]", "Error reading cached subdomain:", error);
		return null;
	}
}

/**
 * Set cached subdomain for a member (uses separate cache key with independent TTL)
 * @param {string} memberId - Member ID
 * @param {string} subdomain - Subdomain to cache
 * @param {number} ttl - Time to live in milliseconds (typically SUBDOMAIN_CACHE_TTL)
 */
export function setCachedSubdomain(memberId, subdomain, ttl) {
	try {
		const cacheKey = `movember:subdomain:${memberId}`;
		const cacheValue = {
			subdomain,
			cachedAt: Date.now(),
			ttl,
		};
		localStorage.setItem(cacheKey, JSON.stringify(cacheValue));
	} catch (error) {
		logger.warn("[CACHE]", "Error setting cached subdomain:", error);
	}
}

/**
 * Clear cached data for a member (clears both data and subdomain)
 * @param {string} memberId - Member ID
 */
export function clearSubdomainCache(memberId) {
	try {
		const cacheKey = `movember:data:${memberId}`;
		localStorage.removeItem(cacheKey);

		// Clear separate subdomain cache
		const subdomainKey = `movember:subdomain:${memberId}`;
		localStorage.removeItem(subdomainKey);

		// Also clear old amount cache if it exists (migration cleanup)
		const oldAmountKey = `movember:amount:${memberId}`;
		localStorage.removeItem(oldAmountKey);
	} catch (error) {
		logger.warn("[CACHE]", "Error clearing cached data:", error);
	}
}
