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
 * Extract raised amount from HTML using multiple pattern strategies
 * @param {string} html - The HTML content to parse
 * @returns {string} The extracted raised amount or empty string if not found
 */
export function extractRaisedAmount(html) {
	let raised = "";

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
 * Extract target amount from HTML using multiple pattern strategies
 * @param {string} html - The HTML content to parse
 * @returns {string} The extracted target amount or empty string if not found
 */
export function extractTargetAmount(html) {
	let target = "";

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
				const captured = match[1];
				if (isValidNumber(captured)) {
					target = captured;
					logger.info(
						"[SCRAPE]",
						`Found valid target amount using generic pattern ${i + 1}: ${target}`,
					);
					break;
				} else {
					logger.warn(
						"[SCRAPE]",
						`Generic target pattern ${i + 1} matched but invalid number: "${captured}"`,
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
