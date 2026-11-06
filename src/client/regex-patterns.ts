interface CountryPatterns {
  readonly [country: string]: RegExp;
}

/**
 * Centralized regex patterns for Movember page scraping
 * All patterns are pre-compiled for better performance
 */

// URL extraction patterns
export const URL_PATTERNS = {
  /**
   * Extract subdomain from Movember URL
   * Matches: https://uk.movember.com -> "uk"
   */
  SUBDOMAIN: /https?:\/\/(?<subdomain>[^.]+)\.movember\.com/u,
};

// Currency code patterns for subdomain detection
// Currency detection only needs bounded fundraiser-sized numeric tokens.
export const CURRENCY_CODE_PATTERNS: RegExp[] = [
  /\bGBP\b[\s:]*[\d,]{1,32}|[\d,]{1,32}[\s:]*\bGBP\b|British\s+Pound/iu,
  /\bEUR\b[\s:]*[\d,]{1,32}|[\d,]{1,32}[\s:]*\bEUR\b|Euro[\s:]*[\d,]{1,32}/iu,
  /\bUSD\b[\s:]*[\d,]{1,32}|[\d,]{1,32}[\s:]*\bUSD\b|US\s+Dollar/iu,
  /\bAUD\b[\s:]*[\d,]{1,32}|[\d,]{1,32}[\s:]*\bAUD\b|Australian\s+Dollar/iu,
  /\bCAD\b[\s:]*[\d,]{1,32}|[\d,]{1,32}[\s:]*\bCAD\b|Canadian\s+Dollar/iu,
  /\bNZD\b[\s:]*[\d,]{1,32}|[\d,]{1,32}[\s:]*\bNZD\b|New\s+Zealand\s+Dollar/iu,
  /\bZAR\b[\s:]*[\d,]{1,32}|[\d,]{1,32}[\s:]*\bZAR\b|South\s+African\s+Rand/iu,
  /\bCZK\b[\s:]*[\d,]{1,32}|[\d,]{1,32}[\s:]*\bCZK\b|Czech\s+Koruna|Kč[\d,]{1,32}/iu,
  /\bSEK\b[\s:]*[\d,]{1,32}|[\d,]{1,32}[\s:]*\bSEK\b|Swedish\s+Krona/iu,
  /\bDKK\b[\s:]*[\d,]{1,32}|[\d,]{1,32}[\s:]*\bDKK\b|Danish\s+Krone/iu,
];

// Country detection patterns
export const COUNTRY_DETECTION_PATTERNS: CountryPatterns = {
  IRELAND: /Ireland|Irish/iu,
  NETHERLANDS: /Netherlands|Dutch/iu,
  GERMANY: /Germany|German/iu,
  FRANCE: /France|French/iu,
  SPAIN: /Spain|Spanish/iu,
  ITALY: /Italy|Italian/iu,
  UNITED_STATES: /United\s+States|US\s+Dollar/iu,
  CANADA: /Canada|Canadian/iu,
  NEW_ZEALAND: /New\s+Zealand/iu,
  AUSTRALIA: /Australia|Australian/iu,
};

// Dollar amount pattern (ambiguous, used as fallback)
export const DOLLAR_AMOUNT_PATTERN = /\$[\d,]+/u;

// Raised amount extraction patterns (optimized with combined patterns)
// Patterns are grouped by similarity and combined using alternation for better performance
export const RAISED_PATTERNS: RegExp[] = [
  // Group 1: AmountRaised object patterns (most reliable) - combined
  /"AmountRaised"[^}]*"(?:convertedAmount|originalAmount)"["\s:]*["'](?<amount>[\d,]+(?:\.\d+)?)/iu,
  // Group 2: CSS class patterns with dollar sign - combined
  /donationProgress--amount__raised[^>]*>(?<context>[^<]*\$(?<amount>[\d,]+(?:\.\d+)?)[^<]*)/iu,
  // Group 3: CSS class with class attribute - separate (different structure)
  /class="[^"]*donationProgress--amount__raised[^"]*"[^>]*>[\s\S]*?\$(?<amount>[\d,]+(?:\.\d+)?)/iu,
  // Group 4: JSON property patterns - combined
  /"(?:raised|raisedAmount|currentAmount)"[:\s]*["']?\$?(?<amount>[\d,]+(?:\.\d+)?)/iu,
  // Group 5: Data attribute patterns - combined
  /data-(?:raised|amount)=["']?\$?(?<amount>[\d,]+(?:\.\d+)?)/iu,
  // Group 6: CSS class with currency symbols - separate (different capture groups)
  /donationProgress--amount__raised[^>]*>(?<context>[^<]*[€£$](?<amount>[\d,]+(?:\.\d+)?)[^<]*)/iu,
  // Group 7: CSS class with currency codes - separate (different capture groups)
  /donationProgress--amount__raised[^>]*>(?<context>[^<]*(?:USD|EUR|GBP|AUD)\s*(?<amount>[\d,]+(?:\.\d+)?)[^<]*)/iu,
];

// Target amount extraction patterns (optimized with combined patterns)
// Patterns are grouped by similarity and combined using alternation for better performance
export const TARGET_PATTERNS: RegExp[] = [
  // Group 1: target.fundraising.value (most reliable) - separate (most specific)
  /"target"[^}]*"fundraising"[^}]*"value"["\s:]*["'](?<amount>[\d,]+(?:\.\d+)?)/iu,
  // Group 2: CSS class patterns with dollar sign - combined
  /donationProgress--amount__target[^>]*>(?<context>[^<]*\$(?<amount>[\d,]+(?:\.\d+)?)[^<]*)/iu,
  // Group 3: CSS class with class attribute - separate (different structure)
  /class="[^"]*donationProgress--amount__target[^"]*"[^>]*>[\s\S]*?\$(?<amount>[\d,]+(?:\.\d+)?)/iu,
  // Group 4: JSON property patterns - combined
  /"(?:target|targetAmount|goal)"[:\s]*["']?\$?(?<amount>[\d,]+(?:\.\d+)?)/iu,
  // Group 5: Data attribute patterns - combined
  /data-(?:target|goal)=["']?\$?(?<amount>[\d,]+(?:\.\d+)?)/iu,
  // Group 6: CSS class with currency symbols - separate (different capture groups)
  /donationProgress--amount__target[^>]*>(?<context>[^<]*[€£$](?<amount>[\d,]+(?:\.\d+)?)[^<]*)/iu,
  // Group 7: CSS class with currency codes - separate (different capture groups)
  /donationProgress--amount__target[^>]*>(?<context>[^<]*(?:USD|EUR|GBP|AUD)\s*(?<amount>[\d,]+(?:\.\d+)?)[^<]*)/iu,
];

// JSON script tag patterns for raised amounts (optimized with combined patterns)
export const RAISED_JSON_PATTERNS: RegExp[] = [
  // Pattern 1: AmountRaised object with originalAmount or convertedAmount (most reliable)
  /"AmountRaised"[^}]*"(?:convertedAmount|originalAmount)"["\s:]*["'](?<amount>[\d,]+(?:\.\d+)?)/iu,
  // Pattern 2: Combined JSON property patterns
  /"(?:raised|raisedAmount|currentAmount|donationAmount|amount)"[:\s]*["']?\$?(?<amount>[\d,]+(?:\.\d+)?)/iu,
  // Pattern 3: Unquoted property pattern (separate due to different structure)
  /raised[:\s]*["']?\$?(?<amount>[\d,]+(?:\.\d+)?)/iu,
];

// JSON script tag patterns for target amounts (optimized with combined patterns)
export const TARGET_JSON_PATTERNS: RegExp[] = [
  // Pattern 1: target.fundraising.value (most reliable)
  /"target"[^}]*"fundraising"[^}]*"value"["\s:]*["'](?<amount>[\d,]+(?:\.\d+)?)/iu,
  // Pattern 2: Combined JSON property patterns
  /"(?:target|targetAmount|goal)"[:\s]*["']?\$?(?<amount>[\d,]+(?:\.\d+)?)/iu,
  // Pattern 3: Unquoted property patterns - combined
  /(?:target|goal)[:\s]*["']?\$?(?<amount>[\d,]+(?:\.\d+)?)/iu,
];

// Generic fallback patterns for raised amounts
export const GENERIC_RAISED_PATTERNS: RegExp[] = [
  // Look for $X,XXX pattern in common HTML structures
  /\$(?<amount>[\d,]+(?:\.\d+)?)\s*(?:raised|donated|collected)/iu,
  /(?:raised|donated|collected)[:\s]*\$(?<amount>[\d,]+(?:\.\d+)?)/iu,
  // Look for amounts in div/span elements
  /<[^<>]{1,200}class="[^"<>]{0,200}(?:amount|raised|donation|progress)[^"<>]{0,200}"[^>]*>\s*\$?(?<amount>[\d,]+(?:\.\d+)?)/iu,
  // Look for amounts in data attributes
  /data-[^\s=>]{0,80}amount[^\s=>]{0,80}=["']?\$?(?<amount>[\d,]+(?:\.\d+)?)/iu,
  // Look for amounts near "of" or "out of" (progress indicators)
  /\$(?<amount>[\d,]+(?:\.\d+)?)\s*(?:of|out of)/iu,
  // Look for amounts in JSON-like structures without quotes
  /raised[:\s=]+[$]?(?<amount>[\d,]+(?:\.\d+)?)/iu,
  /amount[:\s=]+[$]?(?<amount>[\d,]+(?:\.\d+)?)/iu,
];

// Generic fallback patterns for target amounts
export const GENERIC_TARGET_PATTERNS: RegExp[] = [
  // Look for $X,XXX pattern with target/goal keywords
  /\$(?<amount>[\d,]+(?:\.\d+)?)\s*(?:target|goal)/iu,
  /(?:target|goal)[:\s]*\$(?<amount>[\d,]+(?:\.\d+)?)/iu,
  // Look for amounts in div/span elements with target/goal classes
  /<[^<>]{1,200}class="[^"<>]{0,200}(?:target|goal)[^"<>]{0,200}"[^>]*>\s*\$?(?<amount>[\d,]+(?:\.\d+)?)/iu,
  // Look for amounts in data attributes
  /data-[^\s=>]{0,80}(?:target|goal)[^\s=>]{0,80}=["']?\$?(?<amount>[\d,]+(?:\.\d+)?)/iu,
  // Look for amounts near "of" or "out of" with target/goal context
  /\$(?<amount>[\d,]+(?:\.\d+)?)\s*(?:of|out of)\s*\$(?<target>[\d,]+(?:\.\d+)?)/iu,
  // Look for amounts in JSON-like structures without quotes
  /target[:\s=]+[$]?(?<amount>[\d,]+(?:\.\d+)?)/iu,
  /goal[:\s=]+[$]?(?<amount>[\d,]+(?:\.\d+)?)/iu,
];
