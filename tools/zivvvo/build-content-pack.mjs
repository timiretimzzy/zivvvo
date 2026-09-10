#!/usr/bin/env node
/**
 * Builds the Zivvvo content pack (content-v1.json) from the validated research
 * data in data/primaed. This is the ONLY place learning content is generated;
 * the web + packages read the pack, never the raw scrape.
 *
 * Inputs:
 *   - data/primaed/parsed_quizzes_enriched.json  (questions + options per quiz)
 *   - data/primaed/question_bank_filled.csv      (correct answer text + status)
 *   - data/primaed/answerkey/rules.json          (concept taxonomy + multi-answers)
 * Output:
 *   - packages/content/src/data/content-v1.json
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATA = join(ROOT, "data", "primaed");
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

/* --------------------------- normalizer -------------------------------- */
function norm(s) {
  if (!s) return "";
  s = String(s);
  s = s.replace(/&#\d+;/g, (m) => String.fromCharCode(Number(m.slice(2, -1))));
  s = s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ");
  s = s.replace(/[\uFFFD][\uFFFD]*[Tt]?/g, "'"); // broken multibyte apostrophes
  s = s.replace(/[’‘]/g, "'").replace(/[“”]/g, '"');
  s = s.replace(/[–—]/g, "-");
  s = s.replace(/\s+/g, " ").trim().toLowerCase();
  s = s.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "");
  return s;
}

/* --------------------------- taxonomy maps ----------------------------- */
const QUIZ_TOPIC = [
  [/^junction-rules/, "junction-rules", "Junction Rules", "content"],
  [/^road-signs/, "road-signs", "Road Signs", "content"],
  [/^regulations-and-precautions/, "regulations", "Regulations & Precautions", "content"],
  [/^traffic-lights/, "traffic-lights", "Traffic Lights", "content"],
  [/^carriageway-lines/, "carriageway-lines", "Carriageway Lines", "content"],
  [/^avicii-patch/, "vehicle-classes", "Vehicle Classes & Licences", "content"],
  [/^the-confusing-pair/, "confusing-pair", "The Confusing Pair", "content"],
  [/^difficult-questions/, "difficult-questions", "Difficult Questions", "mixed"],
  [/^supercut/, "supercut", "Supercut", "mixed"],
  [/^training-wheels/, "training-wheels", "Training Wheels", "mixed"],
  [/^meinertzhagens-haversack/, "course-agreements", "Course Agreements", "mixed"],
  [/^mock-test/, "mock", "Mock Tests", "mixed"],
  [/^quiz-practice/, "practice", "Practice", "mixed"],
  [/^checkpoint/, "checkpoint", "Checkpoints", "mixed"],
];
const CATEGORY_TOPIC = {
  "Regulations & Precautions": ["regulations", "Regulations & Precautions", "content"],
  "Road Signs": ["road-signs", "Road Signs", "content"],
  "Junction Rules": ["junction-rules", "Junction Rules", "content"],
  "Traffic Lights": ["traffic-lights", "Traffic Lights", "content"],
  "Carriageway Lines": ["carriageway-lines", "Carriageway Lines", "content"],
  "Other": ["general", "General", "content"],
};
const TOPIC_PRIORITY = [
  "junction-rules", "road-signs", "regulations", "traffic-lights",
  "carriageway-lines", "vehicle-classes", "confusing-pair",
];

function topicForSlug(slug) {
  for (const [re, id, label, kind] of QUIZ_TOPIC) if (re.test(slug)) return [id, label, kind];
  return null;
}

/* ------------------------------ read data ------------------------------ */
const readJson = (p) => JSON.parse(readFileSync(p, "utf8").replace(/^\uFEFF/, ""));
const enriched = readJson(join(DATA, "parsed_quizzes_enriched.json"));
const rules = JSON.parse(readFileSync(join(DATA, "answerkey", "rules.json"), "utf8"));
const csvLines = parseCsv(readFileSync(join(DATA, "question_bank_filled.csv"), "utf8"));
const csvHeader = csvLines[0].map((h) => h.trim());
const col = (name) => csvHeader.indexOf(name);

/* csv row -> per qid */
const csvByQid = new Map();
for (const r of csvLines.slice(1)) {
  const qid = r[col("question_post_id")];
  if (!qid) continue;
  const entry = {
    quiz: r[col("quiz")],
    category: r[col("category")],
    correctAnswer: r[col("correct_answer")] || "",
    status: (r[col("status")] || "").trim() || "unanswered",
    imageFile: r[col("image_file")] || "",
    imageUrl: r[col("image_url")] || "",
    explanation: r[col("explanation")] || "",
    hasExplanation: /^true$/i.test(r[col("has_explanation")] || ""),
  };
  if (!csvByQid.has(qid)) csvByQid.set(qid, []);
  csvByQid.get(qid).push(entry);
}

/* rules concepts: normalized stem -> { concept, accepted: string[] } */
const ruleByStem = new Map();
for (const [concept, map] of Object.entries(rules)) {
  for (const stem of Object.keys(map)) {
    ruleByStem.set(norm(stem), {
      concept,
      accepted: Array.isArray(map[stem]) ? map[stem].map(String) : [String(map[stem])],
    });
  }
}

/* ------------------------------- build --------------------------------- */
const questionMap = new Map();
const topicsUsed = new Map();

function mentionTopic(id, label, kind) {
  if (!topicsUsed.has(id)) topicsUsed.set(id, { id, label, kind, count: 0 });
  topicsUsed.get(id).count++;
}

for (const quiz of enriched) {
  const slug = quiz.name || "";
  const qt = topicForSlug(slug);
  if (!quiz.questions) continue;
  for (const q of quiz.questions) {
    const qid = String(q.question_post_id);
    const existing = questionMap.get(qid);
    const opts = (q.options || []).map((o) => o.text);
    if (!existing) {
      questionMap.set(qid, {
        qid,
        type: q.type || "unknown",
        stem: q.text || "",
        options: opts,
        correctIndexes: [],
        topicIds: [],
        quizzes: [slug],
        difficulty: qt && qt[2] === "content" ? "standard" : null,
      });
    } else {
      existing.quizzes.push(slug);
      if (!existing.options.length && opts.length) existing.options = opts;
    }
  }
}

const questions = [];
for (const q of questionMap.values()) {
  const csvRows = csvByQid.get(q.qid) || [];
  const csvAns = csvRows.map((r) => r.correctAnswer).find((a) => a !== "") ?? "";

  /* topic: prefer quiz-slug content topic */
  let topic = null;
  const mapped = q.quizzes.map(topicForSlug).filter(Boolean);
  for (const id of TOPIC_PRIORITY) {
    const hit = mapped.find(([t]) => t === id);
    if (hit) { topic = [hit[0], hit[1], hit[2]]; break; }
  }
  if (!topic) {
    for (const r of csvRows) {
      const ct = CATEGORY_TOPIC[r.category];
      if (ct) { topic = ct; break; }
    }
  }

  /* difficulty proxy */
  let difficulty = null;
  if (q.quizzes.some((s) => /^(supercut|difficult-questions)/.test(s))) difficulty = "hard";
  else if (q.quizzes.some((s) => /^training-wheels/.test(s))) difficulty = "easy";
  else if (q.difficulty) difficulty = "standard";

  /* correct indexes via CSV answer text only when CSV marked answered */
  const csvStatus = csvRows.some((r) => r.status === "answered")
    ? "answered"
    : csvRows.some((r) => r.status === "skip") ? "skip" : "unanswered";
  const correctIndexes = [];
  if (csvStatus === "answered" && csvAns) {
    const idx = q.options.findIndex((o) => norm(o) === norm(csvAns));
    if (idx >= 0 && !correctIndexes.includes(idx)) correctIndexes.push(idx);
  }
  const ruleHit = ruleByStem.get(norm(q.stem));
  let concept = null;
  if (ruleHit) {
    concept = ruleHit.concept;
    if (csvStatus === "answered") {
      for (const a of ruleHit.accepted) {
        const idx = q.options.findIndex((o) => norm(o) === norm(a));
        if (idx >= 0 && !correctIndexes.includes(idx)) correctIndexes.push(idx);
      }
    }
  }

  /* explanation */
  const csvExp = csvRows.find((r) => r.explanation)?.explanation ?? "";
  const explanation = clean(csvExp || q.explanation || "");

  const imageRef = csvRows.find((r) => r.imageFile || r.imageUrl)?.imageFile
    || csvRows.find((r) => r.imageFile || r.imageUrl)?.imageUrl
    || null;

  /* single-option "coaching" rows are informational, not answerable MCQs */
  const status = csvStatus === "answered" && q.options.length < 2 ? "skip" : csvStatus;

  /* only answered questions carry answer keys (skip/unanswered stay clean) */
  const finalKeys = status === "answered" ? [...correctIndexes].sort((a, b) => a - b) : [];

  const picture = {
    ...q,
    topicId: topic ? topic[0] : "general",
    concept,
    difficulty,
    explanation,
    imageRef,
    status,
    correctIndexes: finalKeys,
    options: q.options.map((text) => ({ text, isCorrect: finalKeys.includes(q.options.indexOf(text)) })),
  };
  delete picture.quizzes;
  delete picture.optionsRaw;
  delete picture.topicIds;
  delete picture.difficulty;
  const final = {
    qid: picture.qid,
    type: picture.type,
    stem: picture.stem,
    options: picture.options,
    topicId: picture.topicId,
    concept: picture.concept,
    difficulty,
    explanation: picture.explanation,
    imageRef: picture.imageRef,
    status: picture.status,
    correctIndexes: picture.correctIndexes,
  };
  questions.push(final);
  if (topic) mentionTopic(topic[0], topic[1], topic[2]);
  else mentionTopic("general", "General", "content");
}

/* topics: keep used ones, but always expose the canonical content set */
const wantTopics = ["junction-rules", "road-signs", "regulations", "traffic-lights", "carriageway-lines", "general", "vehicle-classes"];
for (const id of wantTopics) {
  if (!topicsUsed.has(id)) {
    const label = { "junction-rules": "Junction Rules", "road-signs": "Road Signs", regulations: "Regulations & Precautions", "traffic-lights": "Traffic Lights", "carriageway-lines": "Carriageway Lines", general: "General", "vehicle-classes": "Vehicle Classes & Licences" }[id];
    topicsUsed.set(id, { id, label, kind: "content", count: 0 });
  }
}
const topics = [...topicsUsed.values()].map((t) => ({ ...t, count: 0 }));
const topicCount = new Map();
for (const q of questions) topicCount.set(q.topicId, (topicCount.get(q.topicId) || 0) + 1);
for (const t of topics) t.count = topicCount.get(t.id) || 0;

const concepts = [...new Set(questions.map((q) => q.concept).filter(Boolean))].sort();

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
console.log(`content pack -> ${OUT_FILE}`);
console.log(`  questions: ${pack.stats.total} (answered ${pack.stats.answered}, skip/unanswered ${pack.stats.total - pack.stats.answered})`);
console.log(`  topics: ${topics.length}, concepts: ${concepts.length}`);
console.log(`  withExplanation: ${pack.stats.withExplanation}, withImage: ${pack.stats.withImage}`);
for (const t of topics) console.log(`    ${t.id.padEnd(24)} ${String(t.count).padStart(4)}  (${t.kind})`);

function clean(s) {
  if (!s) return "";
  return String(s)
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#\d+;/g, (m) => String.fromCharCode(Number(m.slice(2, -1))))
    .replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-")
    .replace(/\s+/g, " ").trim();
}