import type { Env, ScrapedData } from '../types';
import { CACHE_TTL, DEFAULT_MEMBER_ID } from '../constants';
import { scrapeWithRetry } from '../services/scraper';

export async function getData(env: Env, request: Request): Promise<{ data: ScrapedData; cacheStatus: string }> {
  const url = new URL(request.url);
  const memberId = url.searchParams.get("memberId") || url.searchParams.get("memberid") || DEFAULT_MEMBER_ID;
  const grabLive = url.searchParams.has("grab-live");
  const cacheKey = `movember:amount:${memberId}`;
  let data: ScrapedData | null = null;
  let cacheStatus = "HIT";

  if (grabLive) {
    // Force fresh scrape, bypass cache
    console.log(`[LIVE] grab-live parameter detected - forcing fresh scrape for memberId: ${memberId}`);
    data = await scrapeWithRetry(env, memberId);
    cacheStatus = "LIVE";
    
    // Store in cache with 5-minute TTL
    console.log(`[CACHE] Storing live data in cache with TTL: ${CACHE_TTL}s for memberId: ${memberId}`);
    await env.CACHE.put(cacheKey, JSON.stringify(data), {
      expirationTtl: CACHE_TTL,
    });
    console.log(`[CACHE] Live data stored successfully`);
  } else {
    // Check cache first
    console.log(`[CACHE] Checking cache for key: ${cacheKey}`);
    let cached = await env.CACHE.get(cacheKey, { type: "json" });
    data = cached as ScrapedData | null;

    if (data) {
      const cacheAge = Date.now() - data.timestamp;
      console.log(`[CACHE] Cache HIT - data age: ${Math.round(cacheAge / 1000)}s for memberId: ${memberId}`, {
        amount: data.amount,
        target: data.target,
        timestamp: new Date(data.timestamp).toISOString(),
      });
    } else {
      console.log(`[CACHE] Cache MISS - need to scrape for memberId: ${memberId}`);
    }

    // If cache miss, scrape the page
    if (!data) {
      data = await scrapeWithRetry(env, memberId);
      cacheStatus = "MISS";
      
      // Store in cache with 5-minute TTL
      console.log(`[CACHE] Storing data in cache with TTL: ${CACHE_TTL}s for memberId: ${memberId}`);
      await env.CACHE.put(cacheKey, JSON.stringify(data), {
        expirationTtl: CACHE_TTL,
      });
      console.log(`[CACHE] Data stored successfully`);
    }
  }

  return { data, cacheStatus };
}

