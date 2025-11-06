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
      let raised = "";
      let target = "";
      
      // Target the specific CSS class for raised amount
      const raisedElement = document.querySelector(".donationProgress--amount__raised");
      if (raisedElement) {
        const raisedText = raisedElement.textContent || raisedElement.innerText || "";
        const raisedMatch = raisedText.match(/\$([\d,]+)/);
        if (raisedMatch) {
          raised = raisedMatch[1];
        }
      }
      
      // Target the specific CSS class for target amount
      const targetElement = document.querySelector(".donationProgress--amount__target");
      if (targetElement) {
        const targetText = targetElement.textContent || targetElement.innerText || "";
        const targetMatch = targetText.match(/\$([\d,]+)/);
        if (targetMatch) {
          target = targetMatch[1];
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
    const url = new URL(request.url);
    const pathname = url.pathname;

    try {
      // Check cache first
      const cacheKey = "movember:amount:14810348";
      let cached = await env.CACHE.get(cacheKey, { type: "json" });
      let data: ScrapedData | null = cached as ScrapedData | null;
      let cacheStatus = "HIT";

      // If cache miss, scrape the page
      if (!data) {
        data = await scrapeWithRetry(env);
        cacheStatus = "MISS";
        
        // Store in cache with 5-minute TTL
        await env.CACHE.put(cacheKey, JSON.stringify(data), {
          expirationTtl: CACHE_TTL,
        });
      }

      // Route handling
      if (pathname === "/json") {
        // Return JSON response
        return new Response(JSON.stringify(data, null, 2), {
          headers: {
            "content-type": "application/json",
            "x-cache": cacheStatus,
          },
        });
      } else if (pathname === "/") {
        // Return HTML with amount raised in Inter font
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
      background: #000;
      color: #fff;
    }
    .amount {
      font-size: 72px;
      font-weight: 700;
      letter-spacing: -0.02em;
      transition: opacity 0.3s ease;
    }
    .amount.updating {
      opacity: 0.7;
    }
  </style>
</head>
<body>
  <div class="amount" id="amount">${data.amount}</div>
  <script>
    const amountElement = document.getElementById('amount');
    let currentAmount = '${data.amount}';
    
    async function updateAmount() {
      try {
        const response = await fetch('/json');
        const data = await response.json();
        
        if (data.amount && data.amount !== currentAmount) {
          amountElement.classList.add('updating');
          
          setTimeout(() => {
            amountElement.textContent = data.amount;
            currentAmount = data.amount;
            amountElement.classList.remove('updating');
          }, 150);
        }
      } catch (error) {
        console.error('Failed to update amount:', error);
      }
    }
    
    // Update every 30 seconds (cache is 5 minutes, but we check more frequently)
    setInterval(updateAmount, 30000);
    
    // Also update immediately on page load after a short delay
    setTimeout(updateAmount, 1000);
  </script>
</body>
</html>`;

        return new Response(html, {
          headers: {
            "content-type": "text/html; charset=UTF-8",
            "x-cache": cacheStatus,
          },
        });
      } else {
        // 404 for other paths
        return new Response("Not Found", {
          status: 404,
          headers: {
            "content-type": "text/plain",
          },
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
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
      background: #000;
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

