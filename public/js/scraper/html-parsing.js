/**
 * HTML parsing logic for extracting donation amounts from Movember pages
 * @module scraper/html-parsing
 */

import { formatDuration } from "../formatting.js";
import logger from "../logger.js";
import { isValidNumber } from "../parsing.js";
import {
	GENERIC_RAISED_PATTERNS,
	GENERIC_TARGET_PATTERNS,
	RAISED_JSON_PATTERNS,
	RAISED_PATTERNS,
	TARGET_JSON_PATTERNS,
	TARGET_PATTERNS,
} from "../regex-patterns.js";

/**
 * Extract raised amount from HTML using DOMParser (primary method)
 * Falls back to regex if DOMParser fails or doesn't find results
 * @param {string} html - The HTML content to parse
 * @returns {string} The extracted raised amount or empty string if not found
 */
function extractRaisedAmountWithDOMParser(html) {
	try {
		const parser = new DOMParser();
		const doc = parser.parseFromString(html, "text/html");

		// Try to find elements with donation-related classes
		const selectors = [
			".donationProgress--amount__raised",
			'[class*="donationProgress--amount__raised"]',
			'[class*="raised"]',
			"[data-raised]",
			"[data-amount]",
			"[data-raised-amount]",
		];

		for (const selector of selectors) {
			const elements = doc.querySelectorAll(selector);
			for (const element of elements) {
				const text = element.textContent || element.innerText || "";
				// Try to extract amount from text
				const amountMatch = text.match(/[\d,]+(?:\.\d+)?/);
				if (amountMatch && isValidNumber(amountMatch[0])) {
					logger.info(
						"[SCRAPE]",
						`Found raised amount using DOMParser with selector "${selector}": ${amountMatch[0]}`,
					);
					return amountMatch[0];
				}

				// Try data attributes
				const dataRaised =
					element.getAttribute("data-raised") ||
					element.getAttribute("data-amount") ||
					element.getAttribute("data-raised-amount");
				if (dataRaised && isValidNumber(dataRaised)) {
					logger.info(
						"[SCRAPE]",
						`Found raised amount using DOMParser data attribute: ${dataRaised}`,
					);
					return dataRaised;
				}
			}
		}

		// Try to find JSON data in script tags using DOMParser
		const scriptTags = doc.querySelectorAll("script");
		for (const script of scriptTags) {
			const scriptContent = script.textContent || script.innerHTML || "";
			for (let i = 0; i < RAISED_JSON_PATTERNS.length; i++) {
				const pattern = RAISED_JSON_PATTERNS[i];
				const match = scriptContent.match(pattern);
				if (match) {
					const captured = match[1];
					if (isValidNumber(captured)) {
						logger.info(
							"[SCRAPE]",
							`Found raised amount in JSON using DOMParser: ${captured}`,
						);
						return captured;
					}
				}
			}
		}
	} catch (error) {
		logger.warn(
			"[SCRAPE]",
			"DOMParser extraction failed, falling back to regex:",
			error,
		);
	}

	return "";
}

/**
 * Extract raised amount from HTML using multiple pattern strategies
 * Tries DOMParser first, then falls back to regex patterns
 * @param {string} html - The HTML content to parse
 * @returns {string} The extracted raised amount or empty string if not found
 */
export function extractRaisedAmount(html) {
	// Try DOMParser first (more reliable for structured HTML)
	let raised = extractRaisedAmountWithDOMParser(html);
	if (raised) {
		return raised;
	}

	logger.info(
		"[SCRAPE]",
		"DOMParser didn't find raised amount, trying regex patterns...",
	);
	raised = "";

	// Look for the raised amount in the HTML
	// Try multiple patterns to find the data
	for (let i = 0; i < RAISED_PATTERNS.length; i++) {
		const pattern = RAISED_PATTERNS[i];
		const match = html.match(pattern);
		if (match) {
			// Get the last capture group (the amount), but also check all groups
			let captured = match[match.length - 1];

			// If the last group is empty or invalid, try the second-to-last
			if (!captured || !isValidNumber(captured)) {
				if (match.length > 2) {
					captured = match[match.length - 2];
				}
			}

			logger.debug(
				"[SCRAPE]",
				`Pattern ${i + 1} matched, all groups:`,
				match.slice(1),
				`using: "${captured}"`,
			);

			// Validate that we captured a valid number
			if (isValidNumber(captured)) {
				raised = captured;
				logger.info(
					"[SCRAPE]",
					`Found valid raised amount using pattern ${i + 1}: ${raised}`,
				);
				break;
			} else {
				logger.warn(
					"[SCRAPE]",
					`Pattern ${i + 1} matched but invalid number: "${captured}", trying next pattern...`,
				);
			}
		}
	}

	// Fallback: Look for JSON data in script tags
	if (!raised) {
		logger.info("[SCRAPE]", "Checking for JSON data in script tags...");
		const scriptTagMatches = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi);
		if (scriptTagMatches) {
			for (const scriptTag of scriptTagMatches) {
				// Look for JSON data containing donation amounts with improved patterns
				// Try to find raised amount in JSON
				for (let i = 0; i < RAISED_JSON_PATTERNS.length; i++) {
					const pattern = RAISED_JSON_PATTERNS[i];
					const match = scriptTag.match(pattern);
					if (match) {
						const captured = match[1];
						if (isValidNumber(captured)) {
							raised = captured;
							logger.info(
								"[SCRAPE]",
								`Found valid raised amount in JSON using pattern ${i + 1}: ${raised}`,
							);
							break;
						} else {
							logger.warn(
								"[SCRAPE]",
								`JSON raised pattern ${i + 1} matched but invalid number: "${captured}"`,
							);
						}
					}
				}
				if (raised) break;
			}
		}
	}

	// Last resort: Look for any dollar amounts in the HTML (more generic patterns)
	if (!raised) {
		logger.info(
			"[SCRAPE]",
			"Trying generic dollar amount patterns as last resort...",
		);
		for (let i = 0; i < GENERIC_RAISED_PATTERNS.length; i++) {
			const pattern = GENERIC_RAISED_PATTERNS[i];
			const match = html.match(pattern);
			if (match) {
				const captured = match[1];
				if (isValidNumber(captured)) {
					raised = captured;
					logger.info(
						"[SCRAPE]",
						`Found valid raised amount using generic pattern ${i + 1}: ${raised}`,
					);
					break;
				} else {
					logger.warn(
						"[SCRAPE]",
						`Generic pattern ${i + 1} matched but invalid number: "${captured}"`,
					);
				}
			}
		}
	}

	// Final aggressive search: Find all dollar amounts and check their context
	if (!raised) {
		logger.info("[SCRAPE]", "Performing aggressive context-based search...");
		const allDollarMatches = [...html.matchAll(/\$([\d,]+(?:\.\d+)?)/g)];
		logger.debug(
			"[SCRAPE]",
			`Found ${allDollarMatches.length} dollar amounts in HTML`,
		);

		if (allDollarMatches.length > 0) {
			// Score each dollar amount based on context
			const scoredAmounts = [];

			for (const match of allDollarMatches) {
				const amount = match[1];
				if (!isValidNumber(amount)) continue;

				const matchIndex = match.index;
				const contextStart = Math.max(0, matchIndex - 300);
				const contextEnd = Math.min(
					html.length,
					matchIndex + match[0].length + 300,
				);
				const context = html.substring(contextStart, contextEnd).toLowerCase();

				let raisedScore = 0;

				// Score for raised amounts
				if (
					/(?:raised|donated|collected|current|funds?|progress|amount\s*(?:raised|donated))/i.test(
						context,
					)
				) {
					raisedScore += 10;
				}
				if (
					/(?:has\s+raised|has\s+donated|has\s+collected|currently\s+raised)/i.test(
						context,
					)
				) {
					raisedScore += 5;
				}
				if (
					/\$[\d,]+(?:\.\d+)?\s*(?:raised|donated|collected)/i.test(context)
				) {
					raisedScore += 8;
				}

				// Store with score
				if (raisedScore > 0) {
					scoredAmounts.push({
						amount,
						score: raisedScore,
						raisedScore,
						context: context.substring(0, 200),
					});
				}
			}

			// Sort by score and pick the best candidate
			scoredAmounts.sort((a, b) => b.raisedScore - a.raisedScore);

			// Try to find raised amount
			if (scoredAmounts.length > 0) {
				// Look for amounts with raised-related context, sorted by raisedScore
				const raisedCandidates = scoredAmounts
					.filter((a) => a.raisedScore > 0)
					.sort((a, b) => b.raisedScore - a.raisedScore);
				if (raisedCandidates.length > 0) {
					raised = raisedCandidates[0].amount;
					logger.info(
						"[SCRAPE]",
						`Found raised amount via context search: ${raised} (raisedScore: ${raisedCandidates[0].raisedScore})`,
					);
				}
			}
		}
	}

	return raised;
}

/**
 * Extract target amount from HTML using DOMParser (primary method)
 * Falls back to regex if DOMParser fails or doesn't find results
 * @param {string} html - The HTML content to parse
 * @returns {string} The extracted target amount or empty string if not found
 */
function extractTargetAmountWithDOMParser(html) {
	try {
		const parser = new DOMParser();
		const doc = parser.parseFromString(html, "text/html");

		// Try to find elements with target-related classes
		const selectors = [
			".donationProgress--amount__target",
			'[class*="donationProgress--amount__target"]',
			'[class*="target"]',
			'[class*="goal"]',
			"[data-target]",
			"[data-goal]",
			"[data-target-amount]",
		];

		for (const selector of selectors) {
			const elements = doc.querySelectorAll(selector);
			for (const element of elements) {
				const text = element.textContent || element.innerText || "";
				// Try to extract amount from text
				const amountMatch = text.match(/[\d,]+(?:\.\d+)?/);
				if (amountMatch && isValidNumber(amountMatch[0])) {
					logger.info(
						"[SCRAPE]",
						`Found target amount using DOMParser with selector "${selector}": ${amountMatch[0]}`,
					);
					return amountMatch[0];
				}

				// Try data attributes
				const dataTarget =
					element.getAttribute("data-target") ||
					element.getAttribute("data-goal") ||
					element.getAttribute("data-target-amount");
				if (dataTarget && isValidNumber(dataTarget)) {
					logger.info(
						"[SCRAPE]",
						`Found target amount using DOMParser data attribute: ${dataTarget}`,
					);
					return dataTarget;
				}
			}
		}

		// Try to find JSON data in script tags using DOMParser
		const scriptTags = doc.querySelectorAll("script");
		for (const script of scriptTags) {
			const scriptContent = script.textContent || script.innerHTML || "";
			for (let i = 0; i < TARGET_JSON_PATTERNS.length; i++) {
				const pattern = TARGET_JSON_PATTERNS[i];
				const match = scriptContent.match(pattern);
				if (match) {
					const captured = match[1];
					if (isValidNumber(captured)) {
						logger.info(
							"[SCRAPE]",
							`Found target amount in JSON using DOMParser: ${captured}`,
						);
						return captured;
					}
				}
			}
		}
	} catch (error) {
		logger.warn(
			"[SCRAPE]",
			"DOMParser extraction failed, falling back to regex:",
			error,
		);
	}

	return "";
}

/**
 * Extract target amount from HTML using multiple pattern strategies
 * Tries DOMParser first, then falls back to regex patterns
 * @param {string} html - The HTML content to parse
 * @returns {string} The extracted target amount or empty string if not found
 */
export function extractTargetAmount(html) {
	// Try DOMParser first (more reliable for structured HTML)
	let target = extractTargetAmountWithDOMParser(html);
	if (target) {
		return target;
	}

	logger.info(
		"[SCRAPE]",
		"DOMParser didn't find target amount, trying regex patterns...",
	);
	target = "";

	// Look for the target amount in the HTML
	for (let i = 0; i < TARGET_PATTERNS.length; i++) {
		const pattern = TARGET_PATTERNS[i];
		const match = html.match(pattern);
		if (match) {
			// Get the last capture group (the amount), but also check all groups
			let captured = match[match.length - 1];

			// If the last group is empty or invalid, try the second-to-last
			if (!captured || !isValidNumber(captured)) {
				if (match.length > 2) {
					captured = match[match.length - 2];
				}
			}

			logger.debug(
				"[SCRAPE]",
				`Target pattern ${i + 1} matched, all groups:`,
				match.slice(1),
				`using: "${captured}"`,
			);

			// Validate that we captured a valid number
			if (isValidNumber(captured)) {
				target = captured;
				logger.info(
					"[SCRAPE]",
					`Found valid target amount using pattern ${i + 1}: ${target}`,
				);
				break;
			} else {
				logger.warn(
					"[SCRAPE]",
					`Target pattern ${i + 1} matched but invalid number: "${captured}", trying next pattern...`,
				);
			}
		}
	}

	// Fallback: Look for JSON data in script tags
	if (!target) {
		const scriptTagMatches = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi);
		if (scriptTagMatches) {
			for (const scriptTag of scriptTagMatches) {
				// Try to find target amount in JSON
				for (let i = 0; i < TARGET_JSON_PATTERNS.length; i++) {
					const pattern = TARGET_JSON_PATTERNS[i];
					const match = scriptTag.match(pattern);
					if (match) {
						const captured = match[1];
						if (isValidNumber(captured)) {
							target = captured;
							logger.info(
								"[SCRAPE]",
								`Found valid target amount in JSON using pattern ${i + 1}: ${target}`,
							);
							break;
						} else {
							logger.warn(
								"[SCRAPE]",
								`JSON target pattern ${i + 1} matched but invalid number: "${captured}"`,
							);
						}
					}
				}
				if (target) break;
			}
		}
	}

	// Last resort: Look for any dollar amounts in the HTML (more generic patterns)
	if (!target) {
		logger.info(
			"[SCRAPE]",
			"Trying generic target amount patterns as last resort...",
		);
		for (let i = 0; i < GENERIC_TARGET_PATTERNS.length; i++) {
			const pattern = GENERIC_TARGET_PATTERNS[i];
			const match = html.match(pattern);
			if (match) {
				// Iterate backward from the last capture group to index 1
				// Pick the first non-empty capture that passes isValidNumber
				let captured = null;
				for (let j = match.length - 1; j >= 1; j--) {
					if (match[j] && isValidNumber(match[j])) {
						captured = match[j];
						break;
					}
				}

				if (captured) {
					target = captured;
					logger.info(
						"[SCRAPE]",
						`Found valid target amount using generic pattern ${i + 1}: ${target}`,
					);
					break;
				} else {
					logger.warn(
						"[SCRAPE]",
						`Generic target pattern ${i + 1} matched but no valid number found in capture groups`,
					);
				}
			}
		}
	}

	// Final aggressive search: Find all dollar amounts and check their context
	if (!target) {
		const allDollarMatches = [...html.matchAll(/\$([\d,]+(?:\.\d+)?)/g)];

		if (allDollarMatches.length > 0) {
			// Score each dollar amount based on context
			const scoredAmounts = [];

			for (const match of allDollarMatches) {
				const amount = match[1];
				if (!isValidNumber(amount)) continue;

				const matchIndex = match.index;
				const contextStart = Math.max(0, matchIndex - 300);
				const contextEnd = Math.min(
					html.length,
					matchIndex + match[0].length + 300,
				);
				const context = html.substring(contextStart, contextEnd).toLowerCase();

				let targetScore = 0;

				// Score for target amounts
				if (/(?:target|goal|aim|objective|of\s+\$)/i.test(context)) {
					targetScore += 10;
				}
				if (
					/(?:target\s+(?:of|is)|goal\s+(?:of|is)|aim\s+(?:of|is))/i.test(
						context,
					)
				) {
					targetScore += 5;
				}
				if (/\$[\d,]+(?:\.\d+)?\s*(?:target|goal)/i.test(context)) {
					targetScore += 8;
				}

				// Store with score
				if (targetScore > 0) {
					scoredAmounts.push({
						amount,
						score: targetScore,
						targetScore,
						context: context.substring(0, 200),
					});
				}
			}

			// Sort by score and pick the best candidate
			scoredAmounts.sort((a, b) => b.targetScore - a.targetScore);

			// Try to find target amount
			if (scoredAmounts.length > 0) {
				// Look for amounts with target-related context, sorted by targetScore
				const targetCandidates = scoredAmounts
					.filter((a) => a.targetScore > 0)
					.sort((a, b) => b.targetScore - a.targetScore);
				if (targetCandidates.length > 0) {
					target = targetCandidates[0].amount;
					logger.info(
						"[SCRAPE]",
						`Found target amount via context search: ${target} (targetScore: ${targetCandidates[0].targetScore})`,
					);
				}
			}
		}
	}

	return target;
}

/**
 * Extract both raised and target amounts from HTML
 * @param {string} html - The HTML content to parse
 * @param {string} memberId - The member ID (for logging)
 * @param {string} subdomain - The subdomain (for logging)
 * @returns {{raised: string, target: string}} Object containing extracted amounts
 */
export function extractAmounts(html, memberId, subdomain) {
	const extractStart = Date.now();
	logger.info("[SCRAPE]", "Extracting data from HTML...");

	const raised = extractRaisedAmount(html);
	const target = extractTargetAmount(html);

	const extractDuration = Date.now() - extractStart;
	logger.info(
		"[SCRAPE]",
		`Data extraction completed in ${formatDuration(extractDuration)}`,
	);
	logger.debug(
		"[SCRAPE]",
		`Raw extracted data for memberId ${memberId} (subdomain: ${subdomain}):`,
		{
			raised: raised || "NOT FOUND",
			target: target || "NOT FOUND",
		},
	);

	return { raised, target };
}
