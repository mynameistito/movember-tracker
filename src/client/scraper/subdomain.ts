/**
 * Subdomain detection logic for Movember pages
 * @module scraper/subdomain
 */

import { getCachedSubdomain, setCachedSubdomain } from "../cache.js";
import {
	DEFAULT_SUBDOMAIN,
	MEMBER_SUBDOMAIN_MAP,
	SUBDOMAIN_CACHE_TTL,
} from "../constants.js";
import { trackSubdomainError } from "../error-tracking.js";
import logger from "../logger.js";
import {
	COUNTRY_DETECTION_PATTERNS,
	CURRENCY_CODE_PATTERNS,
	DOLLAR_AMOUNT_PATTERN,
} from "../regex-patterns.js";
import {
	buildMovemberUrl,
	buildTeamUrl,
	extractSubdomainFromUrl,
	fetchViaProxy,
} from "./network.js";

/**
 * Detect subdomain from HTML content by checking currency symbols
 * This is used for verification - if currency doesn't match URL subdomain, we skip it
 * Made more aggressive: checks for currency symbols anywhere, not just near amounts
 * @param html - The HTML content to analyze
 * @returns The detected subdomain or null if not found
 */
export function detectSubdomainFromHtml(
	html: string | null | undefined,
): string | null {
	if (!html) return null;

	// First, check for unambiguous currency symbols anywhere in HTML (most reliable)
	// £ symbol anywhere indicates UK (GBP)
	if (
		html.includes("£") ||
		html.includes("&pound;") ||
		html.includes("&#163;")
	) {
		return "uk";
	}

	// € symbol anywhere indicates EU
	if (
		html.includes("€") ||
		html.includes("&euro;") ||
		html.includes("&#8364;")
	) {
		// Try to determine which EU country by checking for country-specific text
		if (html.match(COUNTRY_DETECTION_PATTERNS.IRELAND)) return "ie";
		if (html.match(COUNTRY_DETECTION_PATTERNS.NETHERLANDS)) return "nl";
		if (html.match(COUNTRY_DETECTION_PATTERNS.GERMANY)) return "de";
		if (html.match(COUNTRY_DETECTION_PATTERNS.FRANCE)) return "fr";
		if (html.match(COUNTRY_DETECTION_PATTERNS.SPAIN)) return "es";
		if (html.match(COUNTRY_DETECTION_PATTERNS.ITALY)) return "it";
		// Default to first EU country if we can't determine
		return "ie";
	}

	// Look for currency codes near amounts (secondary check)
	// Pattern: currency code followed by amount, or amount followed by currency code

	// Check for GBP code near amounts (UK) - secondary check after symbol check
	if (CURRENCY_CODE_PATTERNS[0].test(html)) {
		return "uk";
	}

	// Check for EUR/€ near amounts (EU countries)
	if (CURRENCY_CODE_PATTERNS[1].test(html)) {
		// Try to determine which EU country by checking for country-specific text
		if (html.match(COUNTRY_DETECTION_PATTERNS.IRELAND)) return "ie";
		if (html.match(COUNTRY_DETECTION_PATTERNS.NETHERLANDS)) return "nl";
		if (html.match(COUNTRY_DETECTION_PATTERNS.GERMANY)) return "de";
		if (html.match(COUNTRY_DETECTION_PATTERNS.FRANCE)) return "fr";
		if (html.match(COUNTRY_DETECTION_PATTERNS.SPAIN)) return "es";
		if (html.match(COUNTRY_DETECTION_PATTERNS.ITALY)) return "it";
		// Default to first EU country if we can't determine
		return "ie";
	}

	// Check for USD near amounts (US)
	if (CURRENCY_CODE_PATTERNS[2].test(html)) {
		return "us";
	}

	// Check for AUD near amounts (Australia) - check before generic $
	if (CURRENCY_CODE_PATTERNS[3].test(html)) {
		return "au";
	}

	// Check for CAD near amounts (Canada)
	if (CURRENCY_CODE_PATTERNS[4].test(html)) {
		return "ca";
	}

	// Check for NZD near amounts (New Zealand)
	if (CURRENCY_CODE_PATTERNS[5].test(html)) {
		return "nz";
	}

	// Check for ZAR near amounts (South Africa)
	if (CURRENCY_CODE_PATTERNS[6].test(html)) {
		return "za";
	}

	// Check for CZK/Kč near amounts (Czech Republic)
	if (CURRENCY_CODE_PATTERNS[7].test(html)) {
		return "cz";
	}

	// Check for SEK near amounts (Sweden)
	if (CURRENCY_CODE_PATTERNS[8].test(html)) {
		return "se";
	}

	// Check for DKK near amounts (Denmark)
	if (CURRENCY_CODE_PATTERNS[9].test(html)) {
		return "dk";
	}

	// Fallback: Check for $ near amounts (but this is ambiguous)
	// Only use if we see $ followed by digits, and prefer AUD as default
	if (DOLLAR_AMOUNT_PATTERN.test(html)) {
		// Try to find country indicators
		if (html.match(COUNTRY_DETECTION_PATTERNS.UNITED_STATES)) return "us";
		if (html.match(COUNTRY_DETECTION_PATTERNS.CANADA)) return "ca";
		if (html.match(COUNTRY_DETECTION_PATTERNS.NEW_ZEALAND)) return "nz";
		if (html.match(COUNTRY_DETECTION_PATTERNS.AUSTRALIA)) return "au";
		// Default to AUD if we can't determine (since au is default subdomain)
		return "au";
	}

	return null;
}

/**
 * Detect subdomain by following redirects and checking HTML content
 * @param memberId - The member ID
 * @param forceRefresh - Whether to force refresh (skip cache)
 * @returns The detected subdomain
 */
export async function detectSubdomainForMember(
	memberId: string,
	forceRefresh = false,
): Promise<string> {
	// Check cache first (unless forcing refresh)
	if (!forceRefresh) {
		const cached = getCachedSubdomain("member", memberId);
		if (cached) {
			logger.info(
				"[SUBDOMAIN]",
				`Found cached subdomain for memberId ${memberId}: ${cached}`,
			);
			return cached;
		}
	} else {
		logger.info(
			"[SUBDOMAIN]",
			`Force refresh requested, skipping cache for memberId ${memberId}`,
		);
	}

	// Check manual override
	if (MEMBER_SUBDOMAIN_MAP[memberId]) {
		const subdomain = MEMBER_SUBDOMAIN_MAP[memberId];
		logger.info(
			"[SUBDOMAIN]",
			`Using manual override for memberId ${memberId}: ${subdomain}`,
		);
		// Cache the manual override
		setCachedSubdomain("member", memberId, subdomain, SUBDOMAIN_CACHE_TTL);
		return subdomain;
	}

	// Try to detect by checking common subdomains and their HTML content
	logger.info("[SUBDOMAIN]", `Detecting subdomain for memberId ${memberId}...`);
	// Optimized: Prioritize most common subdomains first (based on usage statistics)
	// This reduces average detection time by testing high-probability subdomains first
	const commonSubdomains = [
		"au", // Most common (default)
		"uk", // Very common
		"us", // Very common
		"ca", // Common
		"nz", // Common
		"ie", // Common (EU)
		"za", // Less common
		"nl", // Less common (EU)
		"de", // Less common (EU)
		"fr", // Less common (EU)
		"es", // Less common (EU)
		"it", // Less common (EU)
		"cz", // Rare
		"dk", // Rare
		"se", // Rare
		"ex", // Rare (experimental)
	];

	try {
		// Try common subdomains and check for currency indicators
		// Primary method: Verify with HTML currency check (most reliable)
		// Secondary method: Use URL subdomain as fallback if currency check is inconclusive
		let fallbackSubdomain: string | null = null;

		// Optimized: Test subdomains with early exit when match is found
		// This reduces average detection time significantly
		for (const subdomain of commonSubdomains) {
			const testSubdomainUrl = buildMovemberUrl(memberId, subdomain);
			try {
				const { html: testHtml, finalUrl } =
					await fetchViaProxy(testSubdomainUrl);

				// Extract actual subdomain from final URL (after redirects)
				const actualSubdomain = extractSubdomainFromUrl(finalUrl);

				// Early exit optimization: If we get a redirect to a valid subdomain, use it immediately
				if (actualSubdomain && actualSubdomain !== subdomain) {
					// URL redirected to a different subdomain - use the actual one (most reliable)
					logger.info(
						"[SUBDOMAIN]",
						`URL redirected from ${subdomain} to ${actualSubdomain} for memberId ${memberId} (early exit)`,
					);
					setCachedSubdomain(
						"member",
						memberId,
						actualSubdomain,
						SUBDOMAIN_CACHE_TTL,
					);
					return actualSubdomain;
				}

				if (testHtml && testHtml.length > 1000) {
					// Check HTML for currency indicators
					const detectedSubdomain = detectSubdomainFromHtml(testHtml);

					// Priority 1: If HTML currency check confirms the subdomain, use it (early exit)
					if (
						detectedSubdomain === subdomain ||
						detectedSubdomain === actualSubdomain
					) {
						// HTML matches this subdomain's currency - this is correct
						const confirmedSubdomain = actualSubdomain || subdomain;
						logger.info(
							"[SUBDOMAIN]",
							`Found matching subdomain for memberId ${memberId}: ${confirmedSubdomain} (verified by currency, early exit)`,
						);
						setCachedSubdomain(
							"member",
							memberId,
							confirmedSubdomain,
							SUBDOMAIN_CACHE_TTL,
						);
						return confirmedSubdomain;
					} else if (
						detectedSubdomain &&
						detectedSubdomain !== subdomain &&
						detectedSubdomain !== actualSubdomain
					) {
						// HTML indicates a different subdomain - use the detected one (currency is reliable, early exit)
						logger.info(
							"[SUBDOMAIN]",
							`HTML currency indicates ${detectedSubdomain} (tested ${subdomain}, final URL: ${actualSubdomain || subdomain}), using detected subdomain (early exit)`,
						);
						setCachedSubdomain(
							"member",
							memberId,
							detectedSubdomain,
							SUBDOMAIN_CACHE_TTL,
						);
						return detectedSubdomain;
					} else {
						// Can't determine from currency, but HTML is valid
						// Use actual subdomain from final URL, or tested subdomain as fallback
						const fallbackSubdomainToUse = actualSubdomain || subdomain;
						if (!fallbackSubdomain) {
							fallbackSubdomain = fallbackSubdomainToUse;
							logger.info(
								"[SUBDOMAIN]",
								`Found valid HTML for subdomain ${fallbackSubdomainToUse} (currency check inconclusive, storing as fallback)`,
							);
						}
					}
				}
			} catch (e) {
				// Continue to next subdomain (optimized: don't log every error to reduce noise)
				const error = e instanceof Error ? e : new Error(String(e));
				if (error.message && !error.message.includes("404")) {
					logger.warn("[SUBDOMAIN]", `Error trying subdomain ${subdomain}:`, e);
				}
			}
		}

		// If we found a fallback subdomain (valid HTML but inconclusive currency), use it
		if (fallbackSubdomain) {
			logger.info(
				"[SUBDOMAIN]",
				`Using fallback subdomain for memberId ${memberId}: ${fallbackSubdomain} (no currency match found)`,
			);
			setCachedSubdomain(
				"member",
				memberId,
				fallbackSubdomain,
				SUBDOMAIN_CACHE_TTL,
			);
			return fallbackSubdomain;
		}

		// If we couldn't determine by currency, try default subdomain
		const testUrl = buildMovemberUrl(memberId, DEFAULT_SUBDOMAIN);
		try {
			const { html, finalUrl } = await fetchViaProxy(testUrl);
			if (html && html.length > 1000) {
				// Extract actual subdomain from final URL (after redirects)
				const actualSubdomain =
					extractSubdomainFromUrl(finalUrl) || DEFAULT_SUBDOMAIN;
				logger.info(
					"[SUBDOMAIN]",
					`Using default subdomain for memberId ${memberId}: ${actualSubdomain}`,
				);
				setCachedSubdomain(
					"member",
					memberId,
					actualSubdomain,
					SUBDOMAIN_CACHE_TTL,
				);
				return actualSubdomain;
			}
		} catch (e) {
			// Continue to fallback
			logger.warn("[SUBDOMAIN]", "Error trying default subdomain:", e);
		}

		// Fallback to default
		logger.warn(
			"[SUBDOMAIN]",
			`Could not find working subdomain for memberId ${memberId}, using default: ${DEFAULT_SUBDOMAIN}`,
		);
		setCachedSubdomain(
			"member",
			memberId,
			DEFAULT_SUBDOMAIN,
			SUBDOMAIN_CACHE_TTL,
		);
		return DEFAULT_SUBDOMAIN;
	} catch (error) {
		// Track error with structured context
		trackSubdomainError(
			error instanceof Error ? error : new Error(String(error)),
			{
				memberId,
				metadata: {
					timestamp: Date.now(),
				},
			},
		);

		logger.warn(
			"[SUBDOMAIN]",
			`Failed to detect subdomain for memberId ${memberId}, using default:`,
			error,
		);
		setCachedSubdomain(
			"member",
			memberId,
			DEFAULT_SUBDOMAIN,
			SUBDOMAIN_CACHE_TTL,
		);
		return DEFAULT_SUBDOMAIN;
	}
}

/**
 * Get subdomain for a member ID (with auto-detection)
 * @param memberId - The member ID
 * @returns The subdomain for the member
 */
export async function getSubdomainForMember(memberId: string): Promise<string> {
	// Check manual override first
	if (MEMBER_SUBDOMAIN_MAP[memberId]) {
		return MEMBER_SUBDOMAIN_MAP[memberId];
	}

	// Auto-detect (will check cache internally)
	return await detectSubdomainForMember(memberId);
}

/**
 * Detect subdomain by following redirects and checking HTML content for teams
 * @param teamId - The team ID
 * @param forceRefresh - Whether to force refresh (skip cache)
 * @returns The detected subdomain
 */
export async function detectSubdomainForTeam(
	teamId: string,
	forceRefresh = false,
): Promise<string> {
	// Check cache first (unless forcing refresh)
	if (!forceRefresh) {
		const cached = getCachedSubdomain("team", teamId);
		if (cached) {
			logger.info(
				"[SUBDOMAIN]",
				`Found cached subdomain for teamId ${teamId}: ${cached}`,
			);
			return cached;
		}
	} else {
		logger.info(
			"[SUBDOMAIN]",
			`Force refresh requested, skipping cache for teamId ${teamId}`,
		);
	}

	// Try to detect by checking common subdomains and their HTML content
	logger.info("[SUBDOMAIN]", `Detecting subdomain for teamId ${teamId}...`);
	const commonSubdomains = [
		"au", // Most common (default)
		"uk", // Very common
		"us", // Very common
		"ca", // Common
		"nz", // Common
		"ie", // Common (EU)
		"za", // Less common
		"nl", // Less common (EU)
		"de", // Less common (EU)
		"fr", // Less common (EU)
		"es", // Less common (EU)
		"it", // Less common (EU)
		"cz", // Rare
		"dk", // Rare
		"se", // Rare
		"ex", // Rare (experimental)
	];

	try {
		let fallbackSubdomain: string | null = null;

		for (const subdomain of commonSubdomains) {
			const testSubdomainUrl = buildTeamUrl(teamId, subdomain);
			try {
				const { html: testHtml, finalUrl } =
					await fetchViaProxy(testSubdomainUrl);

				// Extract actual subdomain from final URL (after redirects)
				const actualSubdomain = extractSubdomainFromUrl(finalUrl);

				// Early exit optimization: If we get a redirect to a valid subdomain, use it immediately
				if (actualSubdomain && actualSubdomain !== subdomain) {
					logger.info(
						"[SUBDOMAIN]",
						`URL redirected from ${subdomain} to ${actualSubdomain} for teamId ${teamId} (early exit)`,
					);
					setCachedSubdomain(
						"team",
						teamId,
						actualSubdomain,
						SUBDOMAIN_CACHE_TTL,
					);
					return actualSubdomain;
				}

				if (testHtml && testHtml.length > 1000) {
					// Check HTML for currency indicators
					const detectedSubdomain = detectSubdomainFromHtml(testHtml);

					// Priority 1: If HTML currency check confirms the subdomain, use it (early exit)
					if (
						detectedSubdomain === subdomain ||
						detectedSubdomain === actualSubdomain
					) {
						const confirmedSubdomain = actualSubdomain || subdomain;
						logger.info(
							"[SUBDOMAIN]",
							`Found matching subdomain for teamId ${teamId}: ${confirmedSubdomain} (verified by currency, early exit)`,
						);
						setCachedSubdomain(
							"team",
							teamId,
							confirmedSubdomain,
							SUBDOMAIN_CACHE_TTL,
						);
						return confirmedSubdomain;
					} else if (
						detectedSubdomain &&
						detectedSubdomain !== subdomain &&
						detectedSubdomain !== actualSubdomain
					) {
						logger.info(
							"[SUBDOMAIN]",
							`HTML currency indicates ${detectedSubdomain} (tested ${subdomain}, final URL: ${actualSubdomain || subdomain}), using detected subdomain (early exit)`,
						);
						setCachedSubdomain(
							"team",
							teamId,
							detectedSubdomain,
							SUBDOMAIN_CACHE_TTL,
						);
						return detectedSubdomain;
					} else {
						const fallbackSubdomainToUse = actualSubdomain || subdomain;
						if (!fallbackSubdomain) {
							fallbackSubdomain = fallbackSubdomainToUse;
							logger.info(
								"[SUBDOMAIN]",
								`Found valid HTML for subdomain ${fallbackSubdomainToUse} (currency check inconclusive, storing as fallback)`,
							);
						}
					}
				}
			} catch (e) {
				const error = e instanceof Error ? e : new Error(String(e));
				if (error.message && !error.message.includes("404")) {
					logger.warn("[SUBDOMAIN]", `Error trying subdomain ${subdomain}:`, e);
				}
			}
		}

		// If we found a fallback subdomain (valid HTML but inconclusive currency), use it
		if (fallbackSubdomain) {
			logger.info(
				"[SUBDOMAIN]",
				`Using fallback subdomain for teamId ${teamId}: ${fallbackSubdomain} (no currency match found)`,
			);
			setCachedSubdomain(
				"team",
				teamId,
				fallbackSubdomain,
				SUBDOMAIN_CACHE_TTL,
			);
			return fallbackSubdomain;
		}

		// If we couldn't determine by currency, try default subdomain
		const testUrl = buildTeamUrl(teamId, DEFAULT_SUBDOMAIN);
		try {
			const { html, finalUrl } = await fetchViaProxy(testUrl);
			if (html && html.length > 1000) {
				const actualSubdomain =
					extractSubdomainFromUrl(finalUrl) || DEFAULT_SUBDOMAIN;
				logger.info(
					"[SUBDOMAIN]",
					`Using default subdomain for teamId ${teamId}: ${actualSubdomain}`,
				);
				setCachedSubdomain(
					"team",
					teamId,
					actualSubdomain,
					SUBDOMAIN_CACHE_TTL,
				);
				return actualSubdomain;
			}
		} catch (e) {
			logger.warn("[SUBDOMAIN]", "Error trying default subdomain:", e);
		}

		// Fallback to default
		logger.warn(
			"[SUBDOMAIN]",
			`Could not find working subdomain for teamId ${teamId}, using default: ${DEFAULT_SUBDOMAIN}`,
		);
		setCachedSubdomain("team", teamId, DEFAULT_SUBDOMAIN, SUBDOMAIN_CACHE_TTL);
		return DEFAULT_SUBDOMAIN;
	} catch (error) {
		trackSubdomainError(
			error instanceof Error ? error : new Error(String(error)),
			{
				memberId: teamId,
				metadata: {
					timestamp: Date.now(),
				},
			},
		);

		logger.warn(
			"[SUBDOMAIN]",
			`Failed to detect subdomain for teamId ${teamId}, using default:`,
			error,
		);
		setCachedSubdomain("team", teamId, DEFAULT_SUBDOMAIN, SUBDOMAIN_CACHE_TTL);
		return DEFAULT_SUBDOMAIN;
	}
}

/**
 * Get subdomain for a team ID (with auto-detection)
 * @param teamId - The team ID
 * @returns The subdomain for the team
 */
export async function getSubdomainForTeam(teamId: string): Promise<string> {
	// Auto-detect (will check cache internally)
	return await detectSubdomainForTeam(teamId);
}
