interface Env {
  CACHE: KVNamespace;
}

interface ScrapedData {
  amount: string;
  currency: string;
  target?: string;
  percentage?: number;
  timestamp: number;
}

// Mapping of member IDs to their subdomains (manual overrides)
// Format: "memberId": "subdomain"
// Example: "15023456": "fr" means member 15023456 uses fr.movember.com
// Note: Subdomains are now auto-detected from redirects, but you can override here if needed
const MEMBER_SUBDOMAIN_MAP: Record<string, string> = {
  // Add manual overrides here if needed
  // Example: "15023456": "fr",
  // Example: "14810348": "au",
};

const DEFAULT_SUBDOMAIN = "au"; // Default subdomain to try first
const MOVEMBER_BASE_URL_TEMPLATE = "https://{subdomain}.movember.com/donate/details";
const DEFAULT_MEMBER_ID = "14810348"; // Default member ID if none provided
const CACHE_TTL = 300; // 5 minutes in seconds
const SUBDOMAIN_CACHE_TTL = 86400; // 24 hours in seconds (subdomain mappings don't change often)
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000]; // Exponential backoff in milliseconds

// Helper function to extract subdomain from URL
function extractSubdomainFromUrl(url: string): string | null {
  const match = url.match(/https?:\/\/([^.]+)\.movember\.com/);
  return match ? match[1] : null;
}

// Helper function to detect subdomain by following redirects
async function detectSubdomainForMember(env: Env, memberId: string): Promise<string> {
  const cacheKey = `movember:subdomain:${memberId}`;
  
  // Check cache first
  const cached = await env.CACHE.get(cacheKey);
  if (cached) {
    console.log(`[SUBDOMAIN] Found cached subdomain for memberId ${memberId}: ${cached}`);
    return cached;
  }
  
  // Check manual override
  if (MEMBER_SUBDOMAIN_MAP[memberId]) {
    const subdomain = MEMBER_SUBDOMAIN_MAP[memberId];
    console.log(`[SUBDOMAIN] Using manual override for memberId ${memberId}: ${subdomain}`);
    // Cache the manual override
    await env.CACHE.put(cacheKey, subdomain, { expirationTtl: SUBDOMAIN_CACHE_TTL });
    return subdomain;
  }
  
  // Try to detect by following redirects
  console.log(`[SUBDOMAIN] Detecting subdomain for memberId ${memberId}...`);
  const testUrl = MOVEMBER_BASE_URL_TEMPLATE.replace("{subdomain}", DEFAULT_SUBDOMAIN) + `?memberId=${memberId}`;
  
  const fetchOptions = {
    redirect: 'follow' as RequestRedirect, // Follow redirects automatically
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  };
  
  try {
    // First try a HEAD request (lighter weight)
    let response = await fetch(testUrl, {
      ...fetchOptions,
      method: 'HEAD',
    });
    
    // Get the final URL after redirects
    let finalUrl = response.url;
    let detectedSubdomain = extractSubdomainFromUrl(finalUrl);
    
    // If HEAD didn't work or didn't redirect, try GET
    if (!detectedSubdomain || finalUrl === testUrl) {
      console.log(`[SUBDOMAIN] HEAD request didn't reveal redirect, trying GET...`);
      response = await fetch(testUrl, {
        ...fetchOptions,
        method: 'GET',
      });
      finalUrl = response.url;
      detectedSubdomain = extractSubdomainFromUrl(finalUrl);
    }
    
    if (detectedSubdomain && detectedSubdomain !== DEFAULT_SUBDOMAIN) {
      console.log(`[SUBDOMAIN] Detected subdomain for memberId ${memberId}: ${detectedSubdomain} (from ${finalUrl})`);
      // Cache the detected subdomain
      await env.CACHE.put(cacheKey, detectedSubdomain, { expirationTtl: SUBDOMAIN_CACHE_TTL });
      return detectedSubdomain;
    } else if (detectedSubdomain) {
      // Same subdomain, no redirect needed
      console.log(`[SUBDOMAIN] No redirect detected for memberId ${memberId}, using default: ${DEFAULT_SUBDOMAIN}`);
      await env.CACHE.put(cacheKey, DEFAULT_SUBDOMAIN, { expirationTtl: SUBDOMAIN_CACHE_TTL });
      return DEFAULT_SUBDOMAIN;
    }
  } catch (error) {
    console.warn(`[SUBDOMAIN] Failed to detect subdomain for memberId ${memberId}, using default:`, error);
  }
  
  // Fallback to default
  console.log(`[SUBDOMAIN] Using default subdomain for memberId ${memberId}: ${DEFAULT_SUBDOMAIN}`);
  await env.CACHE.put(cacheKey, DEFAULT_SUBDOMAIN, { expirationTtl: SUBDOMAIN_CACHE_TTL });
  return DEFAULT_SUBDOMAIN;
}

// Helper function to get subdomain for a member ID (with auto-detection)
async function getSubdomainForMember(env: Env, memberId: string): Promise<string> {
  // Check manual override first
  if (MEMBER_SUBDOMAIN_MAP[memberId]) {
    return MEMBER_SUBDOMAIN_MAP[memberId];
  }
  
  // Auto-detect (will check cache internally)
  return await detectSubdomainForMember(env, memberId);
}

// Helper function to build Movember URL with correct subdomain
async function buildMovemberUrl(env: Env, memberId: string): Promise<string> {
  const subdomain = await getSubdomainForMember(env, memberId);
  const baseUrl = MOVEMBER_BASE_URL_TEMPLATE.replace("{subdomain}", subdomain);
  return `${baseUrl}?memberId=${memberId}`;
}

// Helper function to sleep
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper function to extract amount from text
const parseAmount = (text: string): { value: string; currency: string } => {
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
const isValidNumber = (value: string): boolean => {
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
const calculatePercentage = (raised: string, target: string): number => {
  const raisedNum = parseFloat(raised.replace(/,/g, ""));
  const targetNum = parseFloat(target.replace(/,/g, ""));
  if (targetNum === 0) return 0;
  return Math.round((raisedNum / targetNum) * 100);
};

// Helper function to format duration in human-readable format
const formatDuration = (ms: number): string => {
  const seconds = Math.round(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s (${ms}ms)`;
  }
  return `${seconds}s (${ms}ms)`;
};

// Scrape the Movember page using fetch and HTML parsing
async function scrapeMovemberPage(env: Env, memberId: string): Promise<ScrapedData> {
  const movemberUrl = await buildMovemberUrl(env, memberId);
  const subdomain = await getSubdomainForMember(env, memberId);
  const startTime = Date.now();
  console.log(`[SCRAPE] Starting scrape of Movember page: ${movemberUrl} (subdomain: ${subdomain})`);
  
  try {
    // Fetch the HTML directly
    console.log(`[SCRAPE] Fetching HTML from ${movemberUrl}...`);
    const fetchStart = Date.now();
    const response = await fetch(movemberUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const html = await response.text();
    const fetchDuration = Date.now() - fetchStart;
    console.log(`[SCRAPE] HTML fetched successfully in ${formatDuration(fetchDuration)} (${html.length} characters)`);

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
        const scoredAmounts: Array<{ amount: string; score: number; raisedScore: number; targetScore: number; context: string }> = [];
        
        for (const match of allDollarMatches) {
          const amount = match[1];
          if (!isValidNumber(amount)) continue;
          
          const matchIndex = match.index!;
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

    const { value: raisedValue, currency } = parseAmount(`$${raised}`);
    
    // Validate the parsed value is not empty or zero (unless it's actually zero)
    if (!raisedValue || raisedValue === "0" || raisedValue === "") {
      console.warn(`[SCRAPE] Parsed raised value is invalid: "${raisedValue}" from input: "${raised}"`);
    }
    
    const raisedFormatted = `$${raisedValue}`;
    
    let result: ScrapedData = {
      amount: raisedFormatted,
      currency,
      timestamp: Date.now(),
    };

    if (target && isValidNumber(target)) {
      const { value: targetValue } = parseAmount(`$${target}`);
      const targetFormatted = `$${targetValue}`;
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
async function scrapeWithRetry(env: Env, memberId: string): Promise<ScrapedData> {
  let lastError: Error | null = null;
  const retryStartTime = Date.now();

  console.log(`[RETRY] Starting retry logic (max ${MAX_RETRIES} attempts) for memberId: ${memberId}`);

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      console.log(`[RETRY] Attempt ${attempt + 1}/${MAX_RETRIES}`);
      const result = await scrapeMovemberPage(env, memberId);
      const totalDuration = Date.now() - retryStartTime;
      console.log(`[RETRY] Success on attempt ${attempt + 1} after ${totalDuration}ms`);
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const errorMessage = lastError.message;
      console.error(`[RETRY] Attempt ${attempt + 1} failed:`, errorMessage);
      
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestStartTime = Date.now();
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method;

    console.log(`[REQUEST] ${method} ${pathname} from ${url.origin}`);

    try {
      // Get memberId from query parameters, use default if not provided
      const memberId = url.searchParams.get("memberId") || url.searchParams.get("memberid") || DEFAULT_MEMBER_ID;
      const grabLive = url.searchParams.has("grab-live");
      const cacheKey = `movember:amount:${memberId}`;
      let data: ScrapedData | null = null;
      let cacheStatus = "HIT";

      console.log(`[REQUEST] Processing request for memberId: ${memberId}`);

      if (grabLive) {
        // Force fresh scrape, bypass cache
        console.log(`[LIVE] grab-live parameter detected - forcing fresh scrape for memberId: ${memberId}`);
        data = await scrapeWithRetry(env, memberId);
        cacheStatus = "LIVE";
        
        // Store in cache with 5-minute TTL
        console.log(`[CACHE] Storing live data in cache with TTL: ${CACHE_TTL}s for memberId: ${memberId}`);
        await env.CACHE.put(cacheKey, JSON.stringify(data), {
          expirationTtl: CACHE_TTL,
        });
        console.log(`[CACHE] Live data stored successfully`);
      } else {
        // Check cache first
        console.log(`[CACHE] Checking cache for key: ${cacheKey}`);
        let cached = await env.CACHE.get(cacheKey, { type: "json" });
        data = cached as ScrapedData | null;

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
          data = await scrapeWithRetry(env, memberId);
          cacheStatus = "MISS";
          
          // Store in cache with 5-minute TTL
          console.log(`[CACHE] Storing data in cache with TTL: ${CACHE_TTL}s for memberId: ${memberId}`);
          await env.CACHE.put(cacheKey, JSON.stringify(data), {
            expirationTtl: CACHE_TTL,
          });
          console.log(`[CACHE] Data stored successfully`);
        }
      }

      // Route handling
      if (pathname === "/json") {
        const duration = Date.now() - requestStartTime;
        console.log(`[RESPONSE] JSON response sent in ${duration}ms`, {
          cache: cacheStatus,
          amount: data.amount,
        });
        // Return JSON response
        return new Response(JSON.stringify(data, null, 2), {
          headers: {
            "content-type": "application/json",
            "x-cache": cacheStatus,
          },
        });
      } else if (pathname === "/overlay") {
        // Return HTML with horizontal progress bar overlay
        const percentage = data.percentage || 0;
        const amount = data.amount || "$0";
        const target = data.target || "$0";
        const currentMemberId = memberId; // Store memberId for use in template
        
        const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Movember Donation Progress</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      background: transparent;
      color: #fff;
      padding: 20px;
    }
    .container {
      width: 100%;
      max-width: 1200px;
    }
    .progress-container {
      display: flex;
      flex-direction: column;
      gap: 15px;
      width: 100%;
    }
    .amounts-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      width: 100%;
    }
    .amount-label {
      font-size: 48px;
      font-weight: 700;
      letter-spacing: -0.02em;
      white-space: nowrap;
      transition: opacity 0.3s ease;
    }
    .amount-label.updating {
      opacity: 0.7;
    }
    .target-label {
      font-size: 24px;
      font-weight: 500;
      letter-spacing: -0.01em;
      white-space: nowrap;
      color: #aaa;
      transition: opacity 0.3s ease;
    }
    .target-label.updating {
      opacity: 0.7;
    }
    .target-label .target-prefix {
      font-size: 20px;
      font-weight: 400;
      margin-right: 8px;
    }
    .progress-bar-wrapper {
      width: 100%;
      height: 60px;
      background: transparent;
      border-radius: 30px;
      position: relative;
      overflow: hidden;
      border: 2px solid rgba(255, 255, 255, 0.2);
    }
    .progress-bar-fill {
      height: 100%;
      width: ${Math.min(percentage, 100)}%;
      background: linear-gradient(90deg, #4CAF50 0%, #45a049 100%);
      border-radius: 30px;
      transition: width 0.5s ease;
    }
    @media (max-width: 768px) {
      .amounts-row {
        flex-direction: column;
        gap: 10px;
        align-items: flex-start;
      }
      .amount-label {
        font-size: 36px;
      }
      .target-label {
        font-size: 20px;
      }
      .target-label .target-prefix {
        font-size: 18px;
      }
      .progress-bar-wrapper {
        width: 100%;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="progress-container">
      <div class="amounts-row">
        <div class="amount-label" id="amount">${amount}</div>
        <div class="target-label" id="target"><span class="target-prefix">Target:</span>${target}</div>
      </div>
      <div class="progress-bar-wrapper">
        <div class="progress-bar-fill" id="progressBar"></div>
      </div>
    </div>
  </div>
  <script>
    const amountElement = document.getElementById('amount');
    const targetElement = document.getElementById('target');
    const progressBar = document.getElementById('progressBar');
    let currentData = {
      amount: '${amount}',
      target: '${target}',
      percentage: ${percentage}
    };
    
    // Get memberId from URL query parameters
    const urlParams = new URLSearchParams(window.location.search);
    const memberId = urlParams.get('memberId') || urlParams.get('memberid') || '${currentMemberId}';
    
    async function updateData() {
      try {
        const jsonUrl = '/json' + (memberId ? '?memberId=' + encodeURIComponent(memberId) : '');
        const response = await fetch(jsonUrl);
        const data = await response.json();
        
        if (data.amount && (data.amount !== currentData.amount || data.target !== currentData.target)) {
          amountElement.classList.add('updating');
          targetElement.classList.add('updating');
          
          setTimeout(() => {
            amountElement.textContent = data.amount || '$0';
            targetElement.innerHTML = '<span class="target-prefix">Target:</span>' + (data.target || '$0');
            const percentage = data.percentage || 0;
            progressBar.style.width = Math.min(percentage, 100) + '%';
            currentData = {
              amount: data.amount || '$0',
              target: data.target || '$0',
              percentage: percentage
            };
            amountElement.classList.remove('updating');
            targetElement.classList.remove('updating');
          }, 150);
        }
      } catch (error) {
        console.error('Failed to update data:', error);
      }
    }
    
    // Update every 30 seconds (cache is 5 minutes, but we check more frequently)
    setInterval(updateData, 30000);
    
    // Also update immediately on page load after a short delay
    setTimeout(updateData, 1000);
  </script>
</body>
</html>`;

        const duration = Date.now() - requestStartTime;
        console.log(`[RESPONSE] Overlay HTML response sent in ${duration}ms`, {
          cache: cacheStatus,
          amount: data.amount,
        });
        
        return new Response(html, {
          headers: {
            "content-type": "text/html; charset=UTF-8",
            "x-cache": cacheStatus,
          },
        });
      } else if (pathname === "/") {
        // Return documentation page
        const baseUrl = url.origin;
        
        const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Movember Donation Tracker API</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: #e0e0e0;
      line-height: 1.6;
      padding: 0;
      min-height: 100vh;
    }
    .container {
      max-width: 900px;
      margin: 0 auto;
      padding: 60px 20px;
    }
    header {
      text-align: center;
      margin-bottom: 60px;
    }
    h1 {
      font-size: 48px;
      font-weight: 700;
      color: #fff;
      margin-bottom: 16px;
      letter-spacing: -0.02em;
    }
    .subtitle {
      font-size: 20px;
      color: #b0b0b0;
      font-weight: 400;
      margin-bottom: 8px;
    }
    .description {
      font-size: 16px;
      color: #999;
      max-width: 600px;
      margin: 0 auto 40px;
    }
    section {
      background: rgba(255, 255, 255, 0.05);
      border-radius: 12px;
      padding: 32px;
      margin-bottom: 32px;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    h2 {
      font-size: 28px;
      font-weight: 600;
      color: #fff;
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    h2::before {
      content: '';
      width: 4px;
      height: 28px;
      background: linear-gradient(180deg, #4CAF50 0%, #45a049 100%);
      border-radius: 2px;
    }
    h3 {
      font-size: 20px;
      font-weight: 600;
      color: #fff;
      margin-top: 24px;
      margin-bottom: 12px;
    }
    p {
      color: #ccc;
      margin-bottom: 16px;
      font-size: 16px;
    }
    .code-block {
      background: #0a0a0f;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      padding: 20px;
      margin: 16px 0;
      overflow-x: auto;
      font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
      font-size: 14px;
      line-height: 1.5;
    }
    .code-block code {
      color: #4CAF50;
    }
    .url-example {
      background: #0a0a0f;
      border-left: 3px solid #4CAF50;
      padding: 12px 16px;
      margin: 12px 0;
      border-radius: 4px;
      font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
      font-size: 14px;
      color: #fff;
      word-break: break-all;
    }
    .url-example .method {
      color: #4CAF50;
      font-weight: 600;
      margin-right: 8px;
    }
    ul {
      list-style: none;
      padding-left: 0;
    }
    li {
      color: #ccc;
      margin-bottom: 12px;
      padding-left: 24px;
      position: relative;
    }
    li::before {
      content: '→';
      position: absolute;
      left: 0;
      color: #4CAF50;
      font-weight: bold;
    }
    .json-example {
      background: #0a0a0f;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      padding: 20px;
      margin: 16px 0;
      overflow-x: auto;
      font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
      font-size: 14px;
      line-height: 1.5;
      color: #e0e0e0;
    }
    .json-key {
      color: #9cdcfe;
    }
    .json-string {
      color: #ce9178;
    }
    .json-number {
      color: #b5cea8;
    }
    .badge {
      display: inline-block;
      background: rgba(76, 175, 80, 0.2);
      color: #4CAF50;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      margin-left: 8px;
    }
    .note {
      background: rgba(255, 193, 7, 0.1);
      border-left: 3px solid #ffc107;
      padding: 12px 16px;
      margin: 16px 0;
      border-radius: 4px;
      color: #ffc107;
      font-size: 14px;
    }
    @media (max-width: 768px) {
      h1 {
        font-size: 36px;
      }
      .subtitle {
        font-size: 18px;
      }
      section {
        padding: 24px;
      }
      .container {
        padding: 40px 16px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Movember Donation Tracker</h1>
      <p class="subtitle">API Documentation</p>
      <p class="description">
        Automatically track Movember donation progress. This service fetches and caches donation data from Movember pages, 
        providing it in a format perfect for stream overlays, websites, or other applications.
      </p>
    </header>

    <section>
      <h2>What This Does</h2>
      <p>
        This Cloudflare Worker automatically checks Movember donation pages every 5 minutes and stores the current donation amount. 
        You can access this information through simple web links that return data in an easy-to-use format.
      </p>
      <p>
        The service handles multiple Movember members, automatically detects the correct subdomain (au.movember.com, fr.movember.com, etc.), 
        and caches results for fast, efficient access.
      </p>
    </section>

    <section>
      <h2>JSON API Endpoint</h2>
      <p>Get donation data in JSON format:</p>
      <div class="url-example">
        <span class="method">GET</span>${baseUrl}/json
      </div>
      
      <h3>Response Format</h3>
      <div class="json-example">
{<br>
&nbsp;&nbsp;<span class="json-key">"amount"</span>: <span class="json-string">"$2,500"</span>,<br>
&nbsp;&nbsp;<span class="json-key">"currency"</span>: <span class="json-string">"AUD"</span>,<br>
&nbsp;&nbsp;<span class="json-key">"target"</span>: <span class="json-string">"$10,000"</span>,<br>
&nbsp;&nbsp;<span class="json-key">"percentage"</span>: <span class="json-number">25</span>,<br>
&nbsp;&nbsp;<span class="json-key">"timestamp"</span>: <span class="json-number">1704067200000</span><br>
}
      </div>
    </section>

    <section>
      <h2>Overlay Endpoint</h2>
      <p>Get a visual progress bar overlay perfect for streaming or embedding:</p>
      <div class="url-example">
        <span class="method">GET</span>${baseUrl}/overlay
      </div>
      <p>
        The overlay displays the current donation amount, target, and a visual progress bar. 
        It automatically updates every 30 seconds and has a transparent background, making it perfect for OBS browser sources or stream overlays.
      </p>
      
      <h3>Examples</h3>
      <div class="url-example">
        <span class="method">GET</span>${baseUrl}/overlay?memberId=12345678
      </div>
      <div class="url-example">
        <span class="method">GET</span>${baseUrl}/overlay?memberid=12345678
      </div>
      
      <div class="note">
        <strong>Tip:</strong> Use this URL in OBS Browser Source or any streaming software that supports web overlays. 
        The overlay will automatically refresh to show the latest donation progress.
      </div>
    </section>

    <section>
      <h2>Using the memberId Parameter</h2>
      <p>
        Track any Movember member by adding the <code>memberId</code> query parameter to your URLs. 
        Each member ID has its own cache, so different members' data won't interfere with each other.
      </p>
      
      <h3>Examples</h3>
      <div class="url-example">
        <span class="method">GET</span>${baseUrl}/json?memberId=12345678
      </div>
      <div class="url-example">
        <span class="method">GET</span>${baseUrl}/json?memberid=12345678
      </div>
      
      <div class="note">
        <strong>Note:</strong> Both <code>memberId</code> and <code>memberid</code> are accepted (case-insensitive).
      </div>

      <h3>Finding Your Movember Member ID</h3>
      <ul>
        <li>Go to your Movember donation page (e.g., <code>https://au.movember.com/donate/details?memberId=YOUR_ID</code>)</li>
        <li>The number after <code>memberId=</code> in the URL is your member ID</li>
        <li>Use that ID in the query parameter when accessing the API</li>
      </ul>
    </section>

    <section>
      <h2>How It Works</h2>
      <ul>
        <li>The Worker fetches Movember page HTML directly using <code>fetch()</code></li>
        <li>Parses the HTML using regex patterns to extract donation amounts</li>
        <li>Results are cached for 5 minutes to avoid excessive requests</li>
        <li>Automatically detects the correct Movember subdomain by following redirects</li>
        <li>Subdomain mappings are cached for 24 hours for optimal performance</li>
      </ul>
    </section>

    <section>
      <h2>Additional Parameters</h2>
      
      <h3>Force Fresh Data <span class="badge">OPTIONAL</span></h3>
      <p>Bypass the cache and get live data by adding <code>grab-live=true</code>:</p>
      <div class="url-example">
        <span class="method">GET</span>${baseUrl}/json?memberId=12345678&grab-live=true
      </div>
      <div class="note">
        <strong>Note:</strong> Use this sparingly. The cache is updated every 5 minutes automatically.
      </div>
    </section>

    <section>
      <h2>Quick Start Examples</h2>
      
      <h3>JSON API - Default Member</h3>
      <div class="url-example">
        <span class="method">GET</span>${baseUrl}/json
      </div>
      
      <h3>JSON API - Specific Member</h3>
      <div class="url-example">
        <span class="method">GET</span>${baseUrl}/json?memberId=14810348
      </div>
      
      <h3>Overlay - Default Member</h3>
      <div class="url-example">
        <span class="method">GET</span>${baseUrl}/overlay
      </div>
      
      <h3>Overlay - Specific Member</h3>
      <div class="url-example">
        <span class="method">GET</span>${baseUrl}/overlay?memberId=14810348
      </div>
      
      <h3>Force Live Data for Specific Member</h3>
      <div class="url-example">
        <span class="method">GET</span>${baseUrl}/json?memberId=14810348&grab-live=true
      </div>
    </section>
  </div>
</body>
</html>`;

        const duration = Date.now() - requestStartTime;
        console.log(`[RESPONSE] HTML response sent in ${duration}ms`, {
          cache: cacheStatus,
          amount: data.amount,
        });
        
        return new Response(html, {
          headers: {
            "content-type": "text/html; charset=UTF-8",
            "x-cache": cacheStatus,
          },
        });
      } else {
        // 404 for other paths
        const duration = Date.now() - requestStartTime;
        console.warn(`[RESPONSE] 404 Not Found for path: ${pathname} (${duration}ms)`);
        
        return new Response("Not Found", {
          status: 404,
          headers: {
            "content-type": "text/plain",
          },
        });
      }
    } catch (error) {
      const duration = Date.now() - requestStartTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      console.error(`[ERROR] Request failed after ${duration}ms:`, {
        pathname,
        error: errorMessage,
        stack: errorStack,
      });
      
      // Return error in appropriate format based on route
      if (pathname === "/json") {
        return new Response(
          JSON.stringify(
            {
              error: "Failed to scrape Movember page",
              message: errorMessage,
              timestamp: Date.now(),
            },
            null,
            2
          ),
          {
            status: 500,
            headers: {
              "content-type": "application/json",
            },
          }
        );
      } else {
        // HTML error page for root path
        const errorHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Error</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      background: transparent;
      color: #fff;
    }
    .error {
      font-size: 24px;
      font-weight: 500;
      color: #ff4444;
    }
  </style>
</head>
<body>
  <div class="error">Error loading donation amount</div>
</body>
</html>`;
        
        console.error(`[ERROR] Returning HTML error page`);
        
        return new Response(errorHtml, {
          status: 500,
          headers: {
            "content-type": "text/html; charset=UTF-8",
          },
        });
      }
    }
  },
} satisfies ExportedHandler<Env>;

