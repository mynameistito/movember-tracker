# Movember Donation Scraper

A Cloudflare Worker that scrapes the current amount raised from a Movember donation page using Browser Rendering API. Perfect for stream overlays and real-time donation tracking.

## Features

- 🚀 **Browser Rendering**: Uses Cloudflare's Browser Rendering API with Puppeteer
- 💾 **Smart Caching**: 5-minute cache to reduce API calls and improve performance
- 🔄 **Automatic Retries**: 3 attempts with exponential backoff (1s, 2s, 4s delays)
- 📊 **JSON Response**: Clean JSON format perfect for stream overlays
- ⚡ **Fast & Reliable**: Built on Cloudflare's global network

## Setup

### Prerequisites

1. [Cloudflare account](https://dash.cloudflare.com/sign-up/workers-and-pages)
2. [Node.js](https://nodejs.org/) 16.17.0 or later
3. [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) installed globally or via npm

### Installation

1. Install dependencies:
```bash
npm install
```

2. Create KV namespaces for caching:
```bash
# Create production namespace
npx wrangler kv namespace create CACHE

# Create preview namespace for local development
npx wrangler kv namespace create CACHE --preview
```

3. Update `wrangler.jsonc` with your KV namespace IDs:
   - Replace `placeholder-kv-namespace-id` with your production namespace ID
   - Replace `placeholder-kv-preview-id` with your preview namespace ID

4. Authenticate with Cloudflare:
```bash
npx wrangler login
```

## Development

Run the Worker locally with remote browser rendering:
```bash
npm run dev
```

The Worker will be available at `http://localhost:8787` (or the port shown in the terminal).

## Deployment

Deploy to Cloudflare Workers:
```bash
npm run deploy
```

## Usage

The Worker exposes a single GET endpoint that returns the current donation amount:

**Request:**
```
GET https://your-worker.your-subdomain.workers.dev/
```

**Response:**
```json
{
  "amount": "$2,500",
  "currency": "AUD",
  "target": "$10,000",
  "percentage": 25,
  "timestamp": 1704067200000
}
```

**Response Headers:**
- `x-cache`: `HIT` if served from cache, `MISS` if freshly scraped
- `content-type`: `application/json`

## Configuration

- **Target URL**: Hardcoded to `https://au.movember.com/donate/details?memberId=14810348`
- **Cache TTL**: 5 minutes (300 seconds)
- **Max Retries**: 3 attempts
- **Retry Delays**: 1s, 2s, 4s (exponential backoff)

To change the target URL, edit `MOVEMBER_URL` in `src/index.ts`.

## Error Handling

If scraping fails after all retries, the Worker returns a 500 error with details:

```json
{
  "error": "Failed to scrape Movember page",
  "message": "Error details here",
  "timestamp": 1704067200000
}
```

## Project Structure

```
.
├── src/
│   └── index.ts          # Main Worker code
├── package.json          # Dependencies and scripts
├── tsconfig.json         # TypeScript configuration
├── wrangler.jsonc        # Cloudflare Worker configuration
└── README.md             # This file
```

## License

MIT

