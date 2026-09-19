/**
 * Build script: Extract KB entries from knowledge.ts and export as JSON.
 * Run: node tools/zivvvo/export-kb.cjs
 */
const fs = require('fs');
const path = require('path');

const srcPath = path.resolve(__dirname, '../../packages/ai-tutor-language/src/knowledge.ts');
const outPath = path.resolve(__dirname, '../../packages/ai-tutor-language/kb-entries.json');

const src = fs.readFileSync(srcPath, 'utf8');

// Extract the KB_ENTRIES array by finding the start and end
const startMarker = 'const KB_ENTRIES: KnowledgeEntry[] = [';
const startIdx = src.indexOf(startMarker);
if (startIdx < 0) {
  console.error('Could not find KB_ENTRIES in source');
  process.exit(1);
}

// Find the opening bracket of the array literal (after the = sign)
const eqIdx = src.indexOf('= [', startIdx);
const arrStart = eqIdx + 2; // position of the '[' after '='
let depth = 0;
for (let i = arrStart; i < src.length; i++) {
  if (src[i] === '[') depth++;
  if (src[i] === ']') depth--;
  if (depth === 0) { endIdx = i + 1; break; }
}

if (endIdx < 0) {
  console.error('Could not find end of KB_ENTRIES');
  process.exit(1);
}

const entriesCode = src.slice(arrStart, endIdx)
  .replace(/:\s*KnowledgeEntry\[\]/g, '')
  .replace(/:\s*KnowledgeEntry/g, '');

// Log first 200 chars to debug
console.log('Extracted code starts with:', entriesCode.substring(0, 200));
console.log('Extracted code ends with:', entriesCode.substring(entriesCode.length - 100));

// Evaluate the array (it's valid JS object literal syntax)
const KB_ENTRIES = eval(entriesCode);
console.log('Type:', typeof KB_ENTRIES, 'IsArray:', Array.isArray(KB_ENTRIES));
if (Array.isArray(KB_ENTRIES)) {
  console.log('Length:', KB_ENTRIES.length);
  if (KB_ENTRIES.length > 0) console.log('First entry:', JSON.stringify(KB_ENTRIES[0]).substring(0, 100));
}

console.log(`Extracted ${KB_ENTRIES.length} KB entries`);

fs.writeFileSync(outPath, JSON.stringify(KB_ENTRIES, null, 2));
console.log(`Written to ${outPath}`);
console.log(`Size: ${(fs.statSync(outPath).size / 1024).toFixed(1)} KB`);
