# CSP Crawler

Crawls a website to create or validate its Content Security Policy.

## Requirements

Bun (latest)

## Setup and Usage

```bash
bun install
cp .env.example .env
bun run validate
```

Configuration with `.env` is recommended. Edit it with your target URL. And that may be the only configuration you need.

```bash
# Typical usage:
bun run validate

# Optional CLI overrides:

## override BASE_URL from .env:
bun run validate -- --baseUrl https://example.com

## crawl with 3 concurrent tabs and limit to 100 pages:
bun run validate -- --baseUrl https://example.com --concurrency 3 --max-pages 100

## quiet mode (suppress per-page output):
bun run validate -- --baseUrl https://example.com --quiet

## other supported flags (CLI overrides .env):
# --maxPages / --max-pages
# --maxLinksPerPage / --max-links-per-page
# --maxDepth / --max-depth
# --concurrency
# --maxRetries / --max-retries
# --delay
# --headless / --no-headless
# --quiet
# --outputFile / --output-file
# --excludePattern / --exclude-pattern
# --yes / --skipConfirmation (skip confirmation prompt)
```

Press `Ctrl+C` once during a crawl to gracefully shut down (finishes current pages and saves partial results). Press `Ctrl+C` again to force exit.

## Configuration with Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `BASE_URL` | Yes* | — | Target site URL (can also be provided via `--baseUrl`) |
| `MAX_PAGES` | No | `50000` | Max pages to crawl |
| `MAX_LINKS_PER_PAGE` | No | `50000` | Max number of same-origin links to enqueue per page (useful for sitemap/index pages) |
| `MAX_DEPTH` | No | `10` | Max crawl depth (0 = only base page, 1 = base page + links from it, etc.) |
| `CONCURRENCY` | No | `5` | Number of concurrent browser tabs |
| `MAX_RETRIES` | No | `2` | Max retries per page before marking as failed (3 total attempts) |
| `DELAY` | No | `1000` | Delay between requests per worker in milliseconds |
| `OUTPUT_FILE` | No | Timestamped in `reports/` | Output file path (can also be provided via `--outputFile`) |
| `HEADLESS` | No | `true` | Run browser headless (set to `false` or use `--no-headless` to show browser window) |
| `QUIET` | No | `false` | Suppress per-page log output |
| `SKIP_CONFIRMATION` | No | `false` | Skip confirmation prompt (for automated usage) |
| `EXCLUDE_PATTERN` | No | — | Regex pattern for URLs to exclude from crawling (case-insensitive) |

*`BASE_URL` is required unless you pass `--baseUrl`.

## CSP Templates from Common Third-Party Services

The `create` script can include predefined CSP sources for common third-party services. Templates are stored as JSON files in the `templates/` directory.

### Included Templates
- **Cloudflare CDN**
- **Craft CMS**
- **Facebook / Meta Pixel**
- **Google Ads**
- **Google Analytics / Tag Manager**
- **Google Fonts**
- **Google reCAPTCHA**
- **HubSpot**
- **Vimeo Embeds**
- **YouTube Embeds**

### Adding Custom Templates

Create a JSON file in `templates/` with this structure:

```json
{
  "name": "Service Name",
  "directives": {
    "script-src": ["https://example.com"],
    "connect-src": ["https://api.example.com"]
  }
}
```

## Usage with Craft CMS

We often use this with Craft CMS. Add a `/utils` templates directory to list entries/URLs for crawling. Example Twig utilities live in `craft-util-templates/` and may need tweaks for your install:

- [All Entries with a URI](`craft-util-templates/all-entries-with-urls.twig`)
- [All Entries with an Embed Matrix Block](`craft-util-templates/all-entries-with-embeds.twig`)
- [All Entry Types including Craft Calendar Plugin Events](`craft-util-templates/all-entry-types.twig`)

Remember to exclude sections like the Module Listing, CMS Guide, or others you wish to ignore.

You may also need to add Categories, Tags, or other Custom Elements that are not Entries.

## Limitations

- Logged-in or authenticated pages cannot be scanned; some manual testing is necessary.
- Resources that load only after user interactions (e.g., clicking a video) must be discovered manually.

## Other Considerations

The CSP typically applies to both the frontend and backend. Since the backend cannot be scanned by this script, you may need to manually check the backend for CSP violations.

Iframe CSP errors can appear in the console and be reported, but they do not require action. We may explore excluding those in the future.

## Planned Enhancements

Concise test plan and TODOs for the next iteration (using `bun test`):

- Add Bun unit tests for config parsing (env/CLI precedence, invalid values, negative/zero guardrails).
- Add unit tests for URL normalization (tracking params removal, trailing slash handling, hash stripping).
- Add template loading validation tests (malformed JSON, missing `directives`).
- Add a mocked puppeteer harness to test crawl flow deterministically.
- Add an opt-in integration test (`RUN_E2E=1`) that crawls a local fixture server.
- Add support for `sitemap.xml` discovery, including sitemap indexes that link to other sitemaps.
