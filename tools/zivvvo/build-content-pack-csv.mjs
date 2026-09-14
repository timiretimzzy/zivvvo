#!/usr/bin/env node
/**
 * Builds content-v1.json directly from a CONTENT_READY CSV.
 * Usage: node tools/zivvvo/build-content-pack-csv.mjs path/to/file.csv
 *
 * CSV must have columns:
 *   qid, topic, topicId, concept, difficulty, stem,
 *   optionA, optionB, optionC, optionD, optionE,
 *   correctAnswer, correctIndex, explanation, hasImage, imageRef, status
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT = join(ROOT, "packages", "content", "src", "data");
const OUT_FILE = join(OUT, "content-v1.json");

/* ----------------------------- CSV reader ------------------------------ */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else inQ = false;
      } else cell += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); if (row.some((x) => x !== "")) rows.push(row); }
  return rows;
}

function clean(s) {
  if (!s) return "";
  return String(s)
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#\d+;/g, (m) => String.fromCharCode(Number(m.slice(2, -1))))
    .replace(/['']/g, "'").replace(/[""]/g, '"').replace(/[–—]/g, "-")
    .replace(/\s+/g, " ").trim();
}

/* -------------------------------- main --------------------------------- */
const csvPath = process.argv[2]
  ? resolve(process.argv[2])
  : join(ROOT, "Zivvvo_CONTENT_READY_TO_UPLOAD.csv");

console.log(`Reading CSV: ${csvPath}`);
const csvLines = parseCsv(readFileSync(csvPath, "utf8"));
const header = csvLines[0].map((h) => h.trim());
const col = (name) => header.indexOf(name);

const OPTION_LETTERS = ["A", "B", "C", "D", "E"];

const questions = [];
const topicCounts = new Map();
const conceptsSet = new Set();

for (const r of csvLines.slice(1)) {
  const qid = r[col("qid")];
  if (!qid) continue;

  const topicId = r[col("topicId")] || "general";
  const topic = r[col("topic")] || topicId;
  const status = (r[col("status")] || "").trim().toLowerCase();

  // Parse options — filter out empty ones
  const optsRaw = ["optionA", "optionB", "optionC", "optionD", "optionE"].map(
    (colName) => r[col(colName)]?.trim() || ""
  );
  const options = optsRaw.filter((o) => o !== "");

  // Parse correct index
  const ciRaw = r[col("correctIndex")]?.trim();
  const correctIndex = ciRaw !== "" && ciRaw !== undefined ? parseInt(ciRaw, 10) : null;

  // Build correctIndexes array
  const correctIndexes = [];
  if (status === "answered" && correctIndex !== null && !isNaN(correctIndex) && correctIndex < options.length) {
    correctIndexes.push(correctIndex);
  }

  // Determine effective status: single-option or no correct → skip
  const effectiveStatus = (status === "answered" && options.length < 2) ? "skip"
    : status === "answered" && correctIndex === null ? "skip"
    : status || "unanswered";

  // Concept
  const concept = r[col("concept")]?.trim() || null;
  if (concept) conceptsSet.add(concept);

  // Topic count
  topicCounts.set(topicId, (topicCounts.get(topicId) || 0) + 1);

  // Difficulty
  const difficulty = r[col("difficulty")]?.trim() || null;

  // Explanation
  const explanation = clean(r[col("explanation")] || "");

  // Image
  const imageRef = r[col("imageRef")]?.trim() || null;

  questions.push({
    qid,
    type: "single",
    stem: clean(r[col("stem")] || ""),
    options: options.map((text, i) => ({
      text,
      isCorrect: correctIndexes.includes(i),
    })),
    topicId,
    concept,
    difficulty,
    explanation,
    imageRef,
    status: effectiveStatus,
    correctIndexes: effectiveStatus === "answered" ? correctIndexes : [],
  });
}

/* -------------------------------- topics -------------------------------- */
const TOPIC_LABELS = {
  "junction-rules": "Junction Rules",
  "road-signs": "Road Signs",
  "regulations": "Regulations & Precautions",
  "traffic-lights": "Traffic Lights",
  "carriageway-lines": "Carriageway Lines",
  "vehicle-classes": "Vehicle Classes & Licences",
  "confusing-pair": "The Confusing Pair",
  "general": "General",
};

const topics = [...new Set(questions.map((q) => q.topicId))].map((id) => ({
  id,
  label: TOPIC_LABELS[id] || id,
  kind: "content",
  count: topicCounts.get(id) || 0,
}));

const concepts = [...conceptsSet].sort();

const pack = {
  version: 1,
  exam: "zvid-provisional",
  topics,
  concepts,
  questions,
  stats: {
    total: questions.length,
    answered: questions.filter((q) => q.status === "answered").length,
    withExplanation: questions.filter((q) => q.explanation).length,
    withImage: questions.filter((q) => q.imageRef).length,
  },
};

mkdirSync(OUT, { recursive: true });
writeFileSync(OUT_FILE, JSON.stringify(pack), "utf8");
console.log(`\ncontent pack -> ${OUT_FILE}`);
console.log(`  questions: ${pack.stats.total} (answered ${pack.stats.answered}, skip/unanswered ${pack.stats.total - pack.stats.answered})`);
console.log(`  topics: ${topics.length}, concepts: ${concepts.length}`);
console.log(`  withExplanation: ${pack.stats.withExplanation}, withImage: ${pack.stats.withImage}`);
for (const t of topics) console.log(`    ${t.id.padEnd(24)} ${String(t.count).padStart(4)}  (${t.kind})`);
