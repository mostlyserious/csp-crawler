import 'dotenv/config'
import fs from 'fs'
import { getCommonConfig, getScriptDirs } from './script-utils.js'
import { crawlSite as sharedCrawlSite } from './crawler.js'

const { reportsDir } = getScriptDirs(import.meta.url)
const config = getCommonConfig({ reportPrefix: 'csp-violations', reportsDir })

async function validateCSP() {
    console.log('🔍 Starting CSP crawler...')
    console.log(`📍 Base URL: ${config.baseUrl}`)

    // Collect CSP violations
    const violations = []
    const pagesWithoutCsp = new Set()

    const crawlResults = await sharedCrawlSite({
        action: 'VALIDATE Content Security Policy',
        onConsoleMessage: (msg, pageUrl) => {
            const text = msg.text()

            if (text.includes('[Report Only]') || text.includes('Content Security Policy')) {
                violations.push({
                    url: pageUrl,
                    timestamp: new Date().toISOString(),
                    violation: text,
                    type: 'console',
                })
                console.log(`🚫 CSP Violation found: ${text}`)
            }
        },
        onPageVisit: (_page, url, _depth, response) => {
            if (response) {
                const headers = response.headers()
                const cspHeader = headers['content-security-policy']
                const cspReportOnly = headers['content-security-policy-report-only']

                if (!cspHeader && !cspReportOnly && !pagesWithoutCsp.has(url)) {
                    pagesWithoutCsp.add(url)
                    console.log(`⚠️  No CSP header on document: ${url}`)
                }
            }
        },
    })

    // Save results
    const results = {
        timestamp: new Date().toISOString(),
        pagesScanned: crawlResults.pagesScanned,
        pagesRedirectedExternal: crawlResults.pagesRedirectedExternal,
        pagesWithoutCsp: Array.from(pagesWithoutCsp),
        totalViolations: violations.length,
        violations: violations,
        crawlStats: crawlResults.crawlStats,
    }

    fs.writeFileSync(config.outputFile, JSON.stringify(results, null, 2))

    console.log('Crawl Complete!')
    console.log(`Pages scanned: ${crawlResults.pagesScanned.length}`)
    console.log(`External redirects skipped: ${crawlResults.pagesRedirectedExternal?.length ?? 0}`)
    console.log(`CSP violations found: ${violations.length}`)
    console.log(`Pages without CSP header: ${pagesWithoutCsp.size}`)
    console.log(`Results saved to: ${config.outputFile}`)

    if (violations.length > 0) {
        console.log('\n🔍 Unique violation types:')
        const uniqueViolations = [ ...new Set(violations.map(v => v.violation)) ]

        uniqueViolations.forEach(v => console.log(`   - ${v}`))
    }
}

validateCSP().catch(error => {
    console.error(`❌ ${error.message}`)
    process.exit(1)
})
