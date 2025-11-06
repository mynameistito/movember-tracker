import type { Env, ScrapedData } from '../types';
import { MOVEMBER_BASE_URL_TEMPLATE, MAX_RETRIES, RETRY_DELAYS } from '../constants';
import { buildMovemberUrl, getSubdomainForMember, clearSubdomainCache, detectSubdomainForMember } from './subdomain';
import { parseAmount, isValidNumber, calculatePercentage } from '../utils/parsing';
import { formatDuration } from '../utils/formatting';
import { sleep } from '../utils/formatting';

// Scrape the Movember page using fetch and HTML parsing
export async function scrapeMovemberPage(env: Env, memberId: string, clearSubdomainOn404: boolean = false): Promise<ScrapedData> {
  const movemberUrl = await buildMovemberUrl(env, memberId);
  let subdomain = await getSubdomainForMember(env, memberId);
  const startTime = Date.now();
  console.log(`[SCRAPE] Starting scrape of Movember page: ${movemberUrl} (subdomain: ${subdomain})`);
  
  try {
    // Fetch the HTML directly
    console.log(`[SCRAPE] Fetching HTML from ${movemberUrl}...`);
    const fetchStart = Date.now();
    let response = await fetch(movemberUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    
    // Handle 404 errors specially - clear cached subdomain and re-detect
    if (response.status === 404) {
      console.warn(`[SCRAPE] Got 404 for ${movemberUrl}, clearing cached subdomain and re-detecting...`);
      if (clearSubdomainOn404) {
        await clearSubdomainCache(env, memberId);
        // Re-detect subdomain with force refresh
        const newSubdomain = await detectSubdomainForMember(env, memberId, true);
        if (newSubdomain !== subdomain) {
          console.log(`[SCRAPE] Re-detected subdomain: ${newSubdomain} (was ${subdomain}), retrying with new subdomain...`);
          // Retry with new subdomain
          const newUrl = MOVEMBER_BASE_URL_TEMPLATE.replace("{subdomain}", newSubdomain) + `?memberId=${memberId}`;
          response = await fetch(newUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.9',
            },
          });
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} (after subdomain re-detection)`);
          }
          // Update subdomain for logging
          subdomain = newSubdomain;
        } else {
          // Same subdomain, still 404 - member probably doesn't exist
          throw new Error(`HTTP error! status: 404 (page not found - member may not exist)`);
        }
      } else {
        throw new Error(`HTTP error! status: ${response.status} (page not found - member may not exist or subdomain may be incorrect)`);
      }
    }
    
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
export async function scrapeWithRetry(env: Env, memberId: string): Promise<ScrapedData> {
  let lastError: Error | null = null;
  const retryStartTime = Date.now();

  console.log(`[RETRY] Starting retry logic (max ${MAX_RETRIES} attempts) for memberId: ${memberId}`);

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      console.log(`[RETRY] Attempt ${attempt + 1}/${MAX_RETRIES}`);
      // Enable subdomain clearing on 404 for retries (especially on first attempt)
      const clearSubdomainOn404 = attempt === 0 || (lastError !== null && lastError.message.includes('404'));
      const result = await scrapeMovemberPage(env, memberId, clearSubdomainOn404);
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
        await clearSubdomainCache(env, memberId);
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

