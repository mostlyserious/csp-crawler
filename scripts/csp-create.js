import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import readline from 'readline'
import { getCommonConfig, getScriptDirs } from './script-utils.js'
import { crawlSite as sharedCrawlSite } from './crawler.js'

const { templatesDir, reportsDir } = getScriptDirs(import.meta.url)
const config = getCommonConfig({ reportPrefix: 'csp-policy', reportsDir })

const baseOrigin = new URL(config.baseUrl).origin

// Prompt helper
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

async function askYesNo(question) {
    const answer = await prompt(`${question} (y/n): `)

    return answer === 'y' || answer === 'yes'
}

// Load templates from directory
function loadTemplates() {
    const templates = []

    if (!fs.existsSync(templatesDir)) {return templates}
    
    const files = fs.readdirSync(templatesDir).filter(f => f.endsWith('.json'))

    for (const file of files) {
        try {
            const content = JSON.parse(fs.readFileSync(path.join(templatesDir, file), 'utf-8'))

            templates.push({ file, ...content })
        } catch (_e) {
            console.log(`⚠️  Could not load template: ${file}`)
        }
    }

    return templates
}

// Merge template directives into policy
function mergeTemplate(policy, template) {
    for (const [ directive, sources ] of Object.entries(template.directives)) {
        if (!policy[directive]) {
            policy[directive] = [ "'self'" ]
        }

        for (const source of sources) {
            if (!policy[directive].includes(source)) {
                policy[directive].push(source)
            }
        }
    }
}

async function createCSP() {
    console.log('🔍 Starting CSP creator...')
    console.log(`📍 Base URL: ${config.baseUrl}`)
    
    // Track external origins by directive
    const externalOrigins = {
        'script-src': new Set(),
        'style-src': new Set(),
        'img-src': new Set(),
        'font-src': new Set(),
        'connect-src': new Set(),
        'frame-src': new Set(),
        'media-src': new Set(),
        'object-src': new Set(),
        'worker-src': new Set(),
        'manifest-src': new Set(),
    }
    
    // Track if inline scripts/styles are detected
    let hasInlineScripts = false
    let hasInlineStyles = false
    
    const crawlResults = await sharedCrawlSite({
        action: 'CREATE Content Security Policy',
        onRequestIntercept: request => {
            const url = request.url()
            const resourceType = request.resourceType()
            
            try {
                const origin = new URL(url).origin
                
                if (origin !== baseOrigin && origin.startsWith('http')) {
                    switch (resourceType) {
                        case 'script':
                            externalOrigins['script-src'].add(origin)
                            break
                        case 'stylesheet':
                            externalOrigins['style-src'].add(origin)
                            break
                        case 'image':
                            externalOrigins['img-src'].add(origin)
                            break
                        case 'font':
                            externalOrigins['font-src'].add(origin)
                            break
                        case 'xhr':
                        case 'fetch':
                            externalOrigins['connect-src'].add(origin)
                            break
                        case 'sub_frame':
                            externalOrigins['frame-src'].add(origin)
                            break
                        case 'media':
                            externalOrigins['media-src'].add(origin)
                            break
                        case 'object':
                            externalOrigins['object-src'].add(origin)
                            break
                        case 'worker':
                            externalOrigins['worker-src'].add(origin)
                            break
                        case 'manifest':
                            externalOrigins['manifest-src'].add(origin)
                            break
                    }
                }
            } catch (_e) {
                // Invalid URL, skip
            }
        },
        onPageVisit: async (page, _url, _depth, _response) => {
            // Check for inline scripts and styles
            const inlineCheck = await page.evaluate(() => {
                const scripts = Array.from(document.querySelectorAll('script:not([src])'))
                const styles = Array.from(document.querySelectorAll('style'))
                const inlineStyleAttrs = Array.from(document.querySelectorAll('[style]'))
                const inlineEventHandlers = Array.from(document.querySelectorAll('[onclick], [onload], [onerror], [onmouseover], [onsubmit], [onchange], [onfocus], [onblur]'))
                
                return {
                    hasInlineScripts: scripts.some(s => s.textContent.trim().length > 0) || inlineEventHandlers.length > 0,
                    hasInlineStyles: styles.length > 0 || inlineStyleAttrs.length > 0,
                }
            })
            
            if (inlineCheck.hasInlineScripts) {hasInlineScripts = true}

            if (inlineCheck.hasInlineStyles) {hasInlineStyles = true}
        },
    })
    
    // Build CSP policy
    const policy = {}
    
    for (const [ directive, origins ] of Object.entries(externalOrigins)) {
        const originList = Array.from(origins).sort()

        if (originList.length > 0 || directive === 'script-src' || directive === 'style-src') {
            policy[directive] = [ "'self'", ...originList ]
        }
    }
    
    // Add 'unsafe-inline' if needed
    if (hasInlineScripts && policy['script-src']) {
        policy['script-src'].push("'unsafe-inline'")
    }

    if (hasInlineStyles && policy['style-src']) {
        policy['style-src'].push("'unsafe-inline'")
    }
    
    // Ensure default-src and base-uri exist
    policy['default-src'] = [ "'self'" ]
    policy['base-uri'] = [ "'self'" ]
    
    // Always include data: for img-src (data URLs are common)
    if (!policy['img-src']) {
        policy['img-src'] = [ "'self'" ]
    }

    if (!policy['img-src'].includes('data:')) {
        policy['img-src'].push('data:')
    }
    
    // Template prompts
    const templates = loadTemplates()
    const includedTemplates = []
    
    if (templates.length > 0) {
        console.log('')
        const includeTemplates = await askYesNo('Do you wish to include template sources in this report?')
        
        if (includeTemplates) {
            for (const template of templates) {
                const include = await askYesNo(`  Include ${template.name}?`)

                if (include) {
                    mergeTemplate(policy, template)
                    includedTemplates.push(template.name)
                    console.log(`    ✅ Added ${template.name}`)
                }
            }
        }
    }
    
    // Build header string
    const headerParts = []

    for (const [ directive, sources ] of Object.entries(policy)) {
        headerParts.push(`${directive} ${sources.join(' ')}`)
    }

    const headerString = headerParts.join('; ')
    
    // Save results
    const results = {
        timestamp: new Date().toISOString(),
        pagesScanned: crawlResults.pagesScanned.length,
        pagesRedirectedExternal: crawlResults.pagesRedirectedExternal,
        hasInlineScripts,
        hasInlineStyles,
        includedTemplates,
        policy,
        header: headerString,
    }
    
    fs.writeFileSync(config.outputFile, JSON.stringify(results, null, 2))
    
    console.log('\n🏁 CSP Creation Complete!')
    console.log(`📊 Pages scanned: ${crawlResults.pagesScanned.length}`)
    console.log(`📄 Results saved to: ${config.outputFile}`)
    
    if (hasInlineScripts) {
        console.log(`⚠️  Inline scripts detected - 'unsafe-inline' added to script-src`)
    }

    if (hasInlineStyles) {
        console.log(`⚠️  Inline styles detected - 'unsafe-inline' added to style-src`)
    }
    
    console.log('\n📋 Generated CSP Header:')
    console.log(headerString)
}

createCSP().catch(console.error)
