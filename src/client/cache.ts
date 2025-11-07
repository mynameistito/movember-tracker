// localStorage cache manager with TTL support
// Subdomain stored in separate cache key (movember:subdomain:${memberId}) with 24h TTL
// Data stored in separate cache key (movember:data:${memberId}) with 5min TTL
import logger from "./logger.js";

export interface CachedData {
	amount: string;
	currency: string;
	subdomain: string;
	timestamp: number;
	target?: string;
	percentage?: number;
}

interface CacheEntry<T> {
	data: T;
	cachedAt: number;
	ttl: number;
}

interface SubdomainCacheEntry {
	subdomain: string;
	cachedAt: number;
	ttl: number;
}

/**
 * Get cached donation data for a member (includes subdomain)
 * @param memberId - Member ID
 * @returns Cached data or null if expired/not found
 * Data structure: { amount, currency, target, percentage, timestamp, subdomain }
 */
export function getCachedData(memberId: string): CachedData | null {
	try {
		const cacheKey = `movember:data:${memberId}`;
		const cached = localStorage.getItem(cacheKey);
		if (!cached) return null;

		const entry = JSON.parse(cached) as CacheEntry<CachedData>;
		const now = Date.now();

		// Check if cache is expired
		if (now - entry.cachedAt > entry.ttl) {
			localStorage.removeItem(cacheKey);
			return null;
		}

		return entry.data;
	} catch (error) {
		logger.warn("[CACHE]", "Error reading cached data:", error);
		return null;
	}
}

/**
 * Get stale cached data for a member (even if expired)
 * Used for stale-while-revalidate pattern
 * @param memberId - Member ID
 * @returns Stale cached data or null if not found
 * Data structure: { amount, currency, target, percentage, timestamp, subdomain }
 */
export function getStaleCachedData(memberId: string): CachedData | null {
	try {
		const cacheKey = `movember:data:${memberId}`;
		const cached = localStorage.getItem(cacheKey);
		if (!cached) return null;

		const entry = JSON.parse(cached) as CacheEntry<CachedData>;

		// Return data even if expired (for stale-while-revalidate)
		// Only return null if cache doesn't exist
		return entry.data;
	} catch (error) {
		logger.warn("[CACHE]", "Error reading stale cached data:", error);
		return null;
	}
}

/**
 * Check if cached data is stale (expired but still available)
 * @param memberId - Member ID
 * @returns True if data exists but is expired, false otherwise
 */
export function isCachedDataStale(memberId: string): boolean {
	try {
		const cacheKey = `movember:data:${memberId}`;
		const cached = localStorage.getItem(cacheKey);
		if (!cached) return false;

		const entry = JSON.parse(cached) as CacheEntry<CachedData>;
		const now = Date.now();

		// Check if cache is expired
		return now - entry.cachedAt > entry.ttl;
	} catch (error) {
		logger.warn("[CACHE]", "Error checking if cached data is stale:", error);
		return false;
	}
}

/**
 * Set cached donation data for a member (includes subdomain)
 * @param memberId - Member ID
 * @param data - Data to cache (must include subdomain)
 * @param ttl - Time to live in milliseconds
 */
export function setCachedData(
	memberId: string,
	data: CachedData,
	ttl: number,
): void {
	try {
		const cacheKey = `movember:data:${memberId}`;
		const cacheValue: CacheEntry<CachedData> = {
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
 * @param memberId - Member ID
 * @returns Cached subdomain or null if expired/not found
 */
export function getCachedSubdomain(memberId: string): string | null {
	try {
		const cacheKey = `movember:subdomain:${memberId}`;
		const cached = localStorage.getItem(cacheKey);
		if (!cached) return null;

		const entry = JSON.parse(cached) as SubdomainCacheEntry;
		const now = Date.now();

		// Check if cache is expired using the stored TTL
		if (now - entry.cachedAt > entry.ttl) {
			localStorage.removeItem(cacheKey);
			return null;
		}

		return entry.subdomain;
	} catch (error) {
		logger.warn("[CACHE]", "Error reading cached subdomain:", error);
		return null;
	}
}

/**
 * Set cached subdomain for a member (uses separate cache key with independent TTL)
 * @param memberId - Member ID
 * @param subdomain - Subdomain to cache
 * @param ttl - Time to live in milliseconds (typically SUBDOMAIN_CACHE_TTL)
 */
export function setCachedSubdomain(
	memberId: string,
	subdomain: string,
	ttl: number,
): void {
	try {
		const cacheKey = `movember:subdomain:${memberId}`;
		const cacheValue: SubdomainCacheEntry = {
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
 * @param memberId - Member ID
 */
export function clearSubdomainCache(memberId: string): void {
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
