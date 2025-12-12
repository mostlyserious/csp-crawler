import 'dotenv/config';
import puppeteer from 'puppeteer';
import fs from 'fs';

if (!process.env.BASE_URL) {
    console.error('❌ BASE_URL environment variable is required');
    process.exit(1);
}

const config = {
    baseUrl: process.env.BASE_URL,
    maxPages: parseInt(process.env.MAX_PAGES || '1000', 10),
    outputFile: process.env.OUTPUT_FILE || 'csp-violations-detailed.json',
    headless: process.env.HEADLESS === 'true'
};

async function crawlSite() {
    console.log('🔍 Starting CSP crawler...');
    
    const browser = await puppeteer.launch({ 
        headless: config.headless,
        devtools: false 
    });
    
    const page = await browser.newPage();
    
    // Collect CSP violations
    const violations = [];
    
    page.on('response', response => {
        const cspHeader = response.headers()['content-security-policy-report-only'];
        if (!cspHeader) {
            console.log(`⚠️  No CSP header on: ${response.url()}`);
        }
    });
    
    // Listen for console errors (including CSP violations)
    page.on('console', msg => {
        const text = msg.text();
        if (text.includes('[Report Only]') || text.includes('Content Security Policy')) {
            violations.push({
                url: page.url(),
                timestamp: new Date().toISOString(),
                violation: text,
                type: 'console'
            });
            console.log(`🚫 CSP Violation found on ${page.url()}`);
            console.log(`   ${text}`);
        }
    });
    
    // Collect all page URLs
    const visited = new Set();
    const toVisit = [config.baseUrl];
    
    while (toVisit.length > 0 && visited.size < config.maxPages) {
        const currentUrl = toVisit.shift();
        
        if (visited.has(currentUrl)) continue;
        
        try {
            console.log(`📄 [${visited.size + 1}] Visiting: ${currentUrl}`);
            
            await page.goto(currentUrl, { waitUntil: 'networkidle0', timeout: 30000 });
            visited.add(currentUrl);
            
            // Extract links from current page
            const links = await page.evaluate((baseUrl) => {
                const anchors = Array.from(document.querySelectorAll('a[href]'));
                return anchors
                    .map(a => {
                        // Clean the URL - remove fragments but keep query params
                        const url = new URL(a.href);
                        url.hash = ''; // Remove fragment (#section)
                        return url.toString();
                    })
                    .filter(href => href.startsWith(baseUrl))
                    .filter(href => !href.includes('tel:'))
                    .filter(href => !href.includes('mailto:'))
                    .filter(href => !href.includes('.pdf'))
                    .filter(href => !href.includes('.jpg'))
                    .filter(href => !href.includes('.png'))
                    // Remove duplicates
                    .filter((href, index, arr) => arr.indexOf(href) === index)
                    .slice(0, 25); // Increased from 10 to 25 links per page
            }, config.baseUrl);
            
            // Add new links to visit queue
            const newLinks = [];
            links.forEach(link => {
                if (!visited.has(link) && !toVisit.includes(link)) {
                    toVisit.push(link);
                    newLinks.push(link);
                }
            });
            
            console.log(`   📄 Found ${links.length} total links, ${newLinks.length} new links to visit`);
            console.log(`   📊 Queue: ${toVisit.length} pages to visit, ${visited.size} visited`);
            
            // Wait a bit between requests
            await new Promise(resolve => setTimeout(resolve, 1000));
            
        } catch (error) {
            console.log(`❌ Error visiting ${currentUrl}: ${error.message}`);
        }
    }
    
    await browser.close();
    
    // Save results
    const results = {
        timestamp: new Date().toISOString(),
        pagesScanned: Array.from(visited),
        totalViolations: violations.length,
        violations: violations
    };
    
    fs.writeFileSync(config.outputFile, JSON.stringify(results, null, 2));
    
    console.log('\n🏁 Crawl Complete!');
    console.log(`📊 Pages scanned: ${visited.size}`);
    console.log(`🚫 CSP violations found: ${violations.length}`);
    console.log(`📄 Results saved to: ${config.outputFile}`);
    
    if (violations.length > 0) {
        console.log('\n🔍 Unique violation types:');
        const uniqueViolations = [...new Set(violations.map(v => v.violation))];
        uniqueViolations.forEach(v => console.log(`   - ${v}`));
    }
}

// Check if puppeteer is available
try {
    crawlSite().catch(console.error);
} catch (error) {
    console.log('❌ Puppeteer not installed. Install with:');
    console.log('   npm install puppeteer');
}
