// Helper function to extract amount from text
export const parseAmount = (text: string): { value: string; currency: string } => {
  // Remove whitespace and extract currency symbol and amount
  const cleaned = text.trim();
  
  // Try to match currency codes first (USD, EUR, GBP, AUD, etc.)
  const currencyCodeMatch = cleaned.match(/\b(USD|EUR|GBP|AUD|JPY|CAD|NZD)\b/i);
  if (currencyCodeMatch) {
    const currency = currencyCodeMatch[1].toUpperCase();
    // Extract amount after currency code
    const amountMatch = cleaned.replace(currencyCodeMatch[0], '').match(/[\d,]+\.?\d*/);
    const amount = amountMatch ? amountMatch[0] : "0";
    return { value: amount, currency };
  }
  
  // Try to match currency symbols ($, €, £, ¥)
  const currencySymbolMatch = cleaned.match(/^([$€£¥])/);
  let currency = "AUD"; // Default
  if (currencySymbolMatch) {
    const symbol = currencySymbolMatch[1];
    if (symbol === "$") currency = "AUD";
    else if (symbol === "€") currency = "EUR";
    else if (symbol === "£") currency = "GBP";
    else if (symbol === "¥") currency = "JPY";
  }
  
  // Extract amount (supports numbers with commas and optional decimals)
  const amountMatch = cleaned.match(/[\d,]+\.?\d*/);
  const amount = amountMatch ? amountMatch[0] : "0";
  return { value: amount, currency };
};

// Helper function to validate that a captured value is a valid number
export const isValidNumber = (value: string): boolean => {
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
export const calculatePercentage = (raised: string, target: string): number => {
  const raisedNum = parseFloat(raised.replace(/,/g, ""));
  const targetNum = parseFloat(target.replace(/,/g, ""));
  if (targetNum === 0) return 0;
  return Math.round((raisedNum / targetNum) * 100);
};

