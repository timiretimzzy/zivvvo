import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');

const csvPath = process.argv[2] || path.join(projectRoot, '../Zivvvo_NUGGETS_SERIOUS_UPGRADE.csv');
const outputPath = path.join(projectRoot, 'apps/web/src/data/nuggets.json');

if (!fs.existsSync(csvPath)) {
  console.error('CSV not found:', csvPath);
  process.exit(1);
}

const csv = fs.readFileSync(csvPath, 'utf8');
const lines = [];
let current = '';
let inQuotes = false;
for (let i = 0; i < csv.length; i++) {
  const ch = csv[i];
  if (ch === '"') { inQuotes = !inQuotes; current += ch; }
  else if (ch === '\n' && !inQuotes) { lines.push(current); current = ''; }
  else { current += ch; }
}
if (current.trim()) lines.push(current);

const nuggets = [];
for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  let fields = [];
  let field = '';
  let inQ = false;
  for (let j = 0; j < line.length; j++) {
    const c = line[j];
    if (c === '"') { inQ = !inQ; }
    else if (c === ',' && !inQ) { fields.push(field); field = ''; }
    else { field += c; }
  }
  fields.push(field);
  if (fields.length >= 4 && fields[0]) {
    nuggets.push({
      id: fields[0],
      topicId: fields[1],
      title: fields[2],
      text: fields[3],
      imageRef: fields[4] || null,
    });
  }
}

const byTopic = {};
for (const n of nuggets) {
  if (!byTopic[n.topicId]) byTopic[n.topicId] = [];
  byTopic[n.topicId].push(n);
}
console.log('Total nuggets:', nuggets.length);
for (const [k, v] of Object.entries(byTopic)) {
  const withImg = v.filter(n => n.imageRef).length;
  console.log('  ' + k + ': ' + v.length + ' (' + withImg + ' with images)');
}
fs.writeFileSync(outputPath, JSON.stringify(nuggets, null, 2));
console.log('Written to', outputPath);
