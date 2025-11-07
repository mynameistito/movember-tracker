/**
 * Network utilities for fetching Movember pages via proxy
 * @module scraper/network
 */

import { getProxyUrl, MOVEMBER_BASE_URL_TEMPLATE } from "../constants.js";
import { trackNetworkError } from "../error-tracking.js";
import logger from "../logger.js";
import { URL_PATTERNS } from "../regex-patterns.js";

export interface FetchResult {
	html: string;
	finalUrl: string;
}

/**
 * Extract subdomain from a Movember URL
 * @param url - The Movember URL
 * @returns The subdomain (e.g., "uk", "au", "us") or null if not found
 */
export function extractSubdomainFromUrl(url: string): string | null {
	const match = url.match(URL_PATTERNS.SUBDOMAIN);
	return match ? match[1] : null;
}

/**
 * Fetch HTML using Worker's CORS proxy
 * Returns both HTML and the final URL after redirects
 * @param url - The URL to fetch
 * @returns The HTML content and final URL
 * @throws If the proxy request fails
 */
export async function fetchViaProxy(url: string): Promise<FetchResult> {
	const proxyUrl = `${getProxyUrl()}?url=${encodeURIComponent(url)}`;
	const response = await fetch(proxyUrl);

	if (!response.ok) {
		// Try to get error message from response
		let errorMessage = `Proxy error! status: ${response.status}`;
		try {
			const contentType = response.headers.get("content-type");
			if (contentType?.includes("application/json")) {
				const errorData = (await response.json()) as { message?: string };
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

		const error = new Error(errorMessage);
		// Track network error with structured context
		trackNetworkError(error, {
			url,
			metadata: {
				status: response.status,
				statusText: response.statusText,
			},
		});

		throw error;
	}

	// Worker proxy returns HTML directly
	const html = await response.text();
	// Get final URL after redirects from response header
	const finalUrl = response.headers.get("X-Final-URL") || url;

	return { html, finalUrl };
}

/**
 * Build Movember URL with correct subdomain for a member
 * @param memberId - The member ID
 * @param subdomain - The subdomain to use
 * @returns The complete Movember URL
 */
export function buildMovemberUrl(memberId: string, subdomain: string): string {
	const baseUrl = MOVEMBER_BASE_URL_TEMPLATE.replace("{subdomain}", subdomain);
	return `${baseUrl}?memberId=${memberId}`;
}
