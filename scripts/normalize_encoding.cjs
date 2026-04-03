const fs = require('fs');
const path = require('path');

const files = [
  'electron/main.js',
  'electron/preload.cjs',
  'package.json',
  'server/index.js',
  'server/database.js'
];

console.log('[Normalize] Starting strict ASCII + CRLF normalization...');

files.forEach(file => {
  const fullPath = path.resolve(file);
  if (!fs.existsSync(fullPath)) {
    console.warn(`[Normalize] File not found: ${file}`);
    return;
  }

  try {
    // 1. Read raw buffer
    const buf = fs.readFileSync(fullPath);
    
    // 2. Convert to string and strip non-ASCII (> 127)
    // Also strip BOM if present (though my manual check said no BOM, this is for safety)
    let content = buf.toString('utf8');
    
    // Remove BOM (Byte Order Mark) if it exists at the start
    if (content.charCodeAt(0) === 0xFEFF) {
      content = content.substring(1);
    }

    // Replace common non-ASCII symbols that might be used
    content = content.replace(/\u00A9/g, '(c)'); // Copyright symbol
    content = content.replace(/\u2013/g, '-');   // En dash
    content = content.replace(/\u2014/g, '--');  // Em dash
    content = content.replace(/\u2018|\u2019/g, "'"); // Smart single quotes
    content = content.replace(/\u201C|\u201D/g, '"'); // Smart double quotes
    
    // Strip all remaining non-ASCII characters
    let cleanContent = '';
    for (let i = 0; i < content.length; i++) {
      const code = content.charCodeAt(i);
      if (code <= 127) {
        cleanContent += content[i];
      }
    }

    // 3. Normalize Line Endings to CRLF (\r\n) for Windows stability
    // First convert all CRLF and CR to LF, then convert all LF to CRLF
    const normalizedLines = cleanContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '\r\n');

    // 4. Write back as raw Buffer with UTF-8 encoding (no BOM)
    fs.writeFileSync(fullPath, Buffer.from(normalizedLines, 'utf8'));
    console.log(`[Normalize] Fixed: ${file}`);
  } catch (err) {
    console.error(`[Normalize] Failed to fix ${file}:`, err.message);
  }
});

console.log('[Normalize] Complete!');
