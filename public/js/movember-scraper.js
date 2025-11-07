/**
 * Main Movember scraper module
 * This file re-exports functions from the refactored modules for backward compatibility
 * @module movember-scraper
 */

// Re-export constants for convenience
export { DEFAULT_MEMBER_ID } from "./constants.js";
// Re-export from HTML parsing
export {
	extractAmounts,
	extractRaisedAmount,
	extractTargetAmount,
} from "./scraper/html-parsing.js";

// Re-export from network utilities
export {
	buildMovemberUrl,
	extractSubdomainFromUrl,
	fetchViaProxy,
} from "./scraper/network.js";
// Re-export from orchestrator (main entry point)
export {
	getData,
	scrapeMovemberPage,
	scrapeWithRetry,
} from "./scraper/orchestrator.js";
// Re-export from subdomain detection
export {
	detectSubdomainForMember,
	detectSubdomainFromHtml,
	getSubdomainForMember,
} from "./scraper/subdomain.js";
