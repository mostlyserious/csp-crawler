import path from 'path'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'url'

export function getScriptDirs(metaUrl) {
    const __dirname = path.dirname(fileURLToPath(metaUrl))

    return {
        __dirname,
        templatesDir: path.join(__dirname, '..', 'templates'),
        reportsDir: path.join(__dirname, '..', 'reports'),
    }
}

export function getTimestampedFilename(reportsDir, prefix) {
    const now = new Date()
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19)

    return path.join(reportsDir, `${prefix}-${timestamp}.json`)
}

export function parseIntOrExit(raw, name) {
    const value = parseInt(raw, 10)

    if (!Number.isFinite(value)) {
        console.error(`❌ ${name} must be a number`)
        process.exit(1)
    }

    return value
}

export function getCommonConfig({ reportPrefix, reportsDir, args = process.argv.slice(2), env = process.env }) {
    const { values } = parseArgs({
        args,
        options: {
            baseUrl: { type: 'string' },
            'base-url': { type: 'string' },
            maxPages: { type: 'string' },
            'max-pages': { type: 'string' },
            maxLinksPerPage: { type: 'string' },
            'max-links-per-page': { type: 'string' },
            maxDepth: { type: 'string' },
            'max-depth': { type: 'string' },
            headless: { type: 'boolean' },
            outputFile: { type: 'string' },
            'output-file': { type: 'string' },
            yes: { type: 'boolean' },
            skipConfirmation: { type: 'boolean' },
            concurrency: { type: 'string' },
            maxRetries: { type: 'string' },
            'max-retries': { type: 'string' },
        },
        strict: false,
        allowPositionals: true,
    })

    const cliBaseUrl = values.baseUrl || values['base-url']
    const baseUrl = cliBaseUrl || env.BASE_URL

    if (!baseUrl) {
        console.error('❌ BASE_URL environment variable is required (or pass --baseUrl)')
        process.exit(1)
    }

    const cliMaxPages = values.maxPages || values['max-pages']
    const maxPagesRaw = cliMaxPages || env.MAX_PAGES || '50000'
    const maxPages = parseIntOrExit(maxPagesRaw, 'MAX_PAGES/--maxPages')

    const cliMaxLinksPerPage = values.maxLinksPerPage || values['max-links-per-page']
    const maxLinksPerPageRaw = cliMaxLinksPerPage || env.MAX_LINKS_PER_PAGE || '1000'
    const maxLinksPerPage = parseIntOrExit(maxLinksPerPageRaw, 'MAX_LINKS_PER_PAGE/--maxLinksPerPage')

    const cliMaxDepth = values.maxDepth || values['max-depth']
    const maxDepthRaw = cliMaxDepth || env.MAX_DEPTH || '10'
    const maxDepth = parseIntOrExit(maxDepthRaw, 'MAX_DEPTH/--maxDepth')

    const cliHeadless = values.headless
    const headless = typeof cliHeadless === 'boolean' ? cliHeadless : env.HEADLESS === 'true'

    const cliOutputFile = values.outputFile || values['output-file']
    const outputFile = cliOutputFile || env.OUTPUT_FILE || getTimestampedFilename(reportsDir, reportPrefix)

    const cliSkipConfirmation = values.yes || values.skipConfirmation
    const skipConfirmation = typeof cliSkipConfirmation === 'boolean' ? cliSkipConfirmation : env.SKIP_CONFIRMATION === 'true'

    const cliConcurrency = values.concurrency
    const concurrencyRaw = cliConcurrency || env.CONCURRENCY || '5'
    const concurrency = parseIntOrExit(concurrencyRaw, 'CONCURRENCY/--concurrency')

    const cliMaxRetries = values.maxRetries || values['max-retries']
    const maxRetriesRaw = cliMaxRetries || env.MAX_RETRIES || '2'
    const maxRetries = parseIntOrExit(maxRetriesRaw, 'MAX_RETRIES/--max-retries')

    return {
        baseUrl,
        maxPages,
        maxLinksPerPage,
        maxDepth,
        outputFile,
        headless,
        skipConfirmation,
        concurrency,
        maxRetries,
    }
}
