# Movember Donation Scraper

A Cloudflare Worker that automatically tracks your Movember donation progress. This tool scrapes your Movember donation page and provides the data in a format perfect for stream overlays or websites.

## What This Does

This project creates a Cloudflare Worker that automatically checks your Movember donation page every 5 minutes and stores the current donation amount. You can then access this information through a simple web link that returns the data in a format that's easy to use in stream overlays, websites, or other applications.

## Quick Setup

### Step 1: Fork This Repository

1. Click the **"Fork"** button at the top of this page
2. This creates your own copy of the repository

### Step 2: Connect to Cloudflare Workers

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Sign up or log in (free tier works great!)
3. Click **"Workers & Pages"** in the sidebar
4. Click **"Create application"**
5. Click **"Connect to Git"**
6. Select your GitHub account and choose your forked repository
7. Click **"Begin setup"**

### Step 3: Configure Your Worker

1. **Worker name:** Choose a name (e.g., `my-movember-tracker`)
2. **Production branch:** Select `main` (or `master`)
3. **Build command:** Leave empty (or use `npm install` if needed)
4. **Root directory:** Leave as `/`
5. Click **"Save and Deploy"**

### Step 4: Create KV Namespace

1. In the Cloudflare Dashboard, go to **"Workers & Pages"**
2. Click on your Worker name
3. Go to the **"Settings"** tab
4. Scroll down to **"Variables"** section
5. Click **"Add binding"** under **"KV Namespace Bindings"**
6. **Variable name:** `CACHE`
7. Click **"Create new namespace"**
8. Name it `CACHE` and click **"Add"**
9. Click **"Save"**

### Step 5: Update Your Movember URL

1. In your forked repository on GitHub, go to `src/index.ts`
2. Click the pencil icon to edit the file
3. Find the line:
   ```typescript
   const MOVEMBER_URL = "https://au.movember.com/donate/details?memberId=14810348";
   ```
4. Replace the URL with your Movember page URL
5. Click **"Commit changes"**
6. Cloudflare will automatically redeploy your Worker!


## Using Your Worker

Once deployed, your Worker will be available at:
- **Main page:** `https://your-worker-name.your-subdomain.workers.dev`
- **JSON data:** `https://your-worker-name.your-subdomain.workers.dev/json`

### JSON Response Format

```json
{
  "amount": "$2,500",
  "currency": "AUD",
  "target": "$10,000",
  "percentage": 25,
  "timestamp": 1704067200000
}
```

## How It Works

- The Worker checks your Movember page every time someone requests the data
- Results are cached for 5 minutes to avoid excessive requests
- Uses Cloudflare's Browser Rendering API to scrape the page

## Troubleshooting

**Worker shows errors:**
- Check the **"Logs"** tab in your Worker dashboard
- Make sure your KV namespace binding is named `CACHE`
- Make sure your Browser Rendering binding is named `MYBROWSER`

**Wrong donation amount:**
- The Worker caches data for 5 minutes - wait a bit and try again
- Double-check that your Movember URL is correct in `src/index.ts`

**Need to update the Movember URL:**
- Edit `src/index.ts` in your GitHub repository
- Cloudflare will automatically redeploy when you commit changes

## License

MIT

## Credits
Made with AI.
