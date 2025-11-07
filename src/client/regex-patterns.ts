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
	SUBDOMAIN: /https?:\/\/([^.]+)\.movember\.com/,
};

// Currency code patterns for subdomain detection
export const CURRENCY_CODE_PATTERNS: RegExp[] = [
	/\bGBP\b[\s:]*[\d,]+|[\d,]+[\s:]*\bGBP\b|British\s+Pound/i,
	/\bEUR\b[\s:]*[\d,]+|[\d,]+[\s:]*\bEUR\b|Euro[\s:]*[\d,]+/i,
	/\bUSD\b[\s:]*[\d,]+|[\d,]+[\s:]*\bUSD\b|US\s+Dollar/i,
	/\bAUD\b[\s:]*[\d,]+|[\d,]+[\s:]*\bAUD\b|Australian\s+Dollar/i,
	/\bCAD\b[\s:]*[\d,]+|[\d,]+[\s:]*\bCAD\b|Canadian\s+Dollar/i,
	/\bNZD\b[\s:]*[\d,]+|[\d,]+[\s:]*\bNZD\b|New\s+Zealand\s+Dollar/i,
	/\bZAR\b[\s:]*[\d,]+|[\d,]+[\s:]*\bZAR\b|South\s+African\s+Rand/i,
	/\bCZK\b[\s:]*[\d,]+|[\d,]+[\s:]*\bCZK\b|Czech\s+Koruna|Kč[\d,]+/i,
	/\bSEK\b[\s:]*[\d,]+|[\d,]+[\s:]*\bSEK\b|Swedish\s+Krona/i,
	/\bDKK\b[\s:]*[\d,]+|[\d,]+[\s:]*\bDKK\b|Danish\s+Krone/i,
];

// Country detection patterns
export const COUNTRY_DETECTION_PATTERNS: Record<string, RegExp> = {
	IRELAND: /Ireland|Irish/i,
	NETHERLANDS: /Netherlands|Dutch/i,
	GERMANY: /Germany|German/i,
	FRANCE: /France|French/i,
	SPAIN: /Spain|Spanish/i,
	ITALY: /Italy|Italian/i,
	UNITED_STATES: /United\s+States|US\s+Dollar/i,
	CANADA: /Canada|Canadian/i,
	NEW_ZEALAND: /New\s+Zealand/i,
	AUSTRALIA: /Australia|Australian/i,
};

// Dollar amount pattern (ambiguous, used as fallback)
export const DOLLAR_AMOUNT_PATTERN = /\$[\d,]+/;

// Raised amount extraction patterns (optimized with combined patterns)
// Patterns are grouped by similarity and combined using alternation for better performance
export const RAISED_PATTERNS: RegExp[] = [
	// Group 1: AmountRaised object patterns (most reliable) - combined
	/"AmountRaised"[^}]*"(?:convertedAmount|originalAmount)"["\s:]*["']([\d,]+(?:\.\d+)?)/i,
	// Group 2: CSS class patterns with dollar sign - combined
	/donationProgress--amount__raised[^>]*>([^<]*\$([\d,]+(?:\.\d+)?)[^<]*)/i,
	// Group 3: CSS class with class attribute - separate (different structure)
	/class="[^"]*donationProgress--amount__raised[^"]*"[^>]*>[\s\S]*?\$([\d,]+(?:\.\d+)?)/i,
	// Group 4: JSON property patterns - combined
	/"(?:raised|raisedAmount|currentAmount)"[:\s]*["']?\$?([\d,]+(?:\.\d+)?)/i,
	// Group 5: Data attribute patterns - combined
	/data-(?:raised|amount)=["']?\$?([\d,]+(?:\.\d+)?)/i,
	// Group 6: CSS class with currency symbols - separate (different capture groups)
	/donationProgress--amount__raised[^>]*>([^<]*[€£$]([\d,]+(?:\.\d+)?)[^<]*)/i,
	// Group 7: CSS class with currency codes - separate (different capture groups)
	/donationProgress--amount__raised[^>]*>([^<]*(?:USD|EUR|GBP|AUD)\s*([\d,]+(?:\.\d+)?)[^<]*)/i,
];

// Target amount extraction patterns (optimized with combined patterns)
// Patterns are grouped by similarity and combined using alternation for better performance
export const TARGET_PATTERNS: RegExp[] = [
	// Group 1: target.fundraising.value (most reliable) - separate (most specific)
	/"target"[^}]*"fundraising"[^}]*"value"["\s:]*["']([\d,]+(?:\.\d+)?)/i,
	// Group 2: CSS class patterns with dollar sign - combined
	/donationProgress--amount__target[^>]*>([^<]*\$([\d,]+(?:\.\d+)?)[^<]*)/i,
	// Group 3: CSS class with class attribute - separate (different structure)
	/class="[^"]*donationProgress--amount__target[^"]*"[^>]*>[\s\S]*?\$([\d,]+(?:\.\d+)?)/i,
	// Group 4: JSON property patterns - combined
	/"(?:target|targetAmount|goal)"[:\s]*["']?\$?([\d,]+(?:\.\d+)?)/i,
	// Group 5: Data attribute patterns - combined
	/data-(?:target|goal)=["']?\$?([\d,]+(?:\.\d+)?)/i,
	// Group 6: CSS class with currency symbols - separate (different capture groups)
	/donationProgress--amount__target[^>]*>([^<]*[€£$]([\d,]+(?:\.\d+)?)[^<]*)/i,
	// Group 7: CSS class with currency codes - separate (different capture groups)
	/donationProgress--amount__target[^>]*>([^<]*(?:USD|EUR|GBP|AUD)\s*([\d,]+(?:\.\d+)?)[^<]*)/i,
];

// JSON script tag patterns for raised amounts (optimized with combined patterns)
export const RAISED_JSON_PATTERNS: RegExp[] = [
	// Pattern 1: AmountRaised object with originalAmount or convertedAmount (most reliable)
	/"AmountRaised"[^}]*"(?:convertedAmount|originalAmount)"["\s:]*["']([\d,]+(?:\.\d+)?)/i,
	// Pattern 2: Combined JSON property patterns
	/"(?:raised|raisedAmount|currentAmount|donationAmount|amount)"[:\s]*["']?\$?([\d,]+(?:\.\d+)?)/i,
	// Pattern 3: Unquoted property pattern (separate due to different structure)
	/raised[:\s]*["']?\$?([\d,]+(?:\.\d+)?)/i,
];

// JSON script tag patterns for target amounts (optimized with combined patterns)
export const TARGET_JSON_PATTERNS: RegExp[] = [
	// Pattern 1: target.fundraising.value (most reliable)
	/"target"[^}]*"fundraising"[^}]*"value"["\s:]*["']([\d,]+(?:\.\d+)?)/i,
	// Pattern 2: Combined JSON property patterns
	/"(?:target|targetAmount|goal)"[:\s]*["']?\$?([\d,]+(?:\.\d+)?)/i,
	// Pattern 3: Unquoted property patterns - combined
	/(?:target|goal)[:\s]*["']?\$?([\d,]+(?:\.\d+)?)/i,
];

// Generic fallback patterns for raised amounts
export const GENERIC_RAISED_PATTERNS: RegExp[] = [
	// Look for $X,XXX pattern in common HTML structures
	/\$([\d,]+(?:\.\d+)?)\s*(?:raised|donated|collected)/i,
	/(?:raised|donated|collected)[:\s]*\$([\d,]+(?:\.\d+)?)/i,
	// Look for amounts in div/span elements
	/<[^>]+class="[^"]*(?:amount|raised|donation|progress)[^"]*"[^>]*>\s*\$?([\d,]+(?:\.\d+)?)/i,
	// Look for amounts in data attributes
	/data-[^=]*amount[^=]*=["']?\$?([\d,]+(?:\.\d+)?)/i,
	// Look for amounts near "of" or "out of" (progress indicators)
	/\$([\d,]+(?:\.\d+)?)\s*(?:of|out of)/i,
	// Look for amounts in JSON-like structures without quotes
	/raised[:\s=]+[$]?([\d,]+(?:\.\d+)?)/i,
	/amount[:\s=]+[$]?([\d,]+(?:\.\d+)?)/i,
];

// Generic fallback patterns for target amounts
export const GENERIC_TARGET_PATTERNS: RegExp[] = [
	// Look for $X,XXX pattern with target/goal keywords
	/\$([\d,]+(?:\.\d+)?)\s*(?:target|goal)/i,
	/(?:target|goal)[:\s]*\$([\d,]+(?:\.\d+)?)/i,
	// Look for amounts in div/span elements with target/goal classes
	/<[^>]+class="[^"]*(?:target|goal)[^"]*"[^>]*>\s*\$?([\d,]+(?:\.\d+)?)/i,
	// Look for amounts in data attributes
	/data-[^=]*(?:target|goal)[^=]*=["']?\$?([\d,]+(?:\.\d+)?)/i,
	// Look for amounts near "of" or "out of" with target/goal context
	/\$([\d,]+(?:\.\d+)?)\s*(?:of|out of)\s*\$([\d,]+(?:\.\d+)?)/i,
	// Look for amounts in JSON-like structures without quotes
	/target[:\s=]+[$]?([\d,]+(?:\.\d+)?)/i,
	/goal[:\s=]+[$]?([\d,]+(?:\.\d+)?)/i,
];
