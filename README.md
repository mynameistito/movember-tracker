# Movember Donation Scraper (Very WIP)

A Cloudflare Worker that automatically tracks your Movember donation progress. This tool fetches and parses your Movember donation page HTML to extract donation data, providing it in a format perfect for stream overlays or websites.

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

## Using Your Worker

Once deployed, your Worker will be available at:
- **Main page:** `https://your-worker-name.your-subdomain.workers.dev`
- **JSON data:** `https://your-worker-name.your-subdomain.workers.dev/json`

### Using the memberId and teamId Parameters

You can track any Movember member or team by adding the `memberId` or `teamId` query parameter to your URLs:

**Examples:**
- Default member (14810348): `https://your-worker-name.your-subdomain.workers.dev`
- Specific member: `https://your-worker-name.your-subdomain.workers.dev?memberId=12345678`
- JSON for specific member: `https://your-worker-name.your-subdomain.workers.dev/json?memberId=12345678`
- Specific team: `https://your-worker-name.your-subdomain.workers.dev?teamId=2494795`
- JSON for specific team: `https://your-worker-name.your-subdomain.workers.dev/json?teamId=2494795`

**To find your Movember member ID:**
1. Go to your Movember donation page (e.g., `https://au.movember.com/donate/details?memberId=YOUR_ID`)
2. The number after `memberId=` in the URL is your member ID
3. Use that ID in the query parameter when accessing the Worker

**To find your Movember team ID:**
1. Go to your Movember team page (e.g., `https://nz.movember.com/team/2494795`)
2. The number after `/team/` in the URL is your team ID
3. Use that ID with the `teamId` query parameter when accessing the Worker

Each member/team ID has its own cache, so different members' and teams' data won't interfere with each other.

### Subdomain Support

Different Movember members and teams may use different subdomains (e.g., `fr.movember.com`, `au.movember.com`, etc.). **The Worker automatically detects the correct subdomain by following redirects** - no manual configuration needed!

**How it works:**
1. When a member or team ID is first requested, the Worker tries the default subdomain (`au.movember.com`)
2. If Movember redirects to a different subdomain, the Worker detects and caches it
3. The detected subdomain is cached for 24 hours to avoid repeated detection
4. Subsequent requests use the cached subdomain for faster performance
5. Member and team subdomain mappings are cached separately

**Manual overrides (optional):**
If you need to manually override a subdomain mapping, you can edit `src/index.ts` and add entries to the `MEMBER_SUBDOMAIN_MAP`:

```typescript
const MEMBER_SUBDOMAIN_MAP: Record<string, string> = {
  "15023456": "fr",  // Manual override for member 15023456
  // Add more overrides if needed
};
```

Manual overrides take precedence over auto-detection and are also cached.

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

### Team Page Support

This service supports both Movember member pages and team pages:

- **Member pages:** `https://{subdomain}.movember.com/donate/details?memberId={id}`
- **Team pages:** `https://{subdomain}.movember.com/team/{id}`

Team pages use the same data structure as member pages (raised amount, target, percentage), but are accessed via different URLs. Team and member data are cached separately with proper namespacing, so you can track both without conflicts.

## How It Works

- The Worker fetches your Movember page HTML directly using `fetch()`
- Parses the HTML using regex patterns to extract donation amounts from CSS classes
- Results are cached for 5 minutes to avoid excessive requests
- Supports both member pages (`/donate/details?memberId=`) and team pages (`/team/`)
- Member and team data are cached separately with proper namespacing
- Much faster and more cost-effective than browser rendering

## Troubleshooting

**Worker shows errors:**
- Check the **"Logs"** tab in your Worker dashboard
- If you see "Could not find raised amount in HTML", the page structure may have changed or requires JavaScript execution

**Wrong donation amount:**
- The Worker caches data for 5 minutes - wait a bit and try again
- Double-check that the `memberId` or `teamId` parameter matches your Movember ID
- You can force a fresh scrape by adding `&grab-live=true` to the URL

**Team page not working:**
- Make sure you're using the `teamId` parameter (not `memberId`) for team pages
- Verify the team URL format: `https://{subdomain}.movember.com/team/{id}`
- Check that the team ID is correct by visiting the team page directly

**Need to change the default member ID:**
- Edit `src/index.ts` in your GitHub repository
- Find `const DEFAULT_MEMBER_ID = "14810348";` and change the ID
- Cloudflare will automatically redeploy when you commit changes

## License

MIT

## Credits
Made with AI.
