import puppeteer from "@cloudflare/puppeteer";

interface Env {
  MYBROWSER: Fetcher;
  CACHE: KVNamespace;
}

interface ScrapedData {
  amount: string;
  currency: string;
  target?: string;
  percentage?: number;
  timestamp: number;
}

const MOVEMBER_URL = "https://au.movember.com/donate/details?memberId=14810348";
const CACHE_TTL = 300; // 5 minutes in seconds
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000]; // Exponential backoff in milliseconds

// Helper function to sleep
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper function to extract amount from text
const parseAmount = (text: string): { value: string; currency: string } => {
  // Remove whitespace and extract currency symbol and amount
  const cleaned = text.trim();
  const currencyMatch = cleaned.match(/^([$€£¥]|AUD|USD|EUR|GBP|JPY)\s*/i);
  const currency = currencyMatch ? (cleaned.startsWith("$") ? "AUD" : currencyMatch[1].toUpperCase()) : "AUD";
  const amountMatch = cleaned.match(/[\d,]+\.?\d*/);
  const amount = amountMatch ? amountMatch[0] : "0";
  return { value: amount, currency };
};

// Helper function to calculate percentage
const calculatePercentage = (raised: string, target: string): number => {
  const raisedNum = parseFloat(raised.replace(/,/g, ""));
  const targetNum = parseFloat(target.replace(/,/g, ""));
  if (targetNum === 0) return 0;
  return Math.round((raisedNum / targetNum) * 100);
};

// Scrape the Movember page
async function scrapeMovemberPage(env: Env): Promise<ScrapedData> {
  const browser = await puppeteer.launch(env.MYBROWSER);
  let page;
  
  try {
    page = await browser.newPage();
    
    // Set a reasonable timeout
    await page.goto(MOVEMBER_URL, {
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    // Wait for the content to load - look for text containing "Raised"
    await page.waitForFunction(
      () => document.body.innerText.includes("Raised"),
      { timeout: 10000 }
    );

    // Extract the data using page.evaluate
    const data = await page.evaluate(() => {
      // Get all text content
      const bodyText = document.body.innerText || document.body.textContent || "";
      
      // Try multiple strategies to find the amounts
      let raised = "";
      let target = "";
      
      // Strategy 1: Look for "Raised" followed by "$" amount
      const raisedPatterns = [
        /Raised[\s\S]{0,100}?\$([\d,]+)/i,
        /Raised[\s\S]*?(\$[\d,]+)/i,
        /(\$[\d,]+)[\s\S]{0,50}?Raised/i,
      ];
      
      for (const pattern of raisedPatterns) {
        const match = bodyText.match(pattern);
        if (match && match[1]) {
          raised = match[1].replace("$", "").trim();
          break;
        }
      }
      
      // Strategy 2: Look for "Target" followed by "$" amount
      const targetPatterns = [
        /Target[\s\S]{0,100}?\$([\d,]+)/i,
        /Target[\s\S]*?(\$[\d,]+)/i,
        /(\$[\d,]+)[\s\S]{0,50}?Target/i,
      ];
      
      for (const pattern of targetPatterns) {
        const match = bodyText.match(pattern);
        if (match && match[1]) {
          target = match[1].replace("$", "").trim();
          break;
        }
      }
      
      // Strategy 3: Find elements containing "Raised" and look for nearby $ amounts
      if (!raised || !target) {
        const allElements = Array.from(document.querySelectorAll("*"));
        for (const el of allElements) {
          const textContent = el.textContent || "";
          
          // Check if this element or its parent contains "Raised"
          if (textContent.includes("Raised") && textContent.includes("$")) {
            const amountMatch = textContent.match(/\$([\d,]+)/);
            if (amountMatch && !raised) {
              raised = amountMatch[1];
            }
          }
          
          // Check if this element or its parent contains "Target"
          if (textContent.includes("Target") && textContent.includes("$")) {
            const amountMatch = textContent.match(/\$([\d,]+)/);
            if (amountMatch && !target) {
              target = amountMatch[1];
            }
          }
        }
      }
      
      return { raised, target };
    });

    if (!data.raised) {
      throw new Error("Could not find raised amount on page");
    }

    const { value: raisedValue, currency } = parseAmount(`$${data.raised}`);
    const raisedFormatted = `$${raisedValue}`;
    
    let result: ScrapedData = {
      amount: raisedFormatted,
      currency,
      timestamp: Date.now(),
    };

    if (data.target) {
      const { value: targetValue } = parseAmount(`$${data.target}`);
      const targetFormatted = `$${targetValue}`;
      result.target = targetFormatted;
      result.percentage = calculatePercentage(raisedValue, targetValue);
    }

    return result;
  } finally {
    try {
      await browser.close();
    } catch (closeError) {
      // Ignore close errors
    }
  }
}

// Retry wrapper with exponential backoff
async function scrapeWithRetry(env: Env): Promise<ScrapedData> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await scrapeMovemberPage(env);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt < MAX_RETRIES - 1) {
        const delay = RETRY_DELAYS[attempt] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
        await sleep(delay);
      }
    }
  }

  throw lastError || new Error("Failed to scrape after all retries");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      // Check cache first
      const cacheKey = "movember:amount:14810348";
      const cached = await env.CACHE.get(cacheKey, { type: "json" });

      if (cached) {
        return new Response(JSON.stringify(cached, null, 2), {
          headers: {
            "content-type": "application/json",
            "x-cache": "HIT",
          },
        });
      }

      // Cache miss - scrape the page
      const data = await scrapeWithRetry(env);

      // Store in cache with 5-minute TTL
      await env.CACHE.put(cacheKey, JSON.stringify(data), {
        expirationTtl: CACHE_TTL,
      });

      return new Response(JSON.stringify(data, null, 2), {
        headers: {
          "content-type": "application/json",
          "x-cache": "MISS",
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
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
    }
  },
} satisfies ExportedHandler<Env>;

