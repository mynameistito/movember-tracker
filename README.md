# Movember stream tracker

A browser-based donation tracker for Movember members and teams, with a transparent OBS overlay. The Cloudflare Worker serves the app and proxies Movember HTML; scraping and refresh run in the open browser source. There is no scheduled Worker job or shared server-side donation cache.

## Run locally

Install Bun, then:

```sh
bun install
bun run build
bunx wrangler dev
```

Open the local URL printed by Wrangler. Choose a member or team, enter its numeric Movember ID, preview the overlay, and copy the URL into an OBS Browser source. Use a 1920 × 1080 source. The setup preview fetches real donation data.

## Overlay URLs

```text
/overlay?memberId=14810348&location=bottomright&interval=300
/overlay?teamId=2494795&location=bottomleft&interval=60
```

`teamId` selects team tracking; otherwise `memberId` selects a member, defaulting to 14810348. `location` accepts topleft, topright, bottomleft, or bottomright. Refresh intervals are seconds, bounded to 30–3600, with a five-minute default. Keep the OBS Browser source active to keep refreshing; browser/OBS suspension can pause it.

TanStack Query owns overlay polling and bounded retries. Effect owns the fresh tracking operation and typed failures. Validated localStorage snapshots survive reloads and are isolated by member/team and ID. A refresh failure keeps the last successful total visible. On a first-load failure, the overlay displays an unavailable message and continues trying. The subdomain routing cache expires after 24 hours; donation snapshots use a five-minute TTL. Movember markup can change, so check the preview against the fundraiser page before a stream.

`/json` opens a browser-rendered data viewer. It is HTML that runs JavaScript, **not a JSON HTTP API**. External programs should not treat it as an application/json endpoint.

## Deploy

```sh
bun run build
bunx wrangler deploy
```

Wrangler uploads the Worker and the `public` assets. Build before deploying so generated browser bundles match source. No credentials belong in this repository; authenticate Wrangler through your Cloudflare account. Deployment is a separate action from local validation.

## Development checks

```sh
bun run typecheck
bun run test --run
bun run check
bun run build
```

`bun run fix` runs Ultracite using Oxlint and Oxfmt. Generated files under `public/js` are excluded from linting. Browser and Worker TypeScript environments are checked separately. Tests import source modules rather than generated bundles.

The proxy answers OPTIONS before target validation, follows at most five redirects, validates HTTPS Movember destinations on every hop, and applies a 15-second request timeout. It is intended for same-origin browser use and includes per-isolate rate limiting; that limit is not a distributed quota.

## Before a stream

Local verification on 6 November 2026 passed 103 tests, typechecks, lint, a Worker packaging dry run, and controlled Chromium checks for member/team previews and mobile layout. Live fetching of member 14810348 and team 2494795 returned HTTP 403 from Movember in this environment. Successful live totals are still unverified; complete the checks below from the intended deployment before using the overlay on stream.

1. Compare the member and team preview totals with their Movember pages.
2. Copy the overlay URL into OBS and confirm position, transparency, and currency.
3. Leave it running through a refresh and confirm the total updates.
4. Temporarily disconnect networking and confirm the last total stays visible, then reconnect and confirm recovery.

See [architecture notes](docs/architecture.md) for module ownership and the verification limits.
