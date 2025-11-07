/**
 * Network utilities for fetching Movember pages via proxy
 * @module scraper/network
 */

import { getProxyUrl, MOVEMBER_BASE_URL_TEMPLATE } from "../constants.js";
import logger from "../logger.js";
import { URL_PATTERNS } from "../regex-patterns.js";

/**
 * Extract subdomain from a Movember URL
 * @param {string} url - The Movember URL
 * @returns {string|null} The subdomain (e.g., "uk", "au", "us") or null if not found
 */
export function extractSubdomainFromUrl(url) {
	const match = url.match(URL_PATTERNS.SUBDOMAIN);
	return match ? match[1] : null;
}

/**
 * Fetch HTML using Worker's CORS proxy
 * Returns both HTML and the final URL after redirects
 * @param {string} url - The URL to fetch
 * @returns {Promise<{html: string, finalUrl: string}>} The HTML content and final URL
 * @throws {Error} If the proxy request fails
 */
export async function fetchViaProxy(url) {
	const proxyUrl = `${getProxyUrl()}?url=${encodeURIComponent(url)}`;
	const response = await fetch(proxyUrl);

	if (!response.ok) {
		// Try to get error message from response
		let errorMessage = `Proxy error! status: ${response.status}`;
		try {
			const contentType = response.headers.get("content-type");
			if (contentType?.includes("application/json")) {
				const errorData = await response.json();
				if (errorData.message) {
					errorMessage = errorData.message;
				}
			} else {
				const errorText = await response.text();
				if (errorText) {
					errorMessage = errorText.substring(0, 200); // Limit error message length
				}
			}
		} catch (e) {
			// Ignore parse errors, use default error message
			logger.warn("[PROXY]", "Could not parse error response:", e);
		}
		throw new Error(errorMessage);
	}

	// Worker proxy returns HTML directly
	const html = await response.text();
	// Get final URL after redirects from response header
	const finalUrl = response.headers.get("X-Final-URL") || url;

	return { html, finalUrl };
}

/**
 * Build Movember URL with correct subdomain for a member
 * @param {string} memberId - The member ID
 * @param {string} subdomain - The subdomain to use
 * @returns {string} The complete Movember URL
 */
export function buildMovemberUrl(memberId, subdomain) {
	const baseUrl = MOVEMBER_BASE_URL_TEMPLATE.replace("{subdomain}", subdomain);
	return `${baseUrl}?memberId=${memberId}`;
}
