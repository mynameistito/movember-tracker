// Mapping of member IDs to their subdomains (manual overrides)
// Format: "memberId": "subdomain"
// Example: "15023456": "fr" means member 15023456 uses fr.movember.com
// Note: Subdomains are now auto-detected from redirects, but you can override here if needed
export const MEMBER_SUBDOMAIN_MAP = {
  // Add manual overrides here if needed
  // Example: "15023456": "fr",
  // Example: "14810348": "au",
};

export const DEFAULT_SUBDOMAIN = "au"; // Default subdomain to try first
export const MOVEMBER_BASE_URL_TEMPLATE = "https://{subdomain}.movember.com/donate/details";
export const DEFAULT_MEMBER_ID = "14810348"; // Default member ID if none provided
export const CACHE_TTL = 300000; // 5 minutes in milliseconds
export const SUBDOMAIN_CACHE_TTL = 86400000; // 24 hours in milliseconds (subdomain mappings don't change often)
export const MAX_RETRIES = 3;
export const RETRY_DELAYS = [1000, 2000, 4000]; // Exponential backoff in milliseconds

// Mapping of subdomain codes to currency codes
// Format: "subdomain": "CURRENCY_CODE"
export const SUBDOMAIN_CURRENCY_MAP = {
  "uk": "GBP",  // United Kingdom - British Pound
  "au": "AUD",  // Australia - Australian Dollar
  "us": "USD",  // United States - US Dollar
  "ca": "CAD",  // Canada - Canadian Dollar
  "nz": "NZD",  // New Zealand - New Zealand Dollar
  "ie": "EUR",  // Ireland - Euro
  "za": "ZAR",  // South Africa - South African Rand
  "nl": "EUR",  // Netherlands - Euro
  "de": "EUR",  // Germany - Euro
  "fr": "EUR",  // France - Euro
  "es": "EUR",  // Spain - Euro
  "it": "EUR",  // Italy - Euro
};

// Helper function to get currency code from subdomain
// Returns the currency code for the given subdomain, or defaults to AUD
export function getCurrencyFromSubdomain(subdomain) {
  if (!subdomain) {
    return "AUD"; // Default currency
  }
  return SUBDOMAIN_CURRENCY_MAP[subdomain.toLowerCase()] || "AUD";
}

// Mapping of currency codes to currency symbols
const CURRENCY_SYMBOL_MAP = {
  "USD": "$",  // US Dollar
  "AUD": "$",  // Australian Dollar
  "CAD": "$",  // Canadian Dollar
  "NZD": "$",  // New Zealand Dollar
  "GBP": "£",  // British Pound
  "EUR": "€",  // Euro
  "JPY": "¥",  // Japanese Yen
  "ZAR": "R",  // South African Rand
};

// Helper function to get currency symbol from currency code
// Returns the currency symbol for the given currency code, or defaults to "$"
export function getCurrencySymbol(currencyCode) {
  if (!currencyCode) {
    return "$"; // Default symbol
  }
  return CURRENCY_SYMBOL_MAP[currencyCode.toUpperCase()] || "$";
}

// Use the Worker's own proxy endpoint instead of external service
// This will be set dynamically based on the current origin
export function getProxyUrl() {
  // Use the current origin (the Worker's domain) for the proxy
  return `${window.location.origin}/proxy`;
}

