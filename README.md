# CSP Crawler

Crawls a website and collects Content Security Policy violations.

## Requirements

Bun (latest) or Node.js `>= 18`.

## Setup

```bash
npm install
cp .env.example .env
# or with bun:
# bun install
```

Edit `.env` with your target URL.

You can also provide the target URL via CLI with `--baseUrl`, which overrides `.env`.

## Usage

```bash
npm run validate
# or with bun:
# bun run validate

# override BASE_URL from .env:
npm run validate -- --baseUrl https://example.com
# or with bun:
# bun run validate -- --baseUrl https://example.com

# create a CSP policy report (also supports --baseUrl):
npm run create -- --baseUrl https://example.com

# crawl with 3 concurrent tabs and limit to 100 pages:
npm run validate -- --baseUrl https://example.com --concurrency 3 --max-pages 100

# quiet mode (suppress per-page output):
npm run validate -- --baseUrl https://example.com --quiet

# other supported flags (CLI overrides .env):
# --maxPages / --max-pages
# --maxLinksPerPage / --max-links-per-page
# --maxDepth / --max-depth
# --concurrency
# --maxRetries / --max-retries
# --delay
# --headless / --no-headless
# --quiet
# --outputFile / --output-file
# --yes / --skipConfirmation (skip confirmation prompt)
```

Results are saved to a timestamped file in `reports/` by default.

Press `Ctrl+C` once during a crawl to gracefully shut down (finishes current pages and saves partial results). Press `Ctrl+C` again to force exit.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `BASE_URL` | Yes* | — | Target site URL (can also be provided via `--baseUrl`) |
| `MAX_PAGES` | No | `50000` | Max pages to crawl |
| `MAX_LINKS_PER_PAGE` | No | `1000` | Max number of same-origin links to enqueue per page (useful for sitemap/index pages) |
| `MAX_DEPTH` | No | `10` | Max crawl depth (0 = only base page, 1 = base page + links from it, etc.) |
| `CONCURRENCY` | No | `5` | Number of concurrent browser tabs |
| `MAX_RETRIES` | No | `2` | Max retries per page before marking as failed (3 total attempts) |
| `DELAY` | No | `1000` | Delay between requests per worker in milliseconds |
| `OUTPUT_FILE` | No | Timestamped in `reports/` | Output file path (can also be provided via `--outputFile`) |
| `HEADLESS` | No | `true` | Run browser headless (set to `false` or use `--no-headless` to show browser window) |
| `QUIET` | No | `false` | Suppress per-page log output |
| `SKIP_CONFIRMATION` | No | `false` | Skip confirmation prompt (for automated usage) |

*`BASE_URL` is required unless you pass `--baseUrl`.

## Templates

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

## Planned Enhancements

Concise test plan and TODOs for the next iteration (using `bun test`):

- Add Bun unit tests for config parsing (env/CLI precedence, invalid values, negative/zero guardrails).
- Add unit tests for URL normalization (tracking params removal, trailing slash handling, hash stripping).
- Add template loading validation tests (malformed JSON, missing `directives`).
- Add a mocked puppeteer harness to test crawl flow deterministically.
- Add an opt-in integration test (`RUN_E2E=1`) that crawls a local fixture server.

## Considerations

The CSP typically applies to both the frontend and backend. Since the backend cannot be scanned by this script, you may need to manually check the backend for CSP violations.
