import {
  MEMBER_SUBDOMAIN_MAP,
  DEFAULT_SUBDOMAIN,
  MOVEMBER_BASE_URL_TEMPLATE,
  CACHE_TTL,
  SUBDOMAIN_CACHE_TTL,
  MAX_RETRIES,
  RETRY_DELAYS,
  getProxyUrl,
  getCurrencySymbol,
} from './constants.js';
import { parseAmount, isValidNumber, calculatePercentage } from './parsing.js';
import { formatDuration, sleep } from './formatting.js';
import {
  getCachedData,
  setCachedData,
  getCachedSubdomain,
  setCachedSubdomain,
  clearSubdomainCache,
} from './cache.js';

// Helper function to extract subdomain from URL
function extractSubdomainFromUrl(url) {
  const match = url.match(/https?:\/\/([^.]+)\.movember\.com/);
  return match ? match[1] : null;
}

// Helper function to fetch HTML using Worker's CORS proxy
async function fetchViaProxy(url) {
  const proxyUrl = `${getProxyUrl()}?url=${encodeURIComponent(url)}`;
  const response = await fetch(proxyUrl);
  
  if (!response.ok) {
    // Try to get error message from response
    let errorMessage = `Proxy error! status: ${response.status}`;
    try {
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        const errorData = await response.json();
        if (errorData.message) {
          errorMessage = errorData.message;
        }
      } else {
        const errorText = await response.text();
        if (errorText) {
          errorMessage = errorText.substring(0, 200); // Limit error message length
        }
      }
    } catch (e) {
      // Ignore parse errors, use default error message
      console.warn(`[PROXY] Could not parse error response:`, e);
    }
    throw new Error(errorMessage);
  }
  
  // Worker proxy returns HTML directly
  const html = await response.text();
  return html;
}

// Helper function to detect subdomain from HTML content by checking currency symbols
// This is used only for verification - the URL subdomain is the primary source of truth
// Made more conservative: requires currency codes or symbols near amounts, not just anywhere
function detectSubdomainFromHtml(html) {
  if (!html) return null;
  
  // Look for currency codes near amounts (more reliable than just symbols anywhere)
  // Pattern: currency code followed by amount, or amount followed by currency code
  const currencyCodePatterns = [
    /\bGBP\b[\s:]*[\d,]+|[\d,]+[\s:]*\bGBP\b|£[\d,]+|British\s+Pound/i,
    /\bEUR\b[\s:]*[\d,]+|[\d,]+[\s:]*\bEUR\b|€[\d,]+|Euro[\s:]*[\d,]+/i,
    /\bUSD\b[\s:]*[\d,]+|[\d,]+[\s:]*\bUSD\b|US\s+Dollar/i,
    /\bAUD\b[\s:]*[\d,]+|[\d,]+[\s:]*\bAUD\b|Australian\s+Dollar/i,
    /\bCAD\b[\s:]*[\d,]+|[\d,]+[\s:]*\bCAD\b|Canadian\s+Dollar/i,
    /\bNZD\b[\s:]*[\d,]+|[\d,]+[\s:]*\bNZD\b|New\s+Zealand\s+Dollar/i,
    /\bZAR\b[\s:]*[\d,]+|[\d,]+[\s:]*\bZAR\b|South\s+African\s+Rand/i,
    /\bCZK\b[\s:]*[\d,]+|[\d,]+[\s:]*\bCZK\b|Czech\s+Koruna|Kč[\d,]+/i,
    /\bSEK\b[\s:]*[\d,]+|[\d,]+[\s:]*\bSEK\b|Swedish\s+Krona/i,
    /\bDKK\b[\s:]*[\d,]+|[\d,]+[\s:]*\bDKK\b|Danish\s+Krone/i,
  ];
  
  // Check for GBP/£ near amounts (UK)
  if (currencyCodePatterns[0].test(html)) {
    return 'uk';
  }
  
  // Check for EUR/€ near amounts (EU countries)
  if (currencyCodePatterns[1].test(html)) {
    // Try to determine which EU country by checking for country-specific text
    if (html.match(/Ireland|Irish/i)) return 'ie';
    if (html.match(/Netherlands|Dutch/i)) return 'nl';
    if (html.match(/Germany|German/i)) return 'de';
    if (html.match(/France|French/i)) return 'fr';
    if (html.match(/Spain|Spanish/i)) return 'es';
    if (html.match(/Italy|Italian/i)) return 'it';
    // Default to first EU country if we can't determine
    return 'ie';
  }
  
  // Check for USD near amounts (US)
  if (currencyCodePatterns[2].test(html)) {
    return 'us';
  }
  
  // Check for AUD near amounts (Australia) - check before generic $
  if (currencyCodePatterns[3].test(html)) {
    return 'au';
  }
  
  // Check for CAD near amounts (Canada)
  if (currencyCodePatterns[4].test(html)) {
    return 'ca';
  }
  
  // Check for NZD near amounts (New Zealand)
  if (currencyCodePatterns[5].test(html)) {
    return 'nz';
  }
  
  // Check for ZAR near amounts (South Africa)
  if (currencyCodePatterns[6].test(html)) {
    return 'za';
  }
  
  // Check for CZK/Kč near amounts (Czech Republic)
  if (currencyCodePatterns[7].test(html)) {
    return 'cz';
  }
  
  // Check for SEK near amounts (Sweden)
  if (currencyCodePatterns[8].test(html)) {
    return 'se';
  }
  
  // Check for DKK near amounts (Denmark)
  if (currencyCodePatterns[9].test(html)) {
    return 'dk';
  }
  
  // Fallback: Check for $ near amounts (but this is ambiguous)
  // Only use if we see $ followed by digits, and prefer AUD as default
  if (/\$[\d,]+/.test(html)) {
    // Try to find country indicators
    if (html.match(/United\s+States|US\s+Dollar/i)) return 'us';
    if (html.match(/Canada|Canadian/i)) return 'ca';
    if (html.match(/New\s+Zealand/i)) return 'nz';
    if (html.match(/Australia|Australian/i)) return 'au';
    // Default to AUD if we can't determine (since au is default subdomain)
    return 'au';
  }
  
  return null;
}

// Helper function to detect subdomain by following redirects
async function detectSubdomainForMember(memberId, forceRefresh = false) {
  // Check cache first (unless forcing refresh)
  if (!forceRefresh) {
    const cached = getCachedSubdomain(memberId);
    if (cached) {
      console.log(`[SUBDOMAIN] Found cached subdomain for memberId ${memberId}: ${cached}`);
      return cached;
    }
  } else {
    console.log(`[SUBDOMAIN] Force refresh requested, skipping cache for memberId ${memberId}`);
  }
  
  // Check manual override
  if (MEMBER_SUBDOMAIN_MAP[memberId]) {
    const subdomain = MEMBER_SUBDOMAIN_MAP[memberId];
    console.log(`[SUBDOMAIN] Using manual override for memberId ${memberId}: ${subdomain}`);
    // Cache the manual override
    setCachedSubdomain(memberId, subdomain, SUBDOMAIN_CACHE_TTL);
    return subdomain;
  }
  
  // Try to detect by checking common subdomains and their HTML content
  console.log(`[SUBDOMAIN] Detecting subdomain for memberId ${memberId}...`);
  // Reorder to try 'au' first since it's the default, then other common ones
  const commonSubdomains = ['au', 'uk', 'us', 'ca', 'nz', 'ie', 'za', 'nl', 'de', 'fr', 'es', 'it', 'ex', 'cz', 'dk', 'se'];
  
  try {
    // Try common subdomains and check for currency indicators
    // Primary method: Use the URL subdomain we're testing (most reliable)
    // Secondary method: Verify with HTML currency check
    for (const subdomain of commonSubdomains) {
      const testSubdomainUrl = MOVEMBER_BASE_URL_TEMPLATE.replace("{subdomain}", subdomain) + `?memberId=${memberId}`;
      try {
        const testHtml = await fetchViaProxy(testSubdomainUrl);
        if (testHtml && testHtml.length > 1000) {
          // Primary: Trust the URL subdomain we're testing
          // Secondary: Use HTML currency check only as verification (more conservative)
          const detectedSubdomain = detectSubdomainFromHtml(testHtml);
          
          // If HTML currency check confirms the subdomain, use it immediately
          if (detectedSubdomain === subdomain) {
            // HTML matches this subdomain's currency - this is correct
            console.log(`[SUBDOMAIN] Found matching subdomain for memberId ${memberId}: ${subdomain} (verified by currency)`);
            setCachedSubdomain(memberId, subdomain, SUBDOMAIN_CACHE_TTL);
            return subdomain;
          } else if (detectedSubdomain && detectedSubdomain !== subdomain) {
            // HTML indicates a different subdomain - skip this one (likely wrong URL)
            console.log(`[SUBDOMAIN] HTML currency indicates ${detectedSubdomain} but we tested ${subdomain}, skipping...`);
            continue;
          } else {
            // Can't determine from currency, but HTML is valid - trust the URL subdomain
            // This is the primary method: if the URL works, use that subdomain
            console.log(`[SUBDOMAIN] Found valid HTML for subdomain ${subdomain} (currency check inconclusive, trusting URL)`);
            setCachedSubdomain(memberId, subdomain, SUBDOMAIN_CACHE_TTL);
            return subdomain;
          }
        }
      } catch (e) {
        // Continue to next subdomain
        continue;
      }
    }
    
    // If we couldn't determine by currency, try default subdomain
    const testUrl = MOVEMBER_BASE_URL_TEMPLATE.replace("{subdomain}", DEFAULT_SUBDOMAIN) + `?memberId=${memberId}`;
    try {
      const html = await fetchViaProxy(testUrl);
      if (html && html.length > 1000) {
        console.log(`[SUBDOMAIN] Using default subdomain for memberId ${memberId}: ${DEFAULT_SUBDOMAIN}`);
        setCachedSubdomain(memberId, DEFAULT_SUBDOMAIN, SUBDOMAIN_CACHE_TTL);
        return DEFAULT_SUBDOMAIN;
      }
    } catch (e) {
      // Continue to fallback
    }
    
    // Fallback to default
    console.warn(`[SUBDOMAIN] Could not find working subdomain for memberId ${memberId}, using default: ${DEFAULT_SUBDOMAIN}`);
    setCachedSubdomain(memberId, DEFAULT_SUBDOMAIN, SUBDOMAIN_CACHE_TTL);
    return DEFAULT_SUBDOMAIN;
  } catch (error) {
    console.warn(`[SUBDOMAIN] Failed to detect subdomain for memberId ${memberId}, using default:`, error);
    setCachedSubdomain(memberId, DEFAULT_SUBDOMAIN, SUBDOMAIN_CACHE_TTL);
    return DEFAULT_SUBDOMAIN;
  }
}

// Helper function to get subdomain for a member ID (with auto-detection)
async function getSubdomainForMember(memberId) {
  // Check manual override first
  if (MEMBER_SUBDOMAIN_MAP[memberId]) {
    return MEMBER_SUBDOMAIN_MAP[memberId];
  }
  
  // Auto-detect (will check cache internally)
  return await detectSubdomainForMember(memberId);
}

// Helper function to build Movember URL with correct subdomain
async function buildMovemberUrl(memberId) {
  const subdomain = await getSubdomainForMember(memberId);
  const baseUrl = MOVEMBER_BASE_URL_TEMPLATE.replace("{subdomain}", subdomain);
  return `${baseUrl}?memberId=${memberId}`;
}

// Scrape the Movember page using Worker's CORS proxy and HTML parsing
export async function scrapeMovemberPage(memberId, clearSubdomainOn404 = false) {
  const movemberUrl = await buildMovemberUrl(memberId);
  let subdomain = await getSubdomainForMember(memberId);
  const startTime = Date.now();
  console.log(`[SCRAPE] Starting scrape of Movember page: ${movemberUrl} (subdomain: ${subdomain})`);
  
  try {
    // Fetch the HTML via Worker's CORS proxy
    console.log(`[SCRAPE] Fetching HTML from ${movemberUrl} via proxy...`);
    const fetchStart = Date.now();
    let html;
    
    try {
      html = await fetchViaProxy(movemberUrl);
    } catch (error) {
      // If we get an error, try clearing subdomain cache and re-detecting
      if (clearSubdomainOn404 && error.message.includes('404')) {
        console.warn(`[SCRAPE] Got 404 for ${movemberUrl}, clearing cached subdomain and re-detecting...`);
        clearSubdomainCache(memberId);
        // Re-detect subdomain with force refresh
        const newSubdomain = await detectSubdomainForMember(memberId, true);
        if (newSubdomain !== subdomain) {
          console.log(`[SCRAPE] Re-detected subdomain: ${newSubdomain} (was ${subdomain}), retrying with new subdomain...`);
          // Retry with new subdomain
          const newUrl = MOVEMBER_BASE_URL_TEMPLATE.replace("{subdomain}", newSubdomain) + `?memberId=${memberId}`;
          html = await fetchViaProxy(newUrl);
          subdomain = newSubdomain;
        } else {
          throw new Error(`HTTP error! status: 404 (page not found - member may not exist)`);
        }
      } else {
        throw error;
      }
    }
    
    const fetchDuration = Date.now() - fetchStart;
    console.log(`[SCRAPE] HTML fetched successfully in ${formatDuration(fetchDuration)} (${html.length} characters)`);

    // Verify subdomain by checking HTML content for currency indicators (optional verification only)
    // The URL subdomain is the primary source of truth - HTML check is just for validation
    const htmlDetectedSubdomain = detectSubdomainFromHtml(html);
    if (htmlDetectedSubdomain && htmlDetectedSubdomain !== subdomain) {
      console.warn(`[SCRAPE] HTML currency indicates subdomain ${htmlDetectedSubdomain} but URL subdomain is ${subdomain}. Trusting URL subdomain (primary source).`);
      // Don't override - trust the URL subdomain we're using
    } else if (htmlDetectedSubdomain === subdomain) {
      console.log(`[SCRAPE] HTML currency verification confirms subdomain ${subdomain}`);
    }

    // Extract data from HTML using regex
    console.log(`[SCRAPE] Extracting data from HTML...`);
    const extractStart = Date.now();
    
    let raised = "";
    let target = "";
    
    // Look for the raised amount in the HTML
    // Try multiple patterns to find the data
    const raisedPatterns = [
      // Pattern 1: Look for convertedAmount in AmountRaised object (most reliable)
      /"AmountRaised"[^}]*"convertedAmount"["\s:]*["']([\d,]+(?:\.\d+)?)/i,
      // Pattern 2: Look for originalAmount in AmountRaised object
      /"AmountRaised"[^}]*"originalAmount"["\s:]*["']([\d,]+(?:\.\d+)?)/i,
      // Pattern 3: Look for the CSS class with amount
      /donationProgress--amount__raised[^>]*>([^<]*\$([\d,]+(?:\.\d+)?)[^<]*)/i,
      // Pattern 4: Look for the class followed by text content
      /class="[^"]*donationProgress--amount__raised[^"]*"[^>]*>[\s\S]*?\$([\d,]+(?:\.\d+)?)/i,
      // Pattern 5: Look for data attributes or JSON with proper number format
      /"raised"[:\s]*["']?\$?([\d,]+(?:\.\d+)?)/i,
      // Pattern 6: Look for raisedAmount or similar
      /"raisedAmount"[:\s]*["']?\$?([\d,]+(?:\.\d+)?)/i,
      // Pattern 7: Look for currentAmount or similar
      /"currentAmount"[:\s]*["']?\$?([\d,]+(?:\.\d+)?)/i,
      // Pattern 8: Look for amount in data attributes
      /data-raised=["']?\$?([\d,]+(?:\.\d+)?)/i,
      // Pattern 9: Look for amount in data-amount attribute
      /data-amount=["']?\$?([\d,]+(?:\.\d+)?)/i,
      // Pattern 10: Support different currency formats (€, £, etc.)
      /donationProgress--amount__raised[^>]*>([^<]*[€£$]([\d,]+(?:\.\d+)?)[^<]*)/i,
      // Pattern 11: Look for currency codes (USD, EUR, GBP, etc.)
      /donationProgress--amount__raised[^>]*>([^<]*(?:USD|EUR|GBP|AUD)\s*([\d,]+(?:\.\d+)?)[^<]*)/i,
    ];
    
    for (let i = 0; i < raisedPatterns.length; i++) {
      const pattern = raisedPatterns[i];
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
        
        console.log(`[SCRAPE] Pattern ${i + 1} matched, all groups:`, match.slice(1), `using: "${captured}"`);
        
        // Validate that we captured a valid number
        if (isValidNumber(captured)) {
          raised = captured;
          console.log(`[SCRAPE] Found valid raised amount using pattern ${i + 1}: ${raised}`);
          break;
        } else {
          console.warn(`[SCRAPE] Pattern ${i + 1} matched but invalid number: "${captured}", trying next pattern...`);
        }
      }
    }
    
    // Look for the target amount in the HTML
    const targetPatterns = [
      // Pattern 1: Look for target.fundraising.value (most reliable)
      /"target"[^}]*"fundraising"[^}]*"value"["\s:]*["']([\d,]+(?:\.\d+)?)/i,
      // Pattern 2: Look for targetAmount in JSON
      /"targetAmount"[:\s]*["']?\$?([\d,]+(?:\.\d+)?)/i,
      // Pattern 3: Look for the CSS class with amount
      /donationProgress--amount__target[^>]*>([^<]*\$([\d,]+(?:\.\d+)?)[^<]*)/i,
      // Pattern 4: Look for the class followed by text content
      /class="[^"]*donationProgress--amount__target[^"]*"[^>]*>[\s\S]*?\$([\d,]+(?:\.\d+)?)/i,
      // Pattern 5: Look for data attributes or JSON with proper number format
      /"target"[:\s]*["']?\$?([\d,]+(?:\.\d+)?)/i,
      // Pattern 6: Look for goal or similar
      /"goal"[:\s]*["']?\$?([\d,]+(?:\.\d+)?)/i,
      // Pattern 7: Look for amount in data attributes
      /data-target=["']?\$?([\d,]+(?:\.\d+)?)/i,
      // Pattern 8: Look for amount in data-goal attribute
      /data-goal=["']?\$?([\d,]+(?:\.\d+)?)/i,
      // Pattern 9: Support different currency formats (€, £, etc.)
      /donationProgress--amount__target[^>]*>([^<]*[€£$]([\d,]+(?:\.\d+)?)[^<]*)/i,
      // Pattern 10: Look for currency codes (USD, EUR, GBP, etc.)
      /donationProgress--amount__target[^>]*>([^<]*(?:USD|EUR|GBP|AUD)\s*([\d,]+(?:\.\d+)?)[^<]*)/i,
    ];
    
    for (let i = 0; i < targetPatterns.length; i++) {
      const pattern = targetPatterns[i];
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
        
        console.log(`[SCRAPE] Target pattern ${i + 1} matched, all groups:`, match.slice(1), `using: "${captured}"`);
        
        // Validate that we captured a valid number
        if (isValidNumber(captured)) {
          target = captured;
          console.log(`[SCRAPE] Found valid target amount using pattern ${i + 1}: ${target}`);
          break;
        } else {
          console.warn(`[SCRAPE] Target pattern ${i + 1} matched but invalid number: "${captured}", trying next pattern...`);
        }
      }
    }
    
    // Fallback: Look for JSON data in script tags
    if (!raised || !target) {
      console.log(`[SCRAPE] Checking for JSON data in script tags...`);
      const scriptTagMatches = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi);
      if (scriptTagMatches) {
        for (const scriptTag of scriptTagMatches) {
          // Look for JSON data containing donation amounts with improved patterns
          const raisedJsonPatterns = [
            /"raised"[:\s]*["']?\$?([\d,]+(?:\.\d+)?)/i,
            /"raisedAmount"[:\s]*["']?\$?([\d,]+(?:\.\d+)?)/i,
            /"currentAmount"[:\s]*["']?\$?([\d,]+(?:\.\d+)?)/i,
            /"donationAmount"[:\s]*["']?\$?([\d,]+(?:\.\d+)?)/i,
            /"amount"[:\s]*["']?\$?([\d,]+(?:\.\d+)?)/i,
            /raised[:\s]*["']?\$?([\d,]+(?:\.\d+)?)/i,
          ];
          
          const targetJsonPatterns = [
            /"target"[:\s]*["']?\$?([\d,]+(?:\.\d+)?)/i,
            /"targetAmount"[:\s]*["']?\$?([\d,]+(?:\.\d+)?)/i,
            /"goal"[:\s]*["']?\$?([\d,]+(?:\.\d+)?)/i,
            /target[:\s]*["']?\$?([\d,]+(?:\.\d+)?)/i,
            /goal[:\s]*["']?\$?([\d,]+(?:\.\d+)?)/i,
          ];
          
          // Try to find raised amount in JSON
          if (!raised) {
            for (let i = 0; i < raisedJsonPatterns.length; i++) {
              const pattern = raisedJsonPatterns[i];
              const match = scriptTag.match(pattern);
              if (match) {
                const captured = match[1];
                if (isValidNumber(captured)) {
                  raised = captured;
                  console.log(`[SCRAPE] Found valid raised amount in JSON using pattern ${i + 1}: ${raised}`);
                  break;
                } else {
                  console.warn(`[SCRAPE] JSON raised pattern ${i + 1} matched but invalid number: "${captured}"`);
                }
              }
            }
          }
          
          // Try to find target amount in JSON
          if (!target) {
            for (let i = 0; i < targetJsonPatterns.length; i++) {
              const pattern = targetJsonPatterns[i];
              const match = scriptTag.match(pattern);
              if (match) {
                const captured = match[1];
                if (isValidNumber(captured)) {
                  target = captured;
                  console.log(`[SCRAPE] Found valid target amount in JSON using pattern ${i + 1}: ${target}`);
                  break;
                } else {
                  console.warn(`[SCRAPE] JSON target pattern ${i + 1} matched but invalid number: "${captured}"`);
                }
              }
            }
          }
        }
      }
    }
    
    // Last resort: Look for any dollar amounts in the HTML (more generic patterns)
    if (!raised) {
      console.log(`[SCRAPE] Trying generic dollar amount patterns as last resort...`);
      const genericPatterns = [
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
        /raised[:\s=]+[\$]?([\d,]+(?:\.\d+)?)/i,
        /amount[:\s=]+[\$]?([\d,]+(?:\.\d+)?)/i,
      ];
      
      for (let i = 0; i < genericPatterns.length; i++) {
        const pattern = genericPatterns[i];
        const match = html.match(pattern);
        if (match) {
          const captured = match[1];
          if (isValidNumber(captured)) {
            raised = captured;
            console.log(`[SCRAPE] Found valid raised amount using generic pattern ${i + 1}: ${raised}`);
            break;
          } else {
            console.warn(`[SCRAPE] Generic pattern ${i + 1} matched but invalid number: "${captured}"`);
          }
        }
      }
    }
    
    if (!target) {
      console.log(`[SCRAPE] Trying generic target amount patterns as last resort...`);
      const genericTargetPatterns = [
        // Look for $X,XXX pattern with target/goal keywords
        /\$([\d,]+(?:\.\d+)?)\s*(?:target|goal)/i,
        /(?:target|goal)[:\s]*\$([\d,]+(?:\.\d+)?)/i,
        // Look for "of $X,XXX" patterns
        /of\s+\$([\d,]+(?:\.\d+)?)/i,
        // Look for amounts in target-related elements
        /<[^>]+class="[^"]*(?:target|goal)[^"]*"[^>]*>\s*\$?([\d,]+(?:\.\d+)?)/i,
        // Look for target in data attributes
        /data-[^=]*(?:target|goal)[^=]*=["']?\$?([\d,]+(?:\.\d+)?)/i,
        // Look for target in JSON-like structures
        /target[:\s=]+[\$]?([\d,]+(?:\.\d+)?)/i,
        /goal[:\s=]+[\$]?([\d,]+(?:\.\d+)?)/i,
      ];
      
      for (let i = 0; i < genericTargetPatterns.length; i++) {
        const pattern = genericTargetPatterns[i];
        const match = html.match(pattern);
        if (match) {
          const captured = match[1];
          if (isValidNumber(captured)) {
            target = captured;
            console.log(`[SCRAPE] Found valid target amount using generic pattern ${i + 1}: ${target}`);
            break;
          } else {
            console.warn(`[SCRAPE] Generic target pattern ${i + 1} matched but invalid number: "${captured}"`);
          }
        }
      }
    }
    
    const extractDuration = Date.now() - extractStart;
    console.log(`[SCRAPE] Data extraction completed in ${formatDuration(extractDuration)}`);
    console.log(`[SCRAPE] Raw extracted data for memberId ${memberId} (subdomain: ${subdomain}):`, { 
      raised: raised || "NOT FOUND", 
      target: target || "NOT FOUND" 
    });

    // Final aggressive search: Find all dollar amounts and check their context
    if (!raised || !target) {
      console.log(`[SCRAPE] Performing aggressive context-based search...`);
      const allDollarMatches = [...html.matchAll(/\$([\d,]+(?:\.\d+)?)/g)];
      console.log(`[SCRAPE] Found ${allDollarMatches.length} dollar amounts in HTML`);
      
      if (allDollarMatches.length > 0) {
        // Score each dollar amount based on context
        const scoredAmounts = [];
        
        for (const match of allDollarMatches) {
          const amount = match[1];
          if (!isValidNumber(amount)) continue;
          
          const matchIndex = match.index;
          const contextStart = Math.max(0, matchIndex - 300);
          const contextEnd = Math.min(html.length, matchIndex + match[0].length + 300);
          const context = html.substring(contextStart, contextEnd).toLowerCase();
          
          let raisedScore = 0;
          let targetScore = 0;
          
          // Score for raised amounts
          if (/(?:raised|donated|collected|current|funds?|progress|amount\s*(?:raised|donated))/i.test(context)) {
            raisedScore += 10;
          }
          if (/(?:has\s+raised|has\s+donated|has\s+collected|currently\s+raised)/i.test(context)) {
            raisedScore += 5;
          }
          if (/\$[\d,]+(?:\.\d+)?\s*(?:raised|donated|collected)/i.test(context)) {
            raisedScore += 8;
          }
          
          // Score for target amounts
          if (/(?:target|goal|aim|objective|of\s+\$)/i.test(context)) {
            targetScore += 10;
          }
          if (/(?:target\s+(?:of|is)|goal\s+(?:of|is)|aim\s+(?:of|is))/i.test(context)) {
            targetScore += 5;
          }
          if (/\$[\d,]+(?:\.\d+)?\s*(?:target|goal)/i.test(context)) {
            targetScore += 8;
          }
          
          // Store with both scores
          if (raisedScore > 0 || targetScore > 0) {
            scoredAmounts.push({ 
              amount, 
              score: Math.max(raisedScore, targetScore), 
              raisedScore,
              targetScore,
              context: context.substring(0, 200) 
            });
          }
        }
        
        // Sort by score and pick the best candidates
        scoredAmounts.sort((a, b) => b.score - a.score);
        
        // Try to find raised amount
        if (!raised && scoredAmounts.length > 0) {
          // Look for amounts with raised-related context, sorted by raisedScore
          const raisedCandidates = scoredAmounts
            .filter(a => a.raisedScore > 0)
            .sort((a, b) => b.raisedScore - a.raisedScore);
          if (raisedCandidates.length > 0) {
            raised = raisedCandidates[0].amount;
            console.log(`[SCRAPE] Found raised amount via context search: ${raised} (raisedScore: ${raisedCandidates[0].raisedScore})`);
          }
        }
        
        // Try to find target amount
        if (!target && scoredAmounts.length > 0) {
          // Look for amounts with target-related context, sorted by targetScore
          const targetCandidates = scoredAmounts
            .filter(a => a.targetScore > 0)
            .sort((a, b) => b.targetScore - a.targetScore);
          if (targetCandidates.length > 0) {
            target = targetCandidates[0].amount;
            console.log(`[SCRAPE] Found target amount via context search: ${target} (targetScore: ${targetCandidates[0].targetScore})`);
          }
        }
      }
    }
    
    // Final validation check - ensure raised is actually valid before using
    if (!raised || !isValidNumber(raised)) {
      // Debug: Try to find any dollar amounts in the HTML to help diagnose
      const allDollarAmounts = html.match(/\$[\d,]+(?:\.\d+)?/g);
      console.warn(`[SCRAPE] Found ${allDollarAmounts ? allDollarAmounts.length : 0} dollar amounts in HTML:`, 
        allDollarAmounts ? allDollarAmounts.slice(0, 10) : []); // Show first 10
      
      // Try to find any numbers that might be amounts
      const potentialAmounts = html.match(/[\d,]{3,}(?:\.\d+)?/g);
      console.warn(`[SCRAPE] Found ${potentialAmounts ? potentialAmounts.length : 0} potential amount numbers in HTML (showing first 20):`, 
        potentialAmounts ? potentialAmounts.slice(0, 20) : []);
      
      const errorDetails = {
        memberId,
        subdomain,
        url: movemberUrl,
        message: "Could not find raised amount in HTML. The page may require JavaScript execution or the HTML structure may have changed.",
        htmlLength: html.length,
        dollarAmountsFound: allDollarAmounts ? allDollarAmounts.length : 0,
        raisedValue: raised || "empty"
      };
      console.error(`[SCRAPE] Failed to extract raised amount:`, errorDetails);
      throw new Error(`Could not find raised amount in HTML for memberId ${memberId} (subdomain: ${subdomain}). The page may require JavaScript execution or the HTML structure may have changed. Found ${allDollarAmounts ? allDollarAmounts.length : 0} dollar amounts in HTML.`);
    }

    // Double-check that raised is valid before parsing
    if (!isValidNumber(raised)) {
      throw new Error(`Invalid raised value captured: "${raised}" for memberId ${memberId}`);
    }

    // Parse amount with subdomain to determine correct currency
    const { value: raisedValue, currency } = parseAmount(`$${raised}`, subdomain);
    
    // Validate the parsed value is not empty or zero (unless it's actually zero)
    if (!raisedValue || raisedValue === "0" || raisedValue === "") {
      console.warn(`[SCRAPE] Parsed raised value is invalid: "${raisedValue}" from input: "${raised}"`);
    }
    
    // Format amount with appropriate currency symbol
    const currencySymbol = getCurrencySymbol(currency);
    const raisedFormatted = `${currencySymbol}${raisedValue}`;
    
    let result = {
      amount: raisedFormatted,
      currency,
      subdomain, // Include subdomain in result for consolidated cache
      timestamp: Date.now(),
    };

    if (target && isValidNumber(target)) {
      const { value: targetValue, currency: targetCurrency } = parseAmount(`$${target}`, subdomain);
      // Use the same currency symbol for consistency
      const targetFormatted = `${currencySymbol}${targetValue}`;
      result.target = targetFormatted;
      result.percentage = calculatePercentage(raisedValue, targetValue);
    } else if (target) {
      console.warn(`[SCRAPE] Target value "${target}" failed validation, skipping target`);
    }

    const totalDuration = Date.now() - startTime;
    console.log(`[SCRAPE] Scraping completed successfully in ${formatDuration(totalDuration)}:`, {
      amount: result.amount,
      target: result.target,
      percentage: result.percentage,
      currency: result.currency,
      subdomain: result.subdomain,
    });

    return result;
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[SCRAPE] Scraping failed after ${formatDuration(totalDuration)}:`, errorMessage, error);
    throw error;
  }
}

// Retry wrapper with exponential backoff
export async function scrapeWithRetry(memberId) {
  let lastError = null;
  const retryStartTime = Date.now();

  console.log(`[RETRY] Starting retry logic (max ${MAX_RETRIES} attempts) for memberId: ${memberId}`);

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      console.log(`[RETRY] Attempt ${attempt + 1}/${MAX_RETRIES}`);
      // Enable subdomain clearing on 404 for retries (especially on first attempt)
      const clearSubdomainOn404 = attempt === 0 || (lastError !== null && lastError.message.includes('404'));
      const result = await scrapeMovemberPage(memberId, clearSubdomainOn404);
      const totalDuration = Date.now() - retryStartTime;
      console.log(`[RETRY] Success on attempt ${attempt + 1} after ${totalDuration}ms`);
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const errorMessage = lastError.message;
      console.error(`[RETRY] Attempt ${attempt + 1} failed:`, errorMessage);
      
      // If we got a 404, clear the subdomain cache before retrying
      if (errorMessage.includes('404')) {
        console.log(`[RETRY] 404 detected, clearing subdomain cache for memberId: ${memberId}`);
        clearSubdomainCache(memberId);
      }
      
      if (attempt < MAX_RETRIES - 1) {
        const delay = RETRY_DELAYS[attempt] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
        console.log(`[RETRY] Waiting ${delay}ms before retry ${attempt + 2}...`);
        await sleep(delay);
      } else {
        const totalDuration = Date.now() - retryStartTime;
        console.error(`[RETRY] All ${MAX_RETRIES} attempts failed after ${totalDuration}ms`);
      }
    }
  }

  throw lastError || new Error("Failed to scrape after all retries");
}

// Main function to get data (with caching)
export async function getData(memberId, grabLive = false) {
  let data = null;
  let cacheStatus = "HIT";

  if (grabLive) {
    // Force fresh scrape, bypass cache
    console.log(`[LIVE] grab-live parameter detected - forcing fresh scrape for memberId: ${memberId}`);
    data = await scrapeWithRetry(memberId);
    cacheStatus = "LIVE";
    
    // Store in cache with 5-minute TTL
    console.log(`[CACHE] Storing live data in cache with TTL: ${CACHE_TTL}ms for memberId: ${memberId}`);
    setCachedData(memberId, data, CACHE_TTL);
    console.log(`[CACHE] Live data stored successfully`);
  } else {
    // Check cache first
    console.log(`[CACHE] Checking cache for memberId: ${memberId}`);
    data = getCachedData(memberId);

    if (data) {
      const cacheAge = Date.now() - data.timestamp;
      console.log(`[CACHE] Cache HIT - data age: ${Math.round(cacheAge / 1000)}s for memberId: ${memberId}`, {
        amount: data.amount,
        target: data.target,
        timestamp: new Date(data.timestamp).toISOString(),
      });
    } else {
      console.log(`[CACHE] Cache MISS - need to scrape for memberId: ${memberId}`);
    }

    // If cache miss, scrape the page
    if (!data) {
      data = await scrapeWithRetry(memberId);
      cacheStatus = "MISS";
      
      // Store in cache with 5-minute TTL
      console.log(`[CACHE] Storing data in cache with TTL: ${CACHE_TTL}ms for memberId: ${memberId}`);
      setCachedData(memberId, data, CACHE_TTL);
      console.log(`[CACHE] Data stored successfully`);
    }
  }

  return { data, cacheStatus };
}

