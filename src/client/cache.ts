// localStorage cache manager with TTL support
// Subdomain stored in separate cache key (movember:subdomain:${type}:${id}) with 24h TTL
// Data stored in separate cache key (movember:data:${type}:${id}) with 5min TTL
// Types: "member" or "team"
import logger from "./logger.js";

/**
 * Create cache key with proper namespacing for member or team
 * @param type - "member" or "team"
 * @param id - The ID (memberId or teamId)
 * @param prefix - Cache prefix (e.g., "data" or "subdomain")
 * @returns The cache key
 */
function createCacheKey(
	type: "member" | "team",
	id: string,
	prefix: string,
): string {
	return `movember:${prefix}:${type}:${id}`;
}

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
 * Get cached donation data for a member or team (includes subdomain)
 * @param type - "member" or "team"
 * @param id - Member ID or Team ID
 * @returns Cached data or null if expired/not found
 * Data structure: { amount, currency, target, percentage, timestamp, subdomain }
 */
export function getCachedData(
	type: "member" | "team",
	id: string,
): CachedData | null {
	try {
		const cacheKey = createCacheKey(type, id, "data");
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
 * Get stale cached data for a member or team (even if expired)
 * Used for stale-while-revalidate pattern
 * @param type - "member" or "team"
 * @param id - Member ID or Team ID
 * @returns Stale cached data or null if not found
 * Data structure: { amount, currency, target, percentage, timestamp, subdomain }
 */
export function getStaleCachedData(
	type: "member" | "team",
	id: string,
): CachedData | null {
	try {
		const cacheKey = createCacheKey(type, id, "data");
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
 * @param type - "member" or "team"
 * @param id - Member ID or Team ID
 * @returns True if data exists but is expired, false otherwise
 */
export function isCachedDataStale(
	type: "member" | "team",
	id: string,
): boolean {
	try {
		const cacheKey = createCacheKey(type, id, "data");
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
 * Set cached donation data for a member or team (includes subdomain)
 * @param type - "member" or "team"
 * @param id - Member ID or Team ID
 * @param data - Data to cache (must include subdomain)
 * @param ttl - Time to live in milliseconds
 */
export function setCachedData(
	type: "member" | "team",
	id: string,
	data: CachedData,
	ttl: number,
): void {
	try {
		const cacheKey = createCacheKey(type, id, "data");
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
 * Get cached subdomain for a member or team (from separate cache key)
 * Uses subdomain TTL (24h) independent of data TTL (5min) - subdomain persists longer
 * @param type - "member" or "team"
 * @param id - Member ID or Team ID
 * @returns Cached subdomain or null if expired/not found
 */
export function getCachedSubdomain(
	type: "member" | "team",
	id: string,
): string | null {
	try {
		const cacheKey = createCacheKey(type, id, "subdomain");
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
 * Set cached subdomain for a member or team (uses separate cache key with independent TTL)
 * @param type - "member" or "team"
 * @param id - Member ID or Team ID
 * @param subdomain - Subdomain to cache
 * @param ttl - Time to live in milliseconds (typically SUBDOMAIN_CACHE_TTL)
 */
export function setCachedSubdomain(
	type: "member" | "team",
	id: string,
	subdomain: string,
	ttl: number,
): void {
	try {
		const cacheKey = createCacheKey(type, id, "subdomain");
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
 * Clear cached data for a member or team (clears both data and subdomain)
 * @param type - "member" or "team"
 * @param id - Member ID or Team ID
 */
export function clearSubdomainCache(type: "member" | "team", id: string): void {
	try {
		const cacheKey = createCacheKey(type, id, "data");
		localStorage.removeItem(cacheKey);

		// Clear separate subdomain cache
		const subdomainKey = createCacheKey(type, id, "subdomain");
		localStorage.removeItem(subdomainKey);

		// Also clear old amount cache if it exists (migration cleanup)
		const oldAmountKey = `movember:amount:${type}:${id}`;
		localStorage.removeItem(oldAmountKey);
	} catch (error) {
		logger.warn("[CACHE]", "Error clearing cached data:", error);
	}
}
