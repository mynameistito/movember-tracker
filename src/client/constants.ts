interface CountryCurrencies {
  readonly [country: string]: string;
}

interface CurrencySymbols {
  readonly [currency: string]: string;
}

// Mapping of member IDs to their subdomains (manual overrides)
// Format: "memberId": "subdomain"
// Example: "15023456": "fr" means member 15023456 uses fr.movember.com
// Note: Subdomains are now auto-detected from redirects, but you can override here if needed
export const MEMBER_SUBDOMAIN_MAP: Record<string, string> = {
  // Add manual overrides here if needed
  // Example: "15023456": "fr",
  // Example: "14810348": "au",
};

export const DEFAULT_SUBDOMAIN = "au";

export const MOVEMBER_BASE_URL_TEMPLATE =
  "https://{subdomain}.movember.com/donate/details";

export const MOVEMBER_TEAM_URL_TEMPLATE =
  "https://{subdomain}.movember.com/team/{id}";

export const DEFAULT_MEMBER_ID = "14810348";
export const CACHE_TTL = 300_000;
export const SUBDOMAIN_CACHE_TTL = 86_400_000;
export const MAX_RETRIES = 3;
export const RETRY_DELAYS = [1000, 2000, 4000];

// Mapping of subdomain codes to currency codes
// Format: "subdomain": "CURRENCY_CODE"
export const SUBDOMAIN_CURRENCY_MAP: CountryCurrencies = {
  uk: "GBP",
  au: "AUD",
  us: "USD",
  ca: "CAD",
  nz: "NZD",
  ie: "EUR",
  za: "ZAR",
  nl: "EUR",
  de: "EUR",
  fr: "EUR",
  es: "EUR",
  it: "EUR",
  ex: "EUR",
  cz: "CZK",
  dk: "DKK",
  se: "SEK",
};

/**
 * Get currency code from subdomain
 * @param subdomain - The subdomain code (e.g., "uk", "au", "us")
 * @returns The currency code (e.g., "GBP", "AUD", "USD"), defaults to "AUD" if not found
 * @example
 * getCurrencyFromSubdomain("uk") // "GBP"
 * getCurrencyFromSubdomain("au") // "AUD"
 * getCurrencyFromSubdomain("us") // "USD"
 */
export const getCurrencyFromSubdomain = (
  subdomain: string | null | undefined
): string => {
  if (!(subdomain !== null && subdomain !== undefined && subdomain !== "")) {
    return "AUD";
  }

  return SUBDOMAIN_CURRENCY_MAP[subdomain.toLowerCase()] || "AUD";
};

// Mapping of currency codes to currency symbols
const CURRENCY_SYMBOL_MAP: CurrencySymbols = {
  USD: "$",
  AUD: "$",
  CAD: "$",
  NZD: "$",
  GBP: "£",
  EUR: "€",
  JPY: "¥",
  ZAR: "R",
  CZK: "Kč",
  DKK: "kr",
  SEK: "kr",
};

/**
 * Get currency symbol from currency code
 * @param currencyCode - The currency code (e.g., "USD", "GBP", "EUR")
 * @returns The currency symbol (e.g., "$", "£", "€"), defaults to "$" if not found
 * @example
 * getCurrencySymbol("USD") // "$"
 * getCurrencySymbol("GBP") // "£"
 * getCurrencySymbol("EUR") // "€"
 */
export const getCurrencySymbol = (
  currencyCode: string | null | undefined
): string => {
  if (
    !(
      currencyCode !== null &&
      currencyCode !== undefined &&
      currencyCode !== ""
    )
  ) {
    return "$";
  }

  return CURRENCY_SYMBOL_MAP[currencyCode.toUpperCase()] || "$";
};

/**
 * Get the Worker's proxy URL
 * Uses the current origin (the Worker's domain) for the proxy endpoint
 * @returns The proxy URL (e.g., "https://example.com/proxy")
 * @example
 * getProxyUrl() // "https://movember-tracker.example.com/proxy"
 */
export const getProxyUrl = (): string =>
  // Use the current origin (the Worker's domain) for the proxy
  `${window.location.origin}/proxy`;
