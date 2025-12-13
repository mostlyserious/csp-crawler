import 'dotenv/config'
import puppeteer from 'puppeteer'
import fs from 'fs'
import { getCommonConfig, getScriptDirs } from './script-utils.js'

const { reportsDir } = getScriptDirs(import.meta.url)
const config = getCommonConfig({ reportPrefix: 'csp-violations', reportsDir })

const baseOrigin = new URL(config.baseUrl).origin

async function crawlSite() {
    console.log('🔍 Starting CSP crawler...')
    console.log(`📍 Base URL: ${config.baseUrl}`)
    
    const browser = await puppeteer.launch({ 
        headless: config.headless,
        devtools: false, 
    })
    
    const page = await browser.newPage()

    await page.setRequestInterception(true)

    page.on('request', request => {
        if (request.frame() === page.mainFrame() && request.resourceType() === 'document') {
            try {
                if (new URL(request.url()).origin !== baseOrigin) {
                    request.abort()

                    return
                }
            } catch (_e) {
                request.abort()

                return
            }
        }

        request.continue()
    })
    
    // Collect CSP violations
    const violations = []
    const pagesWithoutCsp = new Set()
    
    page.on('response', response => {
        const request = response.request()

        if (request.resourceType() !== 'document') {return}

        const url = response.url()

        try {
            if (new URL(url).origin !== baseOrigin) {return}
        } catch (_e) {
            return
        }

        const headers = response.headers()
        const cspHeader = headers['content-security-policy']
        const cspReportOnly = headers['content-security-policy-report-only']

        if (!cspHeader && !cspReportOnly && !pagesWithoutCsp.has(url)) {
            pagesWithoutCsp.add(url)
            console.log(`⚠️  No CSP header on document: ${url}`)
        }
    })
    
    // Listen for console errors (including CSP violations)
    page.on('console', msg => {
        const text = msg.text()

        if (text.includes('[Report Only]') || text.includes('Content Security Policy')) {
            violations.push({
                url: page.url(),
                timestamp: new Date().toISOString(),
                violation: text,
                type: 'console',
            })
            console.log(`🚫 CSP Violation found on ${page.url()}`)
            console.log(`   ${text}`)
        }
    })
    
    // Collect all page URLs
    const visited = new Set()
    const failed = new Set()
    const toVisit = [ config.baseUrl ]
    
    while (toVisit.length > 0 && visited.size < config.maxPages) {
        const currentUrl = toVisit.shift()
        
        if (visited.has(currentUrl)) {continue}

        if (failed.has(currentUrl)) {continue}
        
        try {
            console.log(`📄 [${visited.size + 1}] Visiting: ${currentUrl}`)
            
            await page.goto(currentUrl, { waitUntil: 'networkidle0', timeout: 30000 })
            visited.add(currentUrl)
            
            // Extract links from current page
            const links = await page.evaluate(({ baseOrigin, maxLinksPerPage }) => {
                const anchors = Array.from(document.querySelectorAll('a[href]'))

                return anchors
                    .map(a => {
                        try {
                            const rawHref = a.getAttribute('href') || ''
                            const url = new URL(rawHref, document.baseURI)

                            if (url.protocol !== 'http:' && url.protocol !== 'https:') {return null}

                            url.hash = ''

                            if (url.origin !== baseOrigin) {return null}

                            return url.toString()
                        } catch (_e) {
                            return null
                        }
                    })
                    .filter(Boolean)
                    .filter(href => !href.toLowerCase().includes('.pdf'))
                    .filter(href => !(/\.(?:jpe?g|png|gif|webp|svg|ico|bmp|tiff?|avif)(?:\?|$)/i).test(href))
                    .filter(href => !href.includes('tel:'))
                    .filter(href => !href.includes('mailto:'))
                    // Remove duplicates
                    .filter((href, index, arr) => arr.indexOf(href) === index)
                    .slice(0, maxLinksPerPage)
            }, { baseOrigin, maxLinksPerPage: config.maxLinksPerPage })
            
            // Add new links to visit queue
            const newLinks = []

            links.forEach(link => {
                if (!visited.has(link) && !failed.has(link) && !toVisit.includes(link)) {
                    toVisit.push(link)
                    newLinks.push(link)
                }
            })
            
            console.log(`   📄 Found ${links.length} total links, ${newLinks.length} new links to visit`)
            console.log(`   📊 Queue: ${toVisit.length} pages to visit, ${visited.size} visited`)
            
            // Wait a bit between requests
            await new Promise(resolve => setTimeout(resolve, 1000))
            
        } catch (error) {
            failed.add(currentUrl)
            console.log(`❌ Error visiting ${currentUrl}: ${error.message} - possible redirect or network issue.`)
        }
    }
    
    await browser.close()
    
    // Save results
    const results = {
        timestamp: new Date().toISOString(),
        pagesScanned: Array.from(visited),
        pagesWithoutCsp: Array.from(pagesWithoutCsp),
        totalViolations: violations.length,
        violations: violations,
    }
    
    fs.writeFileSync(config.outputFile, JSON.stringify(results, null, 2))
    
    console.log('Crawl Complete!')
    console.log(`Pages scanned: ${visited.size}`)
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
    crawlSite().catch(console.error)
} catch (_error) {
    console.log('❌ Puppeteer not installed. Install with:')
    console.log('   npm install puppeteer')
}
