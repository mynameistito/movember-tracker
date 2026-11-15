# Local parser tool

Run `bun run test:local` and choose one input mode:

1. Fetch an HTTPS Movember page. Redirects use the same validated, bounded fetch operation as the Worker.
2. Read an HTML file. An empty path selects `movember-html.html`.
3. Enter raised and target amounts manually.

Then enter the country subdomain, such as `nz`, `au`, or `uk`. The tool prints parsed amounts, currency, and percentage as JSON. It uses Happy DOM for the same DOM parsing path used in the browser. An HTML file can be saved from a member or team page to investigate markup changes without making repeated live requests.

`bun run typecheck` checks this script as well as the browser and Worker code. Automated regression tests run with `bun run test --run`.
