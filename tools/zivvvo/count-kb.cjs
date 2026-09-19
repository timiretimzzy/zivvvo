const fs = require('fs');
const src = fs.readFileSync('./packages/ai-tutor-language/src/knowledge.ts', 'utf8');
const matches = src.match(/id: "KB-\d+"/g);
console.log('Total KB entries:', matches ? matches.length : 0);
const startIdx = src.indexOf('const KB_ENTRIES');
const endIdx = src.indexOf('];', startIdx) + 2;
const entriesSrc = src.slice(startIdx, endIdx);
console.log('Entries source size:', (entriesSrc.length / 1024).toFixed(1), 'KB');
