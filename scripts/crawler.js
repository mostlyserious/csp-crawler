import puppeteer from 'puppeteer'
import readline from 'readline'
import { getCommonConfig } from './script-utils.js'

// Confirmation helper function
function prompt(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    })

    return new Promise(resolve => {
        rl.question(question, answer => {
            rl.close()
            resolve(answer.toLowerCase().trim())
        })
    })
}

async function confirmCrawl(config, action) {
    console.log('\n📋 Crawl Configuration:')
    console.log(`   Action: ${action}`)
    console.log(`   URL: ${config.baseUrl}`)
    console.log(`   Max Pages: ${config.maxPages}`)
    console.log(`   Max Links Per Page: ${config.maxLinksPerPage}`)
    console.log(`   Max Depth: ${config.maxDepth}`)
    console.log(`   Headless: ${config.headless}`)
    
    const answer = await prompt('\nAre you ready to proceed? (y/n): ')

    return answer === 'y' || answer === 'yes'
}

/**
 * Shared web crawler utility for CSP analysis
 * @param {Object} options - Crawler configuration
 * @param {string} options.baseUrl - Starting URL
 * @param {number} options.maxPages - Maximum pages to crawl
 * @param {number} options.maxLinksPerPage - Maximum links to extract per page
 * @param {number} options.maxDepth - Maximum crawl depth
 * @param {boolean} options.headless - Run browser headless
 * @param {Function} options.onPageVisit - Callback for each page visit
 * @param {Function} options.onRequestIntercept - Optional request interception callback
 * @param {Function} options.onConsoleMessage - Optional console message callback
 * @param {string} options.action - Action description for confirmation (e.g., "VALIDATE", "CREATE")
 * @param {boolean} options.skipConfirmation - Skip confirmation prompt (default: false)
 * @returns {Promise<Object>} Crawl results
 */
export async function crawlSite(options = {}) {
    const config = getCommonConfig({ 
        reportPrefix: 'csp-crawl', 
        reportsDir: './reports',
        args: options.args || [],
        env: options.env || process.env,
    })
    
    const baseOrigin = new URL(config.baseUrl).origin
    
    // Confirmation prompt
    if (!options.skipConfirmation && !config.skipConfirmation) {
        const confirmed = await confirmCrawl(config, options.action || 'ANALYZE')

        if (!confirmed) {
            console.log('❌ Crawl cancelled by user.')
            process.exit(0)
        }
    }
    
    console.log('🔍 Starting crawler...')
    console.log(`📍 Base URL: ${config.baseUrl}`)
    
    const browser = await puppeteer.launch({ 
        headless: config.headless,
        devtools: false, 
    })
    
    const page = await browser.newPage()

    await page.setRequestInterception(true)

    // Set up request interception
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

        // Call custom request interceptor if provided
        if (options.onRequestIntercept) {
            options.onRequestIntercept(request)
        }

        request.continue()
    })

    // Set up console message listener if provided
    if (options.onConsoleMessage) {
        page.on('console', options.onConsoleMessage)
    }

    // Initialize crawl state
    const visited = new Set()
    const failed = new Set()
    const toVisit = [ { url: config.baseUrl, depth: 0 } ]
    const crawlStats = {
        pagesScanned: 0,
        linksFound: 0,
        newLinksFound: 0,
        errors: [],
    }

    // Main crawling loop
    while (toVisit.length > 0 && visited.size < config.maxPages) {
        const current = toVisit.shift()
        const currentUrl = current.url
        const currentDepth = current.depth
        
        if (visited.has(currentUrl)) {continue}

        if (failed.has(currentUrl)) {continue}
        
        if (currentDepth > config.maxDepth) {
            console.log(`🔚 Skipping ${currentUrl} - max depth (${config.maxDepth}) reached`)
            continue
        }
        
        try {
            console.log(`📄 [${visited.size + 1}] Visiting: ${currentUrl} (depth: ${currentDepth})`)
            
            await page.goto(currentUrl, { waitUntil: 'networkidle0', timeout: 30000 })
            visited.add(currentUrl)
            crawlStats.pagesScanned++

            // Call page visit callback
            if (options.onPageVisit) {
                await options.onPageVisit(page, currentUrl, currentDepth)
            }
            
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
                    .filter((href, index, arr) => arr.indexOf(href) === index)
                    .slice(0, maxLinksPerPage)
            }, { baseOrigin, maxLinksPerPage: config.maxLinksPerPage })
            
            // Add new links to visit queue
            const newLinks = []

            links.forEach(link => {
                if (!visited.has(link) && !failed.has(link) && !toVisit.some(item => item.url === link)) {
                    toVisit.push({ url: link, depth: currentDepth + 1 })
                    newLinks.push(link)
                }
            })
            
            crawlStats.linksFound += links.length
            crawlStats.newLinksFound += newLinks.length
            
            console.log(`   📄 Found ${links.length} total links, ${newLinks.length} new links to visit`)
            console.log(`   📊 Queue: ${toVisit.length} pages to visit, ${visited.size} visited`)
            
            // Wait between requests
            await new Promise(resolve => setTimeout(resolve, 1000))
            
        } catch (error) {
            failed.add(currentUrl)
            const errorMsg = `❌ Error visiting ${currentUrl}: ${error.message} - possible redirect or network issue.`

            console.log(errorMsg)
            crawlStats.errors.push({ url: currentUrl, error: error.message })
        }
    }
    
    await browser.close()
    
    console.log('Crawl Complete!')
    console.log(`Pages scanned: ${visited.size}`)
    console.log(`Total links found: ${crawlStats.linksFound}`)
    console.log(`New links discovered: ${crawlStats.newLinksFound}`)
    console.log(`Errors encountered: ${crawlStats.errors.length}`)
    
    return {
        timestamp: new Date().toISOString(),
        pagesScanned: Array.from(visited),
        pagesFailed: Array.from(failed),
        crawlStats,
        config: {
            baseUrl: config.baseUrl,
            maxPages: config.maxPages,
            maxDepth: config.maxDepth,
            maxLinksPerPage: config.maxLinksPerPage,
        },
    }
}
