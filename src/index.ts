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
  const startTime = Date.now();
  console.log(`[SCRAPE] Starting scrape of Movember page: ${MOVEMBER_URL}`);
  
  const browser = await puppeteer.launch(env.MYBROWSER);
  console.log(`[SCRAPE] Browser launched successfully`);
  let page;
  
  try {
    page = await browser.newPage();
    console.log(`[SCRAPE] New page created`);
    
    // Set a reasonable timeout
    console.log(`[SCRAPE] Navigating to ${MOVEMBER_URL}...`);
    await page.goto(MOVEMBER_URL, {
      waitUntil: "networkidle2",
      timeout: 30000,
    });
    console.log(`[SCRAPE] Page navigation completed`);

    // Wait for the content to load - look for text containing "Raised"
    console.log(`[SCRAPE] Waiting for "Raised" text to appear...`);
    await page.waitForFunction(
      () => document.body.innerText.includes("Raised"),
      { timeout: 10000 }
    );
    console.log(`[SCRAPE] "Raised" text found, page content loaded`);

    // Extract the data using page.evaluate
    console.log(`[SCRAPE] Extracting data from page...`);
    const data = await page.evaluate(() => {
      let raised = "";
      let target = "";
      
      // Target the specific CSS class for raised amount
      const raisedElement = document.querySelector(".donationProgress--amount__raised");
      if (raisedElement) {
        const raisedText = raisedElement.textContent || "";
        const raisedMatch = raisedText.match(/\$([\d,]+)/);
        if (raisedMatch) {
          raised = raisedMatch[1];
        }
      }
      
      // Target the specific CSS class for target amount
      const targetElement = document.querySelector(".donationProgress--amount__target");
      if (targetElement) {
        const targetText = targetElement.textContent || "";
        const targetMatch = targetText.match(/\$([\d,]+)/);
        if (targetMatch) {
          target = targetMatch[1];
        }
      }
      
      return { raised, target };
    });

    console.log(`[SCRAPE] Raw extracted data:`, { raised: data.raised || "NOT FOUND", target: data.target || "NOT FOUND" });

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

    const duration = Date.now() - startTime;
    console.log(`[SCRAPE] Scraping completed successfully in ${duration}ms:`, {
      amount: result.amount,
      target: result.target,
      percentage: result.percentage,
      currency: result.currency,
    });

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[SCRAPE] Scraping failed after ${duration}ms:`, errorMessage, error);
    throw error;
  } finally {
    try {
      await browser.close();
      console.log(`[SCRAPE] Browser closed`);
    } catch (closeError) {
      console.error(`[SCRAPE] Error closing browser:`, closeError);
    }
  }
}

// Retry wrapper with exponential backoff
async function scrapeWithRetry(env: Env): Promise<ScrapedData> {
  let lastError: Error | null = null;
  const retryStartTime = Date.now();

  console.log(`[RETRY] Starting retry logic (max ${MAX_RETRIES} attempts)`);

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      console.log(`[RETRY] Attempt ${attempt + 1}/${MAX_RETRIES}`);
      const result = await scrapeMovemberPage(env);
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
      // Check for grab-live parameter
      const grabLive = url.searchParams.has("grab-live");
      const cacheKey = "movember:amount:14810348";
      let data: ScrapedData | null = null;
      let cacheStatus = "HIT";

      if (grabLive) {
        // Force fresh scrape, bypass cache
        console.log(`[LIVE] grab-live parameter detected - forcing fresh scrape`);
        data = await scrapeWithRetry(env);
        cacheStatus = "LIVE";
        
        // Store in cache with 5-minute TTL
        console.log(`[CACHE] Storing live data in cache with TTL: ${CACHE_TTL}s`);
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
          console.log(`[CACHE] Cache HIT - data age: ${Math.round(cacheAge / 1000)}s`, {
            amount: data.amount,
            target: data.target,
            timestamp: new Date(data.timestamp).toISOString(),
          });
        } else {
          console.log(`[CACHE] Cache MISS - need to scrape`);
        }

        // If cache miss, scrape the page
        if (!data) {
          data = await scrapeWithRetry(env);
          cacheStatus = "MISS";
          
          // Store in cache with 5-minute TTL
          console.log(`[CACHE] Storing data in cache with TTL: ${CACHE_TTL}s`);
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
      } else if (pathname === "/") {
        // Return HTML with horizontal progress bar
        const percentage = data.percentage || 0;
        const amount = data.amount || "$0";
        const target = data.target || "$0";
        
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
      background: #1a1a1a;
      border-radius: 30px;
      position: relative;
      overflow: hidden;
      border: 2px solid #333;
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
    
    async function updateData() {
      try {
        const response = await fetch('/json');
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

