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
    console.log(`   Concurrency: ${config.concurrency}`)
    console.log(`   Max Retries: ${config.maxRetries}`)
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
 * @param {number} options.concurrency - Number of concurrent worker pages
 * @param {number} options.maxRetries - Maximum retries per page
 * @param {Function} options.onPageVisit - Callback(page, url, depth, response) for each page visit
 * @param {Function} options.onRequestIntercept - Optional request interception callback; return truthy to skip default continue
 * @param {Function} options.onConsoleMessage - Optional console message callback(msg, pageUrl)
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
    console.log(`🔀 Concurrency: ${config.concurrency}`)

    const browser = await puppeteer.launch({
        headless: config.headless,
        devtools: false,
    })

    // Create worker pages
    const workerPages = []

    for (let i = 0; i < config.concurrency; i++) {
        const page = await browser.newPage()

        await page.setRequestInterception(true)
        workerPages.push(page)
    }

    // Initialize crawl state
    const visited = new Set()
    const failed = new Set()
    const pending = new Set([ config.baseUrl ]) // O(1) lookup for queue membership
    const toVisit = [ { url: config.baseUrl, depth: 0, retries: 0 } ]
    const crawlStats = {
        pagesScanned: 0,
        linksFound: 0,
        newLinksFound: 0,
        linksTruncated: 0,
        errors: [],
    }
    let activeWorkers = 0

    // Set up each worker page with its own listeners
    for (const workerPage of workerPages) {
        let currentPageUrl = ''

        // Set up request interception
        workerPage.on('request', request => {
            if (request.frame() === workerPage.mainFrame() && request.resourceType() === 'document') {
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
                const handled = options.onRequestIntercept(request)

                if (handled) {return}
            }

            request.continue()
        })

        // Set up console message listener if provided
        if (options.onConsoleMessage) {
            workerPage.on('console', msg => {
                options.onConsoleMessage(msg, currentPageUrl)
            })
        }

        // Store a setter so the worker loop can update currentPageUrl
        workerPage._setCurrentUrl = url => { currentPageUrl = url }
    }

    // Worker function
    async function processQueue(workerPage) {
        while (true) {
            if (visited.size >= config.maxPages) {return}

            if (toVisit.length === 0) {
                if (activeWorkers === 0) {return}

                await new Promise(resolve => setTimeout(resolve, 100))

                continue
            }

            const current = toVisit.shift()
            const currentUrl = current.url
            const currentDepth = current.depth
            const retries = current.retries || 0

            pending.delete(currentUrl)

            if (visited.has(currentUrl)) {continue}

            if (failed.has(currentUrl)) {continue}

            if (currentDepth > config.maxDepth) {
                console.log(`🔚 Skipping ${currentUrl} - max depth (${config.maxDepth}) reached`)

                continue
            }

            if (visited.size >= config.maxPages) {return}

            activeWorkers++
            workerPage._setCurrentUrl(currentUrl)

            try {
                console.log(`📄 [${visited.size + 1}] Visiting: ${currentUrl} (depth: ${currentDepth})`)

                const response = await workerPage.goto(currentUrl, { waitUntil: 'networkidle0', timeout: 30000 })

                visited.add(currentUrl)
                crawlStats.pagesScanned++

                // Call page visit callback with response
                if (options.onPageVisit) {
                    await options.onPageVisit(workerPage, currentUrl, currentDepth, response)
                }

                // Extract links from current page
                const linkResult = await workerPage.evaluate(({ baseOrigin, maxLinksPerPage }) => {
                    const anchors = Array.from(document.querySelectorAll('a[href]'))

                    const allLinks = anchors
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

                    return {
                        links: allLinks.slice(0, maxLinksPerPage),
                        totalFound: allLinks.length,
                        wasTruncated: allLinks.length > maxLinksPerPage,
                    }
                }, { baseOrigin, maxLinksPerPage: config.maxLinksPerPage })

                const { links, totalFound, wasTruncated } = linkResult

                if (wasTruncated) {
                    const truncatedCount = totalFound - links.length

                    console.log(`   ⚠️  WARNING: Page has ${totalFound} links, only extracting ${links.length} (truncated ${truncatedCount})`)
                    crawlStats.linksTruncated += truncatedCount
                }

                // Add new links to visit queue
                const newLinks = []

                links.forEach(link => {
                    if (!visited.has(link) && !failed.has(link) && !pending.has(link)) {
                        toVisit.push({ url: link, depth: currentDepth + 1, retries: 0 })
                        pending.add(link)
                        newLinks.push(link)
                    }
                })

                crawlStats.linksFound += links.length
                crawlStats.newLinksFound += newLinks.length

                console.log(`   📄 Found ${links.length} total links, ${newLinks.length} new links to visit`)
                console.log(`   📊 Queue: ${toVisit.length} pages to visit, ${visited.size} visited`)
            } catch (error) {
                if (retries < config.maxRetries) {
                    toVisit.push({ url: currentUrl, depth: currentDepth, retries: retries + 1 })
                    pending.add(currentUrl)
                    console.log(`🔄 Retry ${retries + 1}/${config.maxRetries} queued for ${currentUrl}`)
                } else {
                    failed.add(currentUrl)
                    const errorMsg = `❌ Error visiting ${currentUrl}: ${error.message} - possible redirect or network issue.`

                    console.log(errorMsg)
                    crawlStats.errors.push({ url: currentUrl, error: error.message })
                }
            } finally {
                activeWorkers--
            }

            // Wait between requests
            await new Promise(resolve => setTimeout(resolve, 1000))
        }
    }

    // Run all workers concurrently
    await Promise.all(workerPages.map(p => processQueue(p)))

    await browser.close()

    // Warn if crawl stopped due to maxPages limit
    const abandonedUrls = toVisit.map(item => item.url)

    if (abandonedUrls.length > 0) {
        console.log('')
        console.log('⚠️  WARNING: Crawl stopped due to maxPages limit!')
        console.log(`   ${abandonedUrls.length} URLs were discovered but never visited.`)
        console.log(`   Increase --max-pages (currently ${config.maxPages}) to crawl more pages.`)
    }

    if (crawlStats.linksTruncated > 0) {
        console.log('')
        console.log(`⚠️  WARNING: ${crawlStats.linksTruncated} links were truncated due to maxLinksPerPage limit.`)
        console.log(`   Increase --max-links-per-page (currently ${config.maxLinksPerPage}) to extract more links per page.`)
    }

    console.log('')
    console.log('Crawl Complete!')
    console.log(`Pages scanned: ${visited.size}`)
    console.log(`Total links found: ${crawlStats.linksFound}`)
    console.log(`New links discovered: ${crawlStats.newLinksFound}`)
    console.log(`Errors encountered: ${crawlStats.errors.length}`)

    if (abandonedUrls.length > 0) {
        console.log(`URLs abandoned (not visited): ${abandonedUrls.length}`)
    }

    return {
        timestamp: new Date().toISOString(),
        pagesScanned: Array.from(visited),
        pagesFailed: Array.from(failed),
        pagesAbandoned: abandonedUrls,
        crawlStats,
        config: {
            baseUrl: config.baseUrl,
            maxPages: config.maxPages,
            maxDepth: config.maxDepth,
            maxLinksPerPage: config.maxLinksPerPage,
            concurrency: config.concurrency,
            maxRetries: config.maxRetries,
        },
    }
}
