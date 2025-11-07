# Local Testing Script

This script allows you to test the HTML parsing logic locally without needing to run the full scraper.

## Usage

Run the test script:

```bash
bun run test:local
```

or

```bash
npm run test:local
```

## Options

1. **Load HTML from file** - Test parsing with an HTML file (e.g., `movember-html.html`)
2. **Manually enter amounts** - Skip HTML parsing and just provide raised/target amounts directly

## Example Workflow

1. Save HTML from a Movember page to `movember-html.html` in the project root
2. Run `bun run test:local`
3. Choose option 1 and press Enter (to use default file)
4. Review the extracted amounts
5. If amounts aren't found, use the debug options to inspect the HTML

## Debugging

If the parser doesn't find amounts, you can:
- View the first 1000 characters of HTML
- Search for specific text in the HTML
- See all dollar amounts found in the HTML

This helps identify what patterns might be needed for extraction.

