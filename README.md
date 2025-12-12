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

# other supported flags (CLI overrides .env):
# --maxPages / --max-pages
# --maxLinksPerPage / --max-links-per-page
# --headless
# --outputFile / --output-file
```

Results are saved to a timestamped file in `reports/` by default.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `BASE_URL` | Yes* | — | Target site URL (can also be provided via `--baseUrl`) |
| `MAX_PAGES` | No | `1000` | Max pages to crawl |
| `MAX_LINKS_PER_PAGE` | No | `250` | Max number of same-origin links to enqueue per page (useful for sitemap/index pages) |
| `OUTPUT_FILE` | No | Timestamped in `reports/` | Output file path (can also be provided via `--outputFile`) |
| `HEADLESS` | No | `false` | Run browser headless |

*`BASE_URL` is required unless you pass `--baseUrl`.

## Templates

The `create` script can include predefined CSP sources for common third-party services. Templates are stored as JSON files in the `templates/` directory.

### Included Templates
- **Google Analytics / Tag Manager**
- **Google Fonts**
- **YouTube Embeds**
- **Vimeo Embeds**
- **Cloudflare CDN**
- **Facebook / Meta Pixel**
- **HubSpot**

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

## Considerations

The CSP typically applies to both the frontend and backend. Since the backend cannot be scanned by this script, you may need to manually check the backend for CSP violations.
