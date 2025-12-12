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
npm run crawl
# or with bun:
# bun run crawl
```

Results are saved to the file specified in `OUTPUT_FILE` (default: `csp-violations-detailed.json`).

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `BASE_URL` | Yes | — | Target site URL |
| `MAX_PAGES` | No | `1000` | Max pages to crawl |
| `OUTPUT_FILE` | No | `csp-violations-detailed.json` | Output filename |
| `HEADLESS` | No | `false` | Run browser headless |
