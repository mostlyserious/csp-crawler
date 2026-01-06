import 'dotenv/config'
import fs from 'fs'
import { getCommonConfig } from './script-utils.js'
import { crawlSite as sharedCrawlSite } from './crawler.js'

const config = getCommonConfig({ reportPrefix: 'csp-violations', reportsDir: './reports' })
const _baseOrigin = new URL(config.baseUrl).origin

async function validateCSP() {
    console.log('🔍 Starting CSP crawler...')
    console.log(`📍 Base URL: ${config.baseUrl}`)
    
    // Collect CSP violations
    const violations = []
    const pagesWithoutCsp = new Set()
    
    const crawlResults = await sharedCrawlSite({
        action: 'VALIDATE Content Security Policy',
        onRequestIntercept: _request => {
            // No special request handling needed for validation
        },
        onConsoleMessage: msg => {
            const text = msg.text()

            if (text.includes('[Report Only]') || text.includes('Content Security Policy')) {
                violations.push({
                    url: msg.page()?.url() || 'unknown',
                    timestamp: new Date().toISOString(),
                    violation: text,
                    type: 'console',
                })
                console.log(`🚫 CSP Violation found: ${text}`)
            }
        },
        onPageVisit: async (page, url, _depth) => {
            // Check for CSP headers on the page
            try {
                const response = await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 })

                if (response) {
                    const headers = response.headers()
                    const cspHeader = headers['content-security-policy']
                    const cspReportOnly = headers['content-security-policy-report-only']
                    
                    if (!cspHeader && !cspReportOnly && !pagesWithoutCsp.has(url)) {
                        pagesWithoutCsp.add(url)
                        console.log(`⚠️  No CSP header on document: ${url}`)
                    }
                }
            } catch (error) {
                console.log(`❌ Error checking CSP headers for ${url}: ${error.message}`)
            }
        },
    })
    
    // Save results
    const results = {
        timestamp: new Date().toISOString(),
        pagesScanned: crawlResults.pagesScanned,
        pagesWithoutCsp: Array.from(pagesWithoutCsp),
        totalViolations: violations.length,
        violations: violations,
        crawlStats: crawlResults.crawlStats,
    }
    
    fs.writeFileSync(config.outputFile, JSON.stringify(results, null, 2))
    
    console.log('Crawl Complete!')
    console.log(`Pages scanned: ${crawlResults.pagesScanned.length}`)
    console.log(`CSP violations found: ${violations.length}`)
    console.log(`Pages without CSP header: ${pagesWithoutCsp.size}`)
    console.log(`Results saved to: ${config.outputFile}`)
    
    if (violations.length > 0) {
        console.log('\n🔍 Unique violation types:')
        const uniqueViolations = [ ...new Set(violations.map(v => v.violation)) ]

        uniqueViolations.forEach(v => console.log(`   - ${v}`))
    }
}

// Check if puppeteer is available
try {
    validateCSP().catch(console.error)
} catch (_error) {
    console.log('❌ Puppeteer not installed. Install with:')
    console.log('   npm install puppeteer')
}
