# Tracking and runtime ownership

The Worker serves static assets and proxies permitted HTTPS Movember pages. The browser owns scraping, persisted snapshots, and refresh timing. There is no scheduled scrape or server-side donation store.

## Data flow

```text
OBS / setup preview
  → overlay entrypoint
  → TanStack Query observer and polling
  → Effect Tracking operation
  → shared fundraiser acquisition
  → country discovery + proxy fetch + pure HTML parsing
  → validated localStorage snapshot
```

`tracking-query.ts` is the browser composition root. It selects the production Tracking Layer and runs each operation with Query's abort signal. `tracking.ts` owns fresh acquisition, typed failure mapping, and successful snapshot persistence. Query owns polling and bounded retries for transient transport and server failures; terminal HTTP and markup failures are not retried. The compatibility reader in `scraper/orchestrator.ts` retains the exported `getData`/`getTeamData` interface used by the browser data viewer.

The Effect inventory consists of one Tracking tag and one production Layer, colocated in `tracking.ts`. Layer construction is synchronous because it does not acquire resources. Request cancellation belongs to each operation and propagates through Effect's promise adapter to discovery and network fetches. Disposing an observer aborts pending work and prevents late snapshot publication.

## Module decisions

- Keep parsing, formatting, schemas, URL construction and fundraiser inputs as pure functions or values. They do not own runtime authority.
- Keep `cache.ts` as the browser storage adapter. Runtime decoding, namespacing, TTL and best-effort storage handling give it a cohesive purpose. Fresh reads retain expired valid snapshots for stale reads; malformed or future-dated snapshots are rejected.
- Keep `movember-proxy.ts` as the network adapter. It owns destination validation, bounded redirects, one timeout budget, caller cancellation, and response-body cleanup.
- Keep Worker bindings in `index.ts`. The proxy validates same-origin use and distinguishes invalid requests from upstream failures.
- Share member/team acquisition, country discovery, retry policy, snapshot reads, DOM extraction and fallback scoring. Their previous duplication spread the same rules across several paths; shared modules improve locality and make one regression protect both fundraiser types.
- Keep network substitutes local to tests. Tests use real parsing, cache, Tracking and Query operations; no additional production port exists solely to support mocking.

## Failure and cache behavior

Query acquisition now enables wrong-country recovery after a 404. HTTP status crosses the proxy interface, so country discovery can distinguish missing regional pages from access refusal. A non-404 proxy failure stops discovery instead of probing every country.

Expired donation snapshots survive fresh-cache misses. Regression tests cover stale publication and subsequent background replacement for both members and teams. A pending-fetch regression verifies observer disposal aborts acquisition without publishing a snapshot.

## Verification and remaining release gate

Local checks pass: Ultracite/Oxlint/Oxfmt, browser/Worker/script typechecks, 110 regression tests, browser bundles, and Wrangler deployment dry run. Headless Chromium checks exercise the packaged setup page and overlay with controlled donation responses: member/team previews, generated URLs, mobile overflow and page errors.

Live attempts for member 14810348 and team 2494795 returned HTTP 403 from Movember in this environment. These attempts verify failure presentation, not successful live totals. The upstream refusal remains a release gate. Compare real member/team totals and confirm ongoing refresh in the intended deployment and OBS before live use.
