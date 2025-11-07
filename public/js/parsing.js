import { getCurrencyFromSubdomain } from "./constants.js";

/**
 * Extract amount from text and determine currency from subdomain
 * Currency is ALWAYS determined from subdomain, never from HTML/text parsing
 * @param {string} text - The text containing the amount (may include currency symbols)
 * @param {string} subdomain - Required subdomain (e.g., "uk", "au", "us") to determine currency
 * @returns {{value: string, currency: string}} Object containing the extracted amount value and currency code
 * @example
 * parseAmount("$1,234.56", "us") // { value: "1,234.56", currency: "USD" }
 * parseAmount("£500", "uk") // { value: "500", currency: "GBP" }
 */
export const parseAmount = (text, subdomain) => {
	// Remove whitespace and extract amount
	const cleaned = text.trim();

	// Always use subdomain to determine currency - this is the source of truth
	// If subdomain is not provided, default to AUD
	const currency = subdomain ? getCurrencyFromSubdomain(subdomain) : "AUD";

	// Extract amount (supports numbers with commas and optional decimals)
	// Remove currency symbols and codes before extracting number
	const cleanedForAmount = cleaned
		.replace(/[$€£¥]|\b(USD|EUR|GBP|AUD|JPY|CAD|NZD|ZAR)\b/gi, "")
		.trim();
	const amountMatch = cleanedForAmount.match(/[\d,]+\.?\d*/);
	const amount = amountMatch ? amountMatch[0] : "0";

	return { value: amount, currency };
};

/**
 * Validate that a captured value is a valid number
 * Checks for digits, removes currency symbols, and ensures the value is not just symbols
 * @param {string} value - The value to validate
 * @returns {boolean} True if the value is a valid number, false otherwise
 * @example
 * isValidNumber("1,234.56") // true
 * isValidNumber("$500") // true
 * isValidNumber("abc") // false
 * isValidNumber("$") // false
 */
export const isValidNumber = (value) => {
	if (!value || typeof value !== "string") {
		return false;
	}
	// Remove commas, spaces, and currency symbols, then check if we have at least one digit
	const cleaned = value.replace(/[,.\s$€£¥]/g, "");
	// Must have at least one digit and be a valid number
	if (!cleaned || cleaned.length === 0 || !/^\d+$/.test(cleaned)) {
		return false;
	}
	// Additional check: the original value should contain at least one digit
	if (!/\d/.test(value)) {
		return false;
	}
	// Reject if value is just commas, spaces, or currency symbols
	if (/^[,.\s$€£¥]+$/.test(value)) {
		return false;
	}
	return true;
};

/**
 * Calculate percentage of raised amount relative to target
 * @param {string} raised - The raised amount (may include commas)
 * @param {string} target - The target amount (may include commas)
 * @returns {number} The percentage (0-100), or 0 if target is 0
 * @example
 * calculatePercentage("2,500", "10,000") // 25
 * calculatePercentage("500", "1,000") // 50
 */
export const calculatePercentage = (raised, target) => {
	const raisedNum = parseFloat(raised.replace(/,/g, ""));
	const targetNum = parseFloat(target.replace(/,/g, ""));
	if (targetNum === 0) return 0;
	return Math.round((raisedNum / targetNum) * 100);
};
