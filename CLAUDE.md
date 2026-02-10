# CSP Crawler

A Puppeteer-based web crawler that scans websites to create or validate Content Security Policy headers.

## Commands

Always use `bun`, not `npm` or `npx`.

- `bun run validate` — crawl and check for CSP violations
- `bun run check` — alias for validate
- `bun run create` — crawl and generate a CSP policy
- `bun run clear-reports` — delete all report files
- `bun run lint` — ESLint with auto-fix

## Architecture

```
scripts/
  crawler.js        — shared crawl engine (exports crawlSite)
  csp-validator.js  — validates CSP headers, collects violations
  csp-create.js     — detects external resources, generates CSP policy
  script-utils.js   — shared config parsing and path utilities
  clear-reports.js  — deletes report files
templates/          — JSON CSP directive templates for common services
craft-util-templates/ — Twig templates for Craft CMS URL discovery
reports/            — output directory (gitignored JSON files)
```

### How scripts connect

Both `csp-validator.js` and `csp-create.js` call `crawlSite()` from `crawler.js` with callback options:
- `onPageVisit(page, url, depth, response)` — called after each page loads
- `onConsoleMessage(msg, pageUrl)` — called for browser console messages
- `onRequestIntercept(request)` — called for each network request; return truthy to skip default `request.continue()`

Configuration flows through `getCommonConfig()` in `script-utils.js`, which merges env vars and CLI args (CLI wins).

## Coding Conventions

Enforced by ESLint (`bun run lint`):
- Single quotes, no semicolons
- 4-space indentation
- Trailing commas on multiline arrays/objects/params
- Spaces inside array brackets: `[ 'a', 'b' ]`
- Spaces inside object braces: `{ key: value }`
- Arrow parens only when needed: `x => x` not `(x) => x`
- `const`/`let` only, no `var`
- Prefer template literals, arrow callbacks, rest/spread
- Blank line before `return` and after variable declarations

## Key Patterns

**Config parsing** — `script-utils.js:getCommonConfig()` handles all env/CLI merging. Both camelCase (`--maxPages`) and kebab-case (`--max-pages`) flags are supported. Add new options there.

**Browser lifecycle** — `crawler.js` manages Puppeteer launch, disconnect recovery (`ensureBrowser()`), and worker page recreation. Workers run concurrently via `Promise.all()`.

**URL normalization** — `crawler.js:normalizeUrl()` strips tracking params (utm_*, fbclid, gclid), trailing slashes, and hashes. URLs are normalized before dedup checks.

**Graceful shutdown** — SIGINT handler sets `shuttingDown = true`, workers finish current pages, results are saved as partial.

**Link extraction** — runs inside `page.evaluate()` (browser context). Variables must be explicitly passed in the args object — they cannot access Node.js scope.

## Gotchas

- `page.evaluate()` runs in the browser, not Node.js. Any data it needs must be passed as serializable args. If you add a new filter or config value that link extraction needs, add it to the args object at `crawler.js` near line 415.
- `reportsDir` must be resolved from `import.meta.url` via `getScriptDirs()`, not passed as a relative string, or output files will go to the wrong place when run from outside the project root.
- `excludePattern` is validated as a regex at config parse time. If adding new regex-based config options, validate them the same way.
- The `onRequestIntercept` callback in `crawler.js` expects a truthy return to indicate the request was handled. If it returns falsy, the crawler calls `request.continue()`.
- Templates in `templates/` must have a `name` field and a `directives` object mapping CSP directive names to arrays of source strings.
