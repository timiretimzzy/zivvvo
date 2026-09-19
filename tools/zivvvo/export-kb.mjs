/**
 * Build script: Export KB entries from ai-tutor-language as JSON
 * for the server to load at startup.
 */
import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Import the knowledge module (it's compiled as CJS in the workspace)
const knowledgePath = resolve(__dirname, "../../packages/ai-tutor-language/dist/knowledge.js");
let knowledge;
try {
  knowledge = await import(knowledgePath);
} catch {
  // Fallback: try the src version via tsx or ts-node
  console.log("Could not import compiled KB, trying source...");
  process.exit(1);
}

// The KB_ENTRIES is not exported directly, but retrieveKnowledge uses it internally.
// We need to extract entries by calling retrieveKnowledge with a broad query
// or by importing the module's internal entries.
// Since KB_ENTRIES is a const in the module, we can't access it directly.
// Instead, let's build a comprehensive list by querying every topic.
const topics = [
  "general-rules", "road-signs", "road-markings", "junction-rules",
  "traffic-lights", "speed-limits", "overtaking", "parking",
  "pedestrian-safety", "vehicle-equipment", "vehicle-classes",
  "towing-loads", "accident-procedures", "alcohol-drugs", "night-driving"
];

const allEntries = new Map();
for (const topic of topics) {
  const results = knowledge.retrieveKnowledge(topic, topic, []);
  for (const r of results) {
    allEntries.set(r.entry.id, r.entry);
  }
}

const entries = [...allEntries.values()];
const outPath = resolve(__dirname, "../packages/ai-tutor-language/kb-entries.json");
writeFileSync(outPath, JSON.stringify(entries, null, 2));
console.log(`Exported ${entries.length} KB entries to ${outPath}`);
