/**
 * Main orchestration logic for scraping Movember pages
 * @module scraper/orchestrator
 */

import {
	type CachedData,
	clearSubdomainCache,
	getCachedData,
	getStaleCachedData,
	isCachedDataStale,
	setCachedData,
	setCachedSubdomain,
} from "../cache.js";
import {
	CACHE_TTL,
	getCurrencySymbol,
	MAX_RETRIES,
	RETRY_DELAYS,
	SUBDOMAIN_CACHE_TTL,
} from "../constants.js";
import { trackScrapingError } from "../error-tracking.js";
import { formatDuration, sleep } from "../formatting.js";
import logger from "../logger.js";
import { calculatePercentage, isValidNumber, parseAmount } from "../parsing.js";
import { extractAmounts } from "./html-parsing.js";
import {
	buildMovemberUrl,
	extractSubdomainFromUrl,
	fetchViaProxy,
} from "./network.js";
import {
	detectSubdomainForMember,
	detectSubdomainFromHtml,
	getSubdomainForMember,
} from "./subdomain.js";

export interface ScrapedData extends CachedData {
	amount: string;
	currency: string;
	subdomain: string;
	timestamp: number;
	target?: string;
	percentage?: number;
}

export interface GetDataResult {
	data: ScrapedData;
	cacheStatus: "HIT" | "MISS" | "STALE" | "LIVE";
}

/**
 * Scrape the Movember page using Worker's CORS proxy and HTML parsing
 * @param memberId - The member ID to scrape
 * @param clearSubdomainOn404 - Whether to clear subdomain cache on 404 errors
 * @returns The scraped data
 * @throws If scraping fails
 */
export async function scrapeMovemberPage(
	memberId: string,
	clearSubdomainOn404 = false,
): Promise<ScrapedData> {
	let subdomain = await getSubdomainForMember(memberId);
	const movemberUrl = buildMovemberUrl(memberId, subdomain);
	const startTime = Date.now();
	logger.info(
		"[SCRAPE]",
		`Starting scrape of Movember page: ${movemberUrl} (subdomain: ${subdomain})`,
	);

	try {
		// Fetch the HTML via Worker's CORS proxy
		logger.info("[SCRAPE]", `Fetching HTML from ${movemberUrl} via proxy...`);
		const fetchStart = Date.now();
		let html: string;
		let finalUrl: string;

		try {
			const result = await fetchViaProxy(movemberUrl);
			html = result.html;
			finalUrl = result.finalUrl;
		} catch (error) {
			// If we get an error, try clearing subdomain cache and re-detecting
			if (
				clearSubdomainOn404 &&
				error instanceof Error &&
				error.message.includes("404")
			) {
				logger.warn(
					"[SCRAPE]",
					`Got 404 for ${movemberUrl}, clearing cached subdomain and re-detecting...`,
				);
				clearSubdomainCache(memberId);
				// Re-detect subdomain with force refresh
				const newSubdomain = await detectSubdomainForMember(memberId, true);
				if (newSubdomain !== subdomain) {
					logger.info(
						"[SCRAPE]",
						`Re-detected subdomain: ${newSubdomain} (was ${subdomain}), retrying with new subdomain...`,
					);
					// Retry with new subdomain
					const newUrl = buildMovemberUrl(memberId, newSubdomain);
					const retryResult = await fetchViaProxy(newUrl);
					html = retryResult.html;
					finalUrl = retryResult.finalUrl;
					subdomain = newSubdomain;
				} else {
					throw new Error(
						`HTTP error! status: 404 (page not found - member may not exist)`,
					);
				}
			} else {
				throw error;
			}
		}

		const fetchDuration = Date.now() - fetchStart;
		logger.info(
			"[SCRAPE]",
			`HTML fetched successfully in ${formatDuration(fetchDuration)} (${html.length} characters)`,
		);

		// Check if URL redirected to a different subdomain
		const actualSubdomain = extractSubdomainFromUrl(finalUrl);
		if (actualSubdomain && actualSubdomain !== subdomain) {
			logger.info(
				"[SCRAPE]",
				`URL redirected from ${subdomain} to ${actualSubdomain}, updating subdomain...`,
			);
			subdomain = actualSubdomain;
			// Update cache with correct subdomain
			setCachedSubdomain(memberId, subdomain, SUBDOMAIN_CACHE_TTL);
		}

		// Verify subdomain by checking HTML content for currency indicators (optional verification only)
		const htmlDetectedSubdomain = detectSubdomainFromHtml(html);
		if (htmlDetectedSubdomain && htmlDetectedSubdomain !== subdomain) {
			logger.warn(
				"[SCRAPE]",
				`HTML currency indicates subdomain ${htmlDetectedSubdomain} but URL subdomain is ${subdomain}. Trusting URL subdomain (primary source).`,
			);
			// Don't override - trust the URL subdomain we're using
		} else if (htmlDetectedSubdomain === subdomain) {
			logger.info(
				"[SCRAPE]",
				`HTML currency verification confirms subdomain ${subdomain}`,
			);
		}

		// Extract data from HTML
		const { raised, target } = extractAmounts(html, memberId, subdomain);

		// Final validation check - ensure raised is actually valid before using
		if (!raised || !isValidNumber(raised)) {
			// Debug: Try to find any dollar amounts in the HTML to help diagnose
			const allDollarAmounts = html.match(/\$[\d,]+(?:\.\d+)?/g);
			logger.warn(
				"[SCRAPE]",
				`Found ${allDollarAmounts ? allDollarAmounts.length : 0} dollar amounts in HTML:`,
				allDollarAmounts ? allDollarAmounts.slice(0, 10) : [],
			); // Show first 10

			// Try to find any numbers that might be amounts
			const potentialAmounts = html.match(/[\d,]{3,}(?:\.\d+)?/g);
			logger.warn(
				"[SCRAPE]",
				`Found ${potentialAmounts ? potentialAmounts.length : 0} potential amount numbers in HTML (showing first 20):`,
				potentialAmounts ? potentialAmounts.slice(0, 20) : [],
			);

			const errorDetails = {
				memberId,
				subdomain,
				url: movemberUrl,
				message:
					"Could not find raised amount in HTML. The page may require JavaScript execution or the HTML structure may have changed.",
				htmlLength: html.length,
				dollarAmountsFound: allDollarAmounts ? allDollarAmounts.length : 0,
				raisedValue: raised || "empty",
			};
			logger.error(
				"[SCRAPE]",
				"Failed to extract raised amount:",
				errorDetails,
			);
			throw new Error(
				`Could not find raised amount in HTML for memberId ${memberId} (subdomain: ${subdomain}). The page may require JavaScript execution or the HTML structure may have changed. Found ${allDollarAmounts ? allDollarAmounts.length : 0} dollar amounts in HTML.`,
			);
		}

		// Double-check that raised is valid before parsing
		if (!isValidNumber(raised)) {
			throw new Error(
				`Invalid raised value captured: "${raised}" for memberId ${memberId}`,
			);
		}

		// Parse amount with subdomain to determine correct currency
		const { value: raisedValue, currency } = parseAmount(
			`$${raised}`,
			subdomain,
		);

		// Validate the parsed value is not empty or zero (unless it's actually zero)
		if (!raisedValue || raisedValue === "0" || raisedValue === "") {
			logger.warn(
				"[SCRAPE]",
				`Parsed raised value is invalid: "${raisedValue}" from input: "${raised}"`,
			);
		}

		// Format amount with appropriate currency symbol
		const currencySymbol = getCurrencySymbol(currency);
		const raisedFormatted = `${currencySymbol}${raisedValue}`;

		const result: ScrapedData = {
			amount: raisedFormatted,
			currency,
			subdomain, // Include subdomain in result for consolidated cache
			timestamp: Date.now(),
		};

		if (target && isValidNumber(target)) {
			const { value: targetValue } = parseAmount(`$${target}`, subdomain);
			// Use the same currency symbol for consistency
			const targetFormatted = `${currencySymbol}${targetValue}`;
			result.target = targetFormatted;
			result.percentage = calculatePercentage(raisedValue, targetValue);
		} else if (target) {
			logger.warn(
				"[SCRAPE]",
				`Target value "${target}" failed validation, skipping target`,
			);
		}

		const totalDuration = Date.now() - startTime;
		logger.info(
			"[SCRAPE]",
			`Scraping completed successfully in ${formatDuration(totalDuration)}:`,
			{
				amount: result.amount,
				target: result.target,
				percentage: result.percentage,
				currency: result.currency,
				subdomain: result.subdomain,
			},
		);

		return result;
	} catch (error) {
		const totalDuration = Date.now() - startTime;
		const errorMessage = error instanceof Error ? error.message : String(error);

		// Track error with structured context
		trackScrapingError(
			error instanceof Error ? error : new Error(errorMessage),
			{
				memberId,
				subdomain,
				url: movemberUrl,
				metadata: {
					duration: totalDuration,
					timestamp: Date.now(),
				},
			},
		);

		logger.error(
			"[SCRAPE]",
			`Scraping failed after ${formatDuration(totalDuration)}:`,
			errorMessage,
			error,
		);
		throw error;
	}
}

/**
 * Retry wrapper with exponential backoff
 * @param memberId - The member ID to scrape
 * @returns The scraped data
 * @throws If all retries fail
 */
export async function scrapeWithRetry(memberId: string): Promise<ScrapedData> {
	let lastError: Error | null = null;
	const retryStartTime = Date.now();

	logger.info(
		"[RETRY]",
		`Starting retry logic (max ${MAX_RETRIES} attempts) for memberId: ${memberId}`,
	);

	for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
		try {
			logger.info("[RETRY]", `Attempt ${attempt + 1}/${MAX_RETRIES}`);
			// Enable subdomain clearing on 404 for retries (especially on first attempt)
			const clearSubdomainOn404 =
				attempt === 0 || lastError?.message.includes("404");
			const result = await scrapeMovemberPage(memberId, clearSubdomainOn404);
			const totalDuration = Date.now() - retryStartTime;
			logger.info(
				"[RETRY]",
				`Success on attempt ${attempt + 1} after ${totalDuration}ms`,
			);
			return result;
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));
			const errorMessage = lastError.message;
			logger.error("[RETRY]", `Attempt ${attempt + 1} failed:`, errorMessage);

			// If we got a 404, clear the subdomain cache before retrying
			if (errorMessage.includes("404")) {
				logger.info(
					"[RETRY]",
					`404 detected, clearing subdomain cache for memberId: ${memberId}`,
				);
				clearSubdomainCache(memberId);
			}

			if (attempt < MAX_RETRIES - 1) {
				const delay =
					RETRY_DELAYS[attempt] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
				logger.info(
					"[RETRY]",
					`Waiting ${delay}ms before retry ${attempt + 2}...`,
				);
				await sleep(delay);
			} else {
				const totalDuration = Date.now() - retryStartTime;
				logger.error(
					"[RETRY]",
					`All ${MAX_RETRIES} attempts failed after ${totalDuration}ms`,
				);
			}
		}
	}

	throw lastError || new Error("Failed to scrape after all retries");
}

/**
 * Main function to get data (with stale-while-revalidate caching)
 * Implements stale-while-revalidate pattern: returns stale data immediately if available,
 * then fetches fresh data in the background and updates cache
 * @param memberId - The member ID to get data for
 * @param grabLive - Whether to force a fresh scrape (bypass cache)
 * @returns The data and cache status
 */
export async function getData(
	memberId: string,
	grabLive = false,
): Promise<GetDataResult> {
	let data: ScrapedData | null = null;
	let cacheStatus: GetDataResult["cacheStatus"] = "HIT";

	if (grabLive) {
		// Force fresh scrape, bypass cache
		logger.info(
			"[LIVE]",
			`grab-live parameter detected - forcing fresh scrape for memberId: ${memberId}`,
		);
		data = await scrapeWithRetry(memberId);
		cacheStatus = "LIVE";

		// Store in cache with 5-minute TTL
		logger.info(
			"[CACHE]",
			`Storing live data in cache with TTL: ${CACHE_TTL}ms for memberId: ${memberId}`,
		);
		setCachedData(memberId, data, CACHE_TTL);
		logger.info("[CACHE]", "Live data stored successfully");
	} else {
		// Check cache first (fresh data)
		logger.info("[CACHE]", `Checking cache for memberId: ${memberId}`);
		data = getCachedData(memberId);

		if (data) {
			const cacheAge = Date.now() - data.timestamp;
			logger.info(
				"[CACHE]",
				`Cache HIT - data age: ${Math.round(cacheAge / 1000)}s for memberId: ${memberId}`,
				{
					amount: data.amount,
					target: data.target,
					timestamp: new Date(data.timestamp).toISOString(),
				},
			);
		} else {
			// Check for stale data (stale-while-revalidate pattern)
			const staleData = getStaleCachedData(memberId);
			const isStale = isCachedDataStale(memberId);

			if (staleData && isStale) {
				// Return stale data immediately (stale-while-revalidate)
				logger.info(
					"[CACHE]",
					`Cache STALE - returning stale data immediately, fetching fresh data in background for memberId: ${memberId}`,
				);
				data = staleData;
				cacheStatus = "STALE";

				// Fetch fresh data in background (don't await)
				// This updates the cache for the next request
				scrapeWithRetry(memberId)
					.then((freshData) => {
						logger.info(
							"[CACHE]",
							`Background refresh completed for memberId: ${memberId}, updating cache`,
						);
						setCachedData(memberId, freshData, CACHE_TTL);
					})
					.catch((error) => {
						logger.error(
							"[CACHE]",
							`Background refresh failed for memberId: ${memberId}:`,
							error,
						);
					});
			} else {
				// No cache at all, need to scrape
				logger.info(
					"[CACHE]",
					`Cache MISS - need to scrape for memberId: ${memberId}`,
				);
				data = await scrapeWithRetry(memberId);
				cacheStatus = "MISS";

				// Store in cache with 5-minute TTL
				logger.info(
					"[CACHE]",
					`Storing data in cache with TTL: ${CACHE_TTL}ms for memberId: ${memberId}`,
				);
				setCachedData(memberId, data, CACHE_TTL);
				logger.info("[CACHE]", "Data stored successfully");
			}
		}
	}

	// Type guard: data should never be null at this point, but TypeScript can't guarantee it
	// This is a safety check in case of unexpected code paths
	if (!data) {
		throw new Error(
			`Unexpected null data for memberId: ${memberId}. This should never happen.`,
		);
	}

	return { data, cacheStatus };
}
