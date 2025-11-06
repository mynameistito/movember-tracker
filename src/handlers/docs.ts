import type { Env } from '../types';
import { getData } from './data';

export async function handleDocs(request: Request, env: Env, requestStartTime: number): Promise<Response> {
  const { data, cacheStatus } = await getData(env, request);
  const url = new URL(request.url);
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
}

