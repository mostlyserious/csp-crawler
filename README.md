# CSP Crawler

Crawls a website and collects Content Security Policy violations.

## Setup

```bash
npm install
cp .env.example .env
# or with bun:
# bun install
```

Edit `.env` with your target URL.

## Usage

```bash
npm run validate
# or with bun:
# bun run validate
```

Results are saved to the file specified in `OUTPUT_FILE` (default: `csp-violations-detailed.json`).

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `BASE_URL` | Yes | — | Target site URL |
| `MAX_PAGES` | No | `1000` | Max pages to crawl |
| `MAX_LINKS_PER_PAGE` | No | `250` | Max number of same-origin links to enqueue per page (useful for sitemap/index pages) |
| `OUTPUT_FILE` | No | `csp-violations-detailed.json` | Output filename |
| `HEADLESS` | No | `false` | Run browser headless |

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
