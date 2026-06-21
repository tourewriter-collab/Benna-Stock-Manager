const fs = require('fs');
const path = require('path');

const walkSync = (dir, filelist = []) => {
  if (dir.includes('node_modules') || dir.includes('.git') || dir.includes('dist') || dir.includes('build')) return filelist;
  fs.readdirSync(dir).forEach(file => {
    const dirFile = path.join(dir, file);
    try {
      filelist = fs.statSync(dirFile).isDirectory() ? walkSync(dirFile, filelist) : filelist.concat(dirFile);
    } catch (err) { }
  });
  return filelist;
};

const files = walkSync('.');
let modifiedCount = 0;

files.forEach(file => {
  if (!file.match(/\.(js|jsx|ts|tsx|json|html|css|sql|md|yml|yaml|cjs|mjs)$/)) return;
  // Ignore the script itself
  if (file.includes('rebrand.cjs')) return;
  
  let content = fs.readFileSync(file, 'utf8');
  let originalContent = content;

  // Replacements
  content = content.replace(/Ikiké Business Manager/g, 'Benna Projects Manager');
  content = content.replace(/ikike-business-manager/g, 'benna-projects-manager');
  content = content.replace(/Ikiké/g, 'Benna');
  content = content.replace(/Ikike/g, 'Benna');
  content = content.replace(/ikike/g, 'benna');
  content = content.replace(/IKIKE/g, 'BENNA');
  
  // Colors
  content = content.replace(/#0a0c10/g, '#001f3f');
  content = content.replace(/#1a1a1a/g, '#003366');
  
  // gold- classes to blue- classes
  content = content.replace(/gold-(\d{2,3})/g, 'blue-$1');

  if (content !== originalContent) {
    fs.writeFileSync(file, content, 'utf8');
    modifiedCount++;
    console.log('Updated: ' + file);
  }
});
console.log('Total files updated: ' + modifiedCount);
