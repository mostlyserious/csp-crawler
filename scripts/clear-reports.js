import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const reportsDir = path.join(__dirname, '..', 'reports')

if (!fs.existsSync(reportsDir)) {
    console.log('No reports directory found.')
    process.exit(0)
}

const files = fs.readdirSync(reportsDir)
let deleted = 0

for (const file of files) {
    if (file === '.gitkeep') {continue}

    fs.unlinkSync(path.join(reportsDir, file))
    deleted++
}

console.log(`🗑️  Deleted ${deleted} report(s)`)
