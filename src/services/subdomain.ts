import type { Env } from '../types';
import {
  MEMBER_SUBDOMAIN_MAP,
  DEFAULT_SUBDOMAIN,
  MOVEMBER_BASE_URL_TEMPLATE,
  SUBDOMAIN_CACHE_TTL,
} from '../constants';

// Helper function to extract subdomain from URL
export function extractSubdomainFromUrl(url: string): string | null {
  const match = url.match(/https?:\/\/([^.]+)\.movember\.com/);
  return match ? match[1] : null;
}

// Helper function to clear cached subdomain for a member
export async function clearSubdomainCache(env: Env, memberId: string): Promise<void> {
  const cacheKey = `movember:subdomain:${memberId}`;
  await env.CACHE.delete(cacheKey);
  console.log(`[SUBDOMAIN] Cleared cached subdomain for memberId ${memberId}`);
}

// Helper function to detect subdomain by following redirects
export async function detectSubdomainForMember(env: Env, memberId: string, forceRefresh: boolean = false): Promise<string> {
  const cacheKey = `movember:subdomain:${memberId}`;
  
  // Check cache first (unless forcing refresh)
  if (!forceRefresh) {
    const cached = await env.CACHE.get(cacheKey);
    if (cached) {
      console.log(`[SUBDOMAIN] Found cached subdomain for memberId ${memberId}: ${cached}`);
      return cached;
    }
  } else {
    console.log(`[SUBDOMAIN] Force refresh requested, skipping cache for memberId ${memberId}`);
  }
  
  // Check manual override
  if (MEMBER_SUBDOMAIN_MAP[memberId]) {
    const subdomain = MEMBER_SUBDOMAIN_MAP[memberId];
    console.log(`[SUBDOMAIN] Using manual override for memberId ${memberId}: ${subdomain}`);
    // Cache the manual override
    await env.CACHE.put(cacheKey, subdomain, { expirationTtl: SUBDOMAIN_CACHE_TTL });
    return subdomain;
  }
  
  // Try to detect by following redirects
  console.log(`[SUBDOMAIN] Detecting subdomain for memberId ${memberId}...`);
  const testUrl = MOVEMBER_BASE_URL_TEMPLATE.replace("{subdomain}", DEFAULT_SUBDOMAIN) + `?memberId=${memberId}`;
  
  const fetchOptions = {
    redirect: 'follow' as RequestRedirect, // Follow redirects automatically
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  };
  
  try {
    // First try a HEAD request (lighter weight)
    let response = await fetch(testUrl, {
      ...fetchOptions,
      method: 'HEAD',
    });
    
    // If we get a 404, the member might not exist or the subdomain is wrong
    if (response.status === 404) {
      console.warn(`[SUBDOMAIN] Got 404 for ${testUrl}, member may not exist or subdomain may be wrong`);
      // Try a few common subdomains
      const commonSubdomains = ['us', 'uk', 'ca', 'nz', 'ie', 'za', 'nl', 'de', 'fr', 'es', 'it'];
      for (const subdomain of commonSubdomains) {
        const testSubdomainUrl = MOVEMBER_BASE_URL_TEMPLATE.replace("{subdomain}", subdomain) + `?memberId=${memberId}`;
        try {
          const testResponse = await fetch(testSubdomainUrl, {
            ...fetchOptions,
            method: 'HEAD',
          });
          if (testResponse.ok || testResponse.status !== 404) {
            console.log(`[SUBDOMAIN] Found working subdomain for memberId ${memberId}: ${subdomain}`);
            await env.CACHE.put(cacheKey, subdomain, { expirationTtl: SUBDOMAIN_CACHE_TTL });
            return subdomain;
          }
        } catch (e) {
          // Continue to next subdomain
        }
      }
      // If all subdomains fail, still cache the default to avoid repeated lookups
      console.warn(`[SUBDOMAIN] Could not find working subdomain for memberId ${memberId}, using default: ${DEFAULT_SUBDOMAIN}`);
      await env.CACHE.put(cacheKey, DEFAULT_SUBDOMAIN, { expirationTtl: SUBDOMAIN_CACHE_TTL });
      return DEFAULT_SUBDOMAIN;
    }
    
    // Get the final URL after redirects
    let finalUrl = response.url;
    let detectedSubdomain = extractSubdomainFromUrl(finalUrl);
    
    // If HEAD didn't work or didn't redirect, try GET
    if (!detectedSubdomain || finalUrl === testUrl) {
      console.log(`[SUBDOMAIN] HEAD request didn't reveal redirect, trying GET...`);
      response = await fetch(testUrl, {
        ...fetchOptions,
        method: 'GET',
      });
      
      // Check for 404 again
      if (response.status === 404) {
        console.warn(`[SUBDOMAIN] Got 404 for ${testUrl} with GET request`);
        // Try common subdomains as above
        const commonSubdomains = ['us', 'uk', 'ca', 'nz', 'ie', 'za', 'nl', 'de', 'fr', 'es', 'it'];
        for (const subdomain of commonSubdomains) {
          const testSubdomainUrl = MOVEMBER_BASE_URL_TEMPLATE.replace("{subdomain}", subdomain) + `?memberId=${memberId}`;
          try {
            const testResponse = await fetch(testSubdomainUrl, {
              ...fetchOptions,
              method: 'GET',
            });
            if (testResponse.ok || testResponse.status !== 404) {
              console.log(`[SUBDOMAIN] Found working subdomain for memberId ${memberId}: ${subdomain}`);
              await env.CACHE.put(cacheKey, subdomain, { expirationTtl: SUBDOMAIN_CACHE_TTL });
              return subdomain;
            }
          } catch (e) {
            // Continue to next subdomain
          }
        }
        console.warn(`[SUBDOMAIN] Could not find working subdomain for memberId ${memberId}, using default: ${DEFAULT_SUBDOMAIN}`);
        await env.CACHE.put(cacheKey, DEFAULT_SUBDOMAIN, { expirationTtl: SUBDOMAIN_CACHE_TTL });
        return DEFAULT_SUBDOMAIN;
      }
      
      finalUrl = response.url;
      detectedSubdomain = extractSubdomainFromUrl(finalUrl);
    }
    
    if (detectedSubdomain && detectedSubdomain !== DEFAULT_SUBDOMAIN) {
      console.log(`[SUBDOMAIN] Detected subdomain for memberId ${memberId}: ${detectedSubdomain} (from ${finalUrl})`);
      // Cache the detected subdomain
      await env.CACHE.put(cacheKey, detectedSubdomain, { expirationTtl: SUBDOMAIN_CACHE_TTL });
      return detectedSubdomain;
    } else if (detectedSubdomain) {
      // Same subdomain, no redirect needed
      console.log(`[SUBDOMAIN] No redirect detected for memberId ${memberId}, using default: ${DEFAULT_SUBDOMAIN}`);
      await env.CACHE.put(cacheKey, DEFAULT_SUBDOMAIN, { expirationTtl: SUBDOMAIN_CACHE_TTL });
      return DEFAULT_SUBDOMAIN;
    }
  } catch (error) {
    console.warn(`[SUBDOMAIN] Failed to detect subdomain for memberId ${memberId}, using default:`, error);
  }
  
  // Fallback to default
  console.log(`[SUBDOMAIN] Using default subdomain for memberId ${memberId}: ${DEFAULT_SUBDOMAIN}`);
  await env.CACHE.put(cacheKey, DEFAULT_SUBDOMAIN, { expirationTtl: SUBDOMAIN_CACHE_TTL });
  return DEFAULT_SUBDOMAIN;
}

// Helper function to get subdomain for a member ID (with auto-detection)
export async function getSubdomainForMember(env: Env, memberId: string): Promise<string> {
  // Check manual override first
  if (MEMBER_SUBDOMAIN_MAP[memberId]) {
    return MEMBER_SUBDOMAIN_MAP[memberId];
  }
  
  // Auto-detect (will check cache internally)
  return await detectSubdomainForMember(env, memberId);
}

// Helper function to build Movember URL with correct subdomain
export async function buildMovemberUrl(env: Env, memberId: string): Promise<string> {
  const subdomain = await getSubdomainForMember(env, memberId);
  const baseUrl = MOVEMBER_BASE_URL_TEMPLATE.replace("{subdomain}", subdomain);
  return `${baseUrl}?memberId=${memberId}`;
}

