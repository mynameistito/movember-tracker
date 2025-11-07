import { getCurrencyFromSubdomain } from "./constants.js";

// Helper function to extract amount from text
// Currency is ALWAYS determined from subdomain, never from HTML/text parsing
// @param {string} text - The text containing the amount
// @param {string} subdomain - Required subdomain (e.g., "uk", "au", "us") to determine currency
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

// Helper function to validate that a captured value is a valid number
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

// Helper function to calculate percentage
export const calculatePercentage = (raised, target) => {
	const raisedNum = parseFloat(raised.replace(/,/g, ""));
	const targetNum = parseFloat(target.replace(/,/g, ""));
	if (targetNum === 0) return 0;
	return Math.round((raisedNum / targetNum) * 100);
};
