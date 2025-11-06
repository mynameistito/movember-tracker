import { getCurrencyFromSubdomain } from './constants.js';

// Helper function to extract amount from text
// @param {string} text - The text containing the amount
// @param {string} [subdomain] - Optional subdomain (e.g., "uk", "au", "us") to determine currency
export const parseAmount = (text, subdomain = null) => {
  // Remove whitespace and extract currency symbol and amount
  const cleaned = text.trim();
  
  // Try to match currency codes first (USD, EUR, GBP, AUD, etc.) - highest priority
  const currencyCodeMatch = cleaned.match(/\b(USD|EUR|GBP|AUD|JPY|CAD|NZD|ZAR)\b/i);
  if (currencyCodeMatch) {
    const currency = currencyCodeMatch[1].toUpperCase();
    // Extract amount after currency code
    const amountMatch = cleaned.replace(currencyCodeMatch[0], '').match(/[\d,]+\.?\d*/);
    const amount = amountMatch ? amountMatch[0] : "0";
    return { value: amount, currency };
  }
  
  // If subdomain is provided, use it to determine currency (medium priority)
  let currency = null;
  if (subdomain) {
    currency = getCurrencyFromSubdomain(subdomain);
  }
  
  // Try to match currency symbols ($, €, £, ¥) - lower priority
  const currencySymbolMatch = cleaned.match(/^([$€£¥])/);
  if (currencySymbolMatch) {
    const symbol = currencySymbolMatch[1];
    // Use symbol-based currency if subdomain didn't provide one, or if symbol is unambiguous
    if (!currency) {
      if (symbol === "$") {
        // "$" is ambiguous - use subdomain if available, otherwise default to AUD
        currency = subdomain ? getCurrencyFromSubdomain(subdomain) : "AUD";
      } else if (symbol === "€") currency = "EUR";
      else if (symbol === "£") currency = "GBP";
      else if (symbol === "¥") currency = "JPY";
    } else if (symbol === "$") {
      // If we have subdomain-based currency and see "$", trust the subdomain
      // (e.g., US uses $ but subdomain tells us it's USD, not AUD)
      // Keep the subdomain-based currency
    } else {
      // For unambiguous symbols (€, £, ¥), they override subdomain
      if (symbol === "€") currency = "EUR";
      else if (symbol === "£") currency = "GBP";
      else if (symbol === "¥") currency = "JPY";
    }
  }
  
  // Default to AUD if no currency determined yet
  if (!currency) {
    currency = "AUD";
  }
  
  // Extract amount (supports numbers with commas and optional decimals)
  const amountMatch = cleaned.match(/[\d,]+\.?\d*/);
  const amount = amountMatch ? amountMatch[0] : "0";
  return { value: amount, currency };
};

// Helper function to validate that a captured value is a valid number
export const isValidNumber = (value) => {
  if (!value || typeof value !== 'string') {
    return false;
  }
  // Remove commas, spaces, and currency symbols, then check if we have at least one digit
  const cleaned = value.replace(/[,.\s$€£¥]/g, '');
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

