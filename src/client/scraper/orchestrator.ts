import { Effect, Schedule, Schema } from "effect";
/**
 * Main orchestration logic for scraping Movember pages
 */

import {
  clearSubdomainCache,
  getCachedData,
  getStaleCachedData,
  isCachedDataStale,
  setCachedData,
  setCachedSubdomain,
} from "../cache.js";
import type { CachedData } from "../cache.js";
import {
  CACHE_TTL,
  getCurrencySymbol,
  MAX_RETRIES,
  SUBDOMAIN_CACHE_TTL,
} from "../constants.js";
import { trackScrapingError } from "../error-tracking.js";
import { logger } from "../logger.js";
import { calculatePercentage, isValidNumber, parseAmount } from "../parsing.js";
import { extractAmounts } from "./html-parsing.js";
import {
  buildMovemberUrl,
  buildTeamUrl,
  extractSubdomainFromUrl,
  fetchViaProxy,
} from "./network.js";
import {
  detectSubdomainForMember,
  detectSubdomainForTeam,
  getSubdomainForMember,
  getSubdomainForTeam,
} from "./subdomain.js";

const fundraiserUrl = (
  type: "member" | "team",
  id: string,
  country: string
): string =>
  type === "team" ? buildTeamUrl(id, country) : buildMovemberUrl(id, country);

const loadFundraiser = async (
  type: "member" | "team",
  id: string,
  country: string,
  clearOn404: boolean,
  signal?: AbortSignal
) => {
  try {
    return await fetchViaProxy(fundraiserUrl(type, id, country), signal);
  } catch (error) {
    if (
      !clearOn404 ||
      !(error instanceof Error) ||
      !error.message.includes("404")
    ) {
      throw error;
    }

    clearSubdomainCache(type, id);

    const detected =
      type === "team"
        ? await detectSubdomainForTeam(id, true, signal)
        : await detectSubdomainForMember(id, true, signal);

    if (detected === country) {
      throw error;
    }

    return await fetchViaProxy(fundraiserUrl(type, id, detected), signal);
  }
};

const scrapeFundraiser = async (
  type: "member" | "team",
  id: string,
  clearOn404: boolean,
  signal?: AbortSignal
): Promise<ScrapedData> => {
  const started = Date.now();

  try {
    const country =
      type === "team"
        ? await getSubdomainForTeam(id, signal)
        : await getSubdomainForMember(id, signal);

    const { html, finalUrl } = await loadFundraiser(
      type,
      id,
      country,
      clearOn404,
      signal
    );

    const subdomain = extractSubdomainFromUrl(finalUrl) ?? country;
    setCachedSubdomain(type, id, subdomain, SUBDOMAIN_CACHE_TTL);

    const { raised, target } = extractAmounts(html, id, subdomain);

    if (!isValidNumber(raised)) {
      throw new Error(
        `Could not find raised amount in HTML for ${type} ${id}. Movember markup may have changed.`
      );
    }

    const { value, currency } = parseAmount(raised, subdomain);
    const symbol = getCurrencySymbol(currency);

    const data: ScrapedData = {
      amount: `${symbol}${value}`,
      currency,
      subdomain,
      timestamp: Date.now(),
    };

    if (isValidNumber(target)) {
      const goal = parseAmount(target, subdomain).value;
      data.target = `${symbol}${goal}`;
      data.percentage = calculatePercentage(value, goal);
    }

    return data;
  } catch (caughtError) {
    const error =
      caughtError instanceof Error
        ? caughtError
        : new Error(String(caughtError));

    trackScrapingError(error, {
      memberId: id,
      metadata: { duration: Date.now() - started, type },
    });

    throw error;
  }
};

const retryScrape = async (
  type: "member" | "team",
  id: string,
  scrape: (id: string, clearOn404: boolean) => Promise<ScrapedData>
): Promise<ScrapedData> =>
  await Effect.runPromise(
    Effect.tryPromise({
      try: async () => await scrape(id, true),
      catch: (caughtError) => {
        const error =
          caughtError instanceof Error
            ? caughtError
            : new Error(String(caughtError));

        if (error.message.includes("404")) {
          clearSubdomainCache(type, id);
        }

        return error;
      },
    }).pipe(
      Effect.retry({
        times: MAX_RETRIES - 1,
        schedule: Schedule.exponential(1000),
      })
    )
  );

/** A donation snapshot returned by the scraper. */
export interface ScrapedData extends CachedData {
  amount: string;
  currency: string;
  subdomain: string;
  timestamp: number;
  target?: string;
  percentage?: number;
}

const CacheStatus = Schema.Literals(["HIT", "MISS", "STALE", "LIVE"]);

/** A donation snapshot and the cache state used to obtain it. */
export interface GetDataResult {
  data: ScrapedData;
  cacheStatus: Schema.Schema.Type<typeof CacheStatus>;
}

/**
 * Scrape the Movember page using Worker's CORS proxy and HTML parsing
 * @param id - The member ID to scrape
 * @param clearSubdomainOn404 - Whether to clear subdomain cache on 404 errors
 * @param signal - Cancels discovery and fetching.
 * @returns The scraped data
 * @throws {Error} If scraping fails
 */
export const scrapeMovemberPage = async (
  id: string,
  clearSubdomainOn404 = false,
  signal?: AbortSignal
): Promise<ScrapedData> =>
  await scrapeFundraiser("member", id, clearSubdomainOn404, signal);

/**
 * Retry wrapper with exponential backoff
 * @param id - The member ID to scrape
 * @returns The scraped data
 * @throws {Error} If all retries fail
 */
export const scrapeWithRetry = async (id: string): Promise<ScrapedData> =>
  await retryScrape("member", id, scrapeMovemberPage);

/**
 * Scrape the Movember team page using Worker's CORS proxy and HTML parsing
 * @param id - The team ID to scrape
 * @param clearSubdomainOn404 - Whether to clear subdomain cache on 404 errors
 * @param signal - Cancels discovery and fetching.
 * @returns The scraped data
 * @throws {Error} If scraping fails
 */
export const scrapeTeamPage = async (
  id: string,
  clearSubdomainOn404 = false,
  signal?: AbortSignal
): Promise<ScrapedData> =>
  await scrapeFundraiser("team", id, clearSubdomainOn404, signal);

/**
 * Retry wrapper with exponential backoff for teams
 * @param id - The team ID to scrape
 * @returns The scraped data
 * @throws {Error} If all retries fail
 */
export const scrapeTeamWithRetry = async (id: string): Promise<ScrapedData> =>
  await retryScrape("team", id, scrapeTeamPage);

const refreshSnapshot = async (
  type: "member" | "team",
  id: string
): Promise<ScrapedData> => {
  const data =
    type === "team" ? await scrapeTeamWithRetry(id) : await scrapeWithRetry(id);

  setCachedData(type, id, data, CACHE_TTL);

  return data;
};

const refreshInBackground = async (
  type: "member" | "team",
  id: string
): Promise<void> => {
  try {
    await refreshSnapshot(type, id);
  } catch (error) {
    logger.warn(
      "[CACHE]",
      `Refresh failed for ${type} ${id}; retaining the last snapshot`,
      error
    );
  }
};

const readSnapshot = async (
  type: "member" | "team",
  id: string,
  live: boolean
): Promise<GetDataResult> => {
  if (!live) {
    const cached = getCachedData(type, id);

    if (cached) {
      return { data: cached, cacheStatus: "HIT" };
    }

    const stale = getStaleCachedData(type, id);

    if (stale && isCachedDataStale(type, id)) {
      void refreshInBackground(type, id);

      return { data: stale, cacheStatus: "STALE" };
    }
  }

  return {
    data: await refreshSnapshot(type, id),
    cacheStatus: live ? "LIVE" : "MISS",
  };
};

/**
 * Main function to get data (with stale-while-revalidate caching)
 * Implements stale-while-revalidate pattern: returns stale data immediately if available,
 * then fetches fresh data in the background and updates cache
 * @param memberId - The member ID to get data for
 * @param grabLive - Whether to force a fresh scrape (bypass cache)
 * @returns The data and cache status
 */
export const getData = async (
  memberId: string,
  grabLive = false
): Promise<GetDataResult> => await readSnapshot("member", memberId, grabLive);

/**
 * Main function to get team data (with stale-while-revalidate caching)
 * Implements stale-while-revalidate pattern: returns stale data immediately if available,
 * then fetches fresh data in the background and updates cache
 * @param teamId - The team ID to get data for
 * @param grabLive - Whether to force a fresh scrape (bypass cache)
 * @returns The data and cache status
 */
export const getTeamData = async (
  teamId: string,
  grabLive = false
): Promise<GetDataResult> => await readSnapshot("team", teamId, grabLive);
