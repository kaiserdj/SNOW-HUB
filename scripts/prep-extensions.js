const fs = require('fs')
const path = require('path')
const unzipper = require('unzipper')

const EXTENSIONS_DIR = path.join(__dirname, '..', 'extensions')

// Ensures directory exists
if (!fs.existsSync(EXTENSIONS_DIR)) {
  fs.mkdirSync(EXTENSIONS_DIR, { recursive: true })
}

async function extractCrx(filePath, outputDir) {
  return new Promise((resolve, reject) => {
    const data = fs.readFileSync(filePath)
    
    // Validate magic number
    const magic = data.toString('utf8', 0, 4)
    if (magic !== 'Cr24') {
      return reject(new Error('Invalid CRX magic number'))
    }
    
    // Find the classic ZIP header (PK\x03\x04) which is [0x50, 0x4B, 0x03, 0x04]
    const zipHeader = Buffer.from([0x50, 0x4B, 0x03, 0x04])
    const zipOffset = data.indexOf(zipHeader)
    
    if (zipOffset === -1) {
      return reject(new Error('Could not find ZIP header inside CRX'))
    }
    
    // We slice from the ZIP header to the end
    const zipData = data.slice(zipOffset)
    
    // Create a readable stream from the buffer
    const stream = require('stream')
    const bufferStream = new stream.PassThrough()
    bufferStream.end(zipData)
    
    bufferStream
      .pipe(unzipper.Extract({ path: outputDir }))
      .on('close', resolve)
      .on('error', reject)
  })
}

async function fixPaths(dir) {
  const files = fs.readdirSync(dir)
  for (const f of files) {
    const filePath = path.join(dir, f)
    if (fs.statSync(filePath).isDirectory()) {
      await fixPaths(filePath)
    } else if (f.endsWith('.html') || f.endsWith('.js') || f.endsWith('.css')) {
      let content = fs.readFileSync(filePath, 'utf8')
      const original = content
      content = content.replace(/src="\//g, 'src="')
      content = content.replace(/href="\//g, 'href="')
      content = content.replace(/url\("\//g, 'url("')
      content = content.replace(/url\('\//g, "url('")
      content = content.replace(/url\(\//g, 'url(')
      
      if (content !== original) {
        fs.writeFileSync(filePath, content, 'utf8')
      }
    }
  }
}

async function main() {
  const files = fs.readdirSync(EXTENSIONS_DIR)
  
  // List of known extensions to always patch if they exist as directories
  const knownExtensions = ['snowUtils']
  
  for (const item of files) {
    const itemPath = path.join(EXTENSIONS_DIR, item)
    if (fs.statSync(itemPath).isDirectory()) {
      console.log(`Patching paths in directory: ${item}...`)
      await fixPaths(itemPath)
      if (fs.existsSync(path.join(itemPath, '.git'))) {
        console.log(`Note: ${item} is a git repository. Paths patched for Electron compatibility.`)
      }
      continue
    }

    if (item.endsWith('.crx')) {
      const outputName = item.replace('.crx', '')
      const outputDir = path.join(EXTENSIONS_DIR, outputName)

      if (!fs.existsSync(outputDir)) {
        console.log(`Extracting ${item} to ${outputDir}...`)
        try {
          await extractCrx(itemPath, outputDir)
          await fixPaths(outputDir)
          console.log(`Successfully extracted and patched ${item}`)
        } catch (e) {
          console.error(`Failed to extract ${item}:`, e.message)
        }
      } else {
        console.log(`${outputName} already exists. Patching paths...`)
        await fixPaths(outputDir)
      }
    }
  }
}

main()
