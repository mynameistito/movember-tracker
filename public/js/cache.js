// localStorage cache manager with TTL support

/**
 * Get cached donation data for a member
 * @param {string} memberId - Member ID
 * @returns {Object|null} Cached data or null if expired/not found
 */
export function getCachedData(memberId) {
  try {
    const cacheKey = `movember:amount:${memberId}`;
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
    console.warn('[CACHE] Error reading cached data:', error);
    return null;
  }
}

/**
 * Set cached donation data for a member
 * @param {string} memberId - Member ID
 * @param {Object} data - Data to cache
 * @param {number} ttl - Time to live in milliseconds
 */
export function setCachedData(memberId, data, ttl) {
  try {
    const cacheKey = `movember:amount:${memberId}`;
    const cacheValue = {
      data,
      cachedAt: Date.now(),
      ttl
    };
    localStorage.setItem(cacheKey, JSON.stringify(cacheValue));
  } catch (error) {
    console.warn('[CACHE] Error setting cached data:', error);
  }
}

/**
 * Get cached subdomain for a member
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
    
    // Check if cache is expired
    if (now - cachedAt > ttl) {
      localStorage.removeItem(cacheKey);
      return null;
    }
    
    return subdomain;
  } catch (error) {
    console.warn('[CACHE] Error reading cached subdomain:', error);
    return null;
  }
}

/**
 * Set cached subdomain for a member
 * @param {string} memberId - Member ID
 * @param {string} subdomain - Subdomain to cache
 * @param {number} ttl - Time to live in milliseconds
 */
export function setCachedSubdomain(memberId, subdomain, ttl) {
  try {
    const cacheKey = `movember:subdomain:${memberId}`;
    const cacheValue = {
      subdomain,
      cachedAt: Date.now(),
      ttl
    };
    localStorage.setItem(cacheKey, JSON.stringify(cacheValue));
  } catch (error) {
    console.warn('[CACHE] Error setting cached subdomain:', error);
  }
}

/**
 * Clear cached subdomain for a member
 * @param {string} memberId - Member ID
 */
export function clearSubdomainCache(memberId) {
  try {
    const cacheKey = `movember:subdomain:${memberId}`;
    localStorage.removeItem(cacheKey);
  } catch (error) {
    console.warn('[CACHE] Error clearing cached subdomain:', error);
  }
}

