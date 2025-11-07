// localStorage cache manager with TTL support
// Consolidated cache: all data (including subdomain) stored in single key per member
import { SUBDOMAIN_CACHE_TTL } from "./constants.js";

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
		console.warn("[CACHE] Error reading cached data:", error);
		return null;
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
		console.warn("[CACHE] Error setting cached data:", error);
	}
}

/**
 * Get cached subdomain for a member (from consolidated cache)
 * Uses subdomain TTL (24h) not data TTL (5min) - subdomain persists longer
 * @param {string} memberId - Member ID
 * @returns {string|null} Cached subdomain or null if expired/not found
 */
export function getCachedSubdomain(memberId) {
	try {
		const cacheKey = `movember:data:${memberId}`;
		const cached = localStorage.getItem(cacheKey);
		if (!cached) return null;

		const { data, cachedAt } = JSON.parse(cached);
		const now = Date.now();

		// For subdomain, use SUBDOMAIN_CACHE_TTL (24h) instead of data TTL (5min)
		// Check if subdomain exists in data
		if (data?.subdomain) {
			// Use longer TTL for subdomain (24 hours)
			if (now - cachedAt > SUBDOMAIN_CACHE_TTL) {
				// Subdomain expired, but don't remove cache yet (data might still be valid)
				return null;
			}
			return data.subdomain;
		}
		return null;
	} catch (error) {
		console.warn("[CACHE] Error reading cached subdomain:", error);
		return null;
	}
}

/**
 * Set cached subdomain for a member (updates consolidated cache)
 * @param {string} memberId - Member ID
 * @param {string} subdomain - Subdomain to cache
 * @param {number} ttl - Time to live in milliseconds
 */
export function setCachedSubdomain(memberId, subdomain, ttl) {
	try {
		// Get existing data or create new
		let data = getCachedData(memberId);
		if (!data) {
			data = {};
		}

		// Update subdomain in data
		data.subdomain = subdomain;

		// Save with the provided TTL
		setCachedData(memberId, data, ttl);
	} catch (error) {
		console.warn("[CACHE] Error setting cached subdomain:", error);
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

		// Also clear old separate subdomain cache if it exists (migration cleanup)
		const oldSubdomainKey = `movember:subdomain:${memberId}`;
		localStorage.removeItem(oldSubdomainKey);

		// Also clear old amount cache if it exists (migration cleanup)
		const oldAmountKey = `movember:amount:${memberId}`;
		localStorage.removeItem(oldAmountKey);
	} catch (error) {
		console.warn("[CACHE] Error clearing cached data:", error);
	}
}
