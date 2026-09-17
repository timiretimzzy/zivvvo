#!/usr/bin/env node
/**
 * D3 Migration Script
 *
 * Applies approved D2 content classification to content-v1.json.
 * Changes ONLY: topicId, concept
 * Preserves: qid, stem, options, correctIndexes, explanation, imageRef, difficulty, type, status
 *
 * Usage:
 *   node tools/zivvvo/d3-migrate.mjs --dry-run    (preview changes)
 *   node tools/zivvvo/d3-migrate.mjs --apply       (write changes)
 *   node tools/zivvvo/d3-migrate.mjs --validate    (verify after migration)
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { createHash } from "crypto";
import { fileURLToPath } from "url";
import { classifyTopic } from "./classify-content.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const CONTENT_PATH = join(ROOT, "packages", "content", "src", "data", "content-v1.json");
const BASELINE_DIR = join(ROOT, "docs", "d3-baseline");
const BASELINE_PATH = join(BASELINE_DIR, "pre-migration-baseline.json");

function stableStringify(obj) {
  if (obj === null || obj === undefined) return "null";
  if (typeof obj === "string") return JSON.stringify(obj);
  if (typeof obj === "number" || typeof obj === "boolean") return String(obj);
  if (Array.isArray(obj)) return "[" + obj.map(stableStringify).join(",") + "]";
  if (typeof obj === "object") {
    const keys = Object.keys(obj).sort();
    return "{" + keys.map(k => JSON.stringify(k) + ":" + stableStringify(obj[k])).join(",") + "}";
  }
  return String(obj);
}

function computeContentHash(questions) {
  const hash = createHash("sha256");
  for (const q of questions) {
    hash.update(String(q.qid));
    hash.update(q.stem);
    hash.update(stableStringify(q.options));
    hash.update(stableStringify(q.correctIndexes));
    hash.update(q.explanation || "");
    hash.update(q.imageRef || "");
    hash.update(q.difficulty || "");
    hash.update(q.type || "");
    hash.update(q.status || "");
  }
  return hash.digest("hex");
}

function computeFullHash(questions) {
  const hash = createHash("sha256");
  for (const q of questions) {
    hash.update(stableStringify(q));
  }
  return hash.digest("hex");
}

function loadBaseline() {
  if (!existsSync(BASELINE_PATH)) {
    console.error("ERROR: Pre-migration baseline not found. Run d3-pre-checksum.mjs first.");
    process.exit(1);
  }
  return JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
}

function generateMigrationMappings(pack) {
  const mappings = [];
  for (const q of pack.questions) {
    const proposed = classifyTopic(q);
    mappings.push({
      qid: String(q.qid),
      currentTopic: q.topicId,
      currentConcept: q.concept,
      proposedTopic: proposed.topic,
      proposedConcept: proposed.concept,
      confidence: proposed.confidence,
      reason: proposed.reason,
    });
  }
  return mappings;
}

function validateMigration(pack, baseline, mappings) {
  const errors = [];
  const warnings = [];

  // Record count
  if (pack.questions.length !== baseline.recordCount) {
    errors.push(`Record count: expected ${baseline.recordCount}, got ${pack.questions.length}`);
  }

  // QID integrity
  const qids = pack.questions.map(q => String(q.qid));
  const qidSet = new Set(qids);
  if (qidSet.size !== baseline.qidCount) {
    errors.push(`QID count: expected ${baseline.qidCount}, got ${qidSet.size}`);
  }
  if (qidSet.size !== qids.length) {
    errors.push(`Duplicate QIDs detected: ${qids.length} total, ${qidSet.size} unique`);
  }

  // QID set preservation
  const baselineQidSet = new Set(baseline.qids);
  for (const qid of qids) {
    if (!baselineQidSet.has(qid)) {
      errors.push(`New QID found: ${qid}`);
    }
  }
  for (const qid of baseline.qids) {
    if (!qidSet.has(qid)) {
      errors.push(`Missing QID: ${qid}`);
    }
  }

  // Content hash (fields that must NOT change)
  const currentHash = computeContentHash(pack.questions);
  if (currentHash !== baseline.contentHash) {
    errors.push(`Content hash mismatch: fields that should not change have been modified`);
    errors.push(`  Before: ${baseline.contentHash}`);
    errors.push(`  After:  ${currentHash}`);
  }

  // Topic distribution validation
  const topicCounts = {};
  for (const q of pack.questions) {
    topicCounts[q.topicId] = (topicCounts[q.topicId] || 0) + 1;
  }

  // Expected topic distribution from D2
  const expectedTopics = {
    "road-signs": 292,
    "road-markings": 109,
    "junction-rules": 258,
    "traffic-lights": 65,
    "speed-limits": 54,
    "overtaking": 36,
    "parking": 52,
    "pedestrian-safety": 52,
    "vehicle-equipment": 57,
    "vehicle-classes": 57,
    "towing-loads": 41,
    "accident-procedures": 34,
    "alcohol-drugs": 11,
    "night-driving": 69,
    "general-rules": 209,
  };

  for (const [topic, expected] of Object.entries(expectedTopics)) {
    const actual = topicCounts[topic] || 0;
    if (actual !== expected) {
      warnings.push(`Topic "${topic}": expected ${expected}, got ${actual}`);
    }
  }

  // Verify no old topics remain
  const oldTopics = ["general", "regulations", "carriageway-lines", "confusing-pair"];
  for (const t of oldTopics) {
    if (topicCounts[t]) {
      errors.push(`Old topic "${t}" still present with ${topicCounts[t]} records`);
    }
  }

  // Concept distribution validation
  const conceptCounts = {};
  for (const q of pack.questions) {
    const c = q.concept || "(null)";
    conceptCounts[c] = (conceptCounts[c] || 0) + 1;
  }

  // Verify no defensive-driving fallback
  if (conceptCounts["defensive-driving"]) {
    errors.push(`defensive-driving concept found: ${conceptCounts["defensive-driving"]} records`);
  }

  // Verify no null concepts
  if (conceptCounts["(null)"]) {
    warnings.push(`Null concepts: ${conceptCounts["(null)"]} records`);
  }

  return { errors, warnings, topicCounts, conceptCounts };
}

function dryRun(pack, mappings) {
  console.log("D3 Dry Run — Migration Preview");
  console.log("================================\n");

  let changes = 0;
  let noChange = 0;

  for (const m of mappings) {
    const topicChanged = m.proposedTopic !== m.currentTopic;
    const conceptChanged = m.proposedConcept !== (m.currentConcept || "");

    if (topicChanged || conceptChanged) {
      changes++;
      if (changes <= 20) {
        console.log(`  ${m.qid}: ${m.currentTopic}/${m.currentConcept || "(null)"} → ${m.proposedTopic}/${m.proposedConcept} [${m.confidence}]`);
      }
    } else {
      noChange++;
    }
  }

  if (changes > 20) {
    console.log(`  ... and ${changes - 20} more changes`);
  }

  console.log(`\nSummary:`);
  console.log(`  Changes: ${changes}`);
  console.log(`  No change: ${noChange}`);
  console.log(`  Total: ${changes + noChange}`);
}

function applyMigration(pack, mappings) {
  console.log("D3 Migration — Applying Changes");
  console.log("=================================\n");

  let changes = 0;
  const changedQids = [];

  for (const q of pack.questions) {
    const mapping = mappings.find(m => m.qid === String(q.qid));
    if (!mapping) {
      console.error(`ERROR: No mapping found for QID ${q.qid}`);
      process.exit(1);
    }

    const topicChanged = mapping.proposedTopic !== q.topicId;
    const conceptChanged = mapping.proposedConcept !== (q.concept || "");

    if (topicChanged || conceptChanged) {
      if (topicChanged) {
        q.topicId = mapping.proposedTopic;
      }
      if (conceptChanged) {
        q.concept = mapping.proposedConcept;
      }
      changes++;
      changedQids.push(q.qid);
    }
  }

  // Update topics array to match new topic IDs
  const topicCounts = {};
  for (const q of pack.questions) {
    topicCounts[q.topicId] = (topicCounts[q.topicId] || 0) + 1;
  }

  const PROPOSED_TOPICS = [
    { id: "road-signs", label: "Road Signs & Signals", parent: "Road Knowledge", kind: "content" },
    { id: "road-markings", label: "Road Markings & Lines", parent: "Road Knowledge", kind: "content" },
    { id: "junction-rules", label: "Junctions & Right of Way", parent: "Traffic Rules", kind: "content" },
    { id: "traffic-lights", label: "Traffic Lights & Robots", parent: "Traffic Rules", kind: "content" },
    { id: "speed-limits", label: "Speed Limits & Restrictions", parent: "Traffic Rules", kind: "content" },
    { id: "overtaking", label: "Overtaking Rules", parent: "Traffic Rules", kind: "content" },
    { id: "parking", label: "Parking Regulations", parent: "Traffic Rules", kind: "content" },
    { id: "pedestrian-safety", label: "Pedestrian & Cyclist Safety", parent: "Safety & Responsibility", kind: "content" },
    { id: "vehicle-equipment", label: "Vehicle Equipment & Lighting", parent: "Vehicle & Equipment", kind: "content" },
    { id: "vehicle-classes", label: "Licensing & Vehicle Classes", parent: "Vehicle & Equipment", kind: "content" },
    { id: "towing-loads", label: "Towing & Load Regulations", parent: "Vehicle & Equipment", kind: "content" },
    { id: "accident-procedures", label: "Accident & Emergency Procedures", parent: "Safety & Responsibility", kind: "content" },
    { id: "alcohol-drugs", label: "Alcohol, Drugs & Fitness", parent: "Safety & Responsibility", kind: "content" },
    { id: "night-driving", label: "Night & Adverse Weather Driving", parent: "Safety & Responsibility", kind: "content" },
    { id: "general-rules", label: "General Road Rules & Roadcraft", parent: "Traffic Rules", kind: "content" },
  ];

  pack.topics = PROPOSED_TOPICS.map(t => ({
    ...t,
    count: topicCounts[t.id] || 0,
  }));

  // Update stats
  pack.stats = {
    total: pack.questions.length,
    answered: pack.questions.filter(q => q.status === "answered").length,
    withExplanation: pack.questions.filter(q => q.explanation).length,
    withImage: pack.questions.filter(q => q.imageRef).length,
  };

  console.log(`Changes applied: ${changes}`);
  console.log(`Records preserved: ${pack.questions.length}`);
  console.log(`Topics updated: ${pack.topics.length}`);

  return { changes, changedQids };
}

function main() {
  const args = process.argv.slice(2);
  const mode = args[0] || "--validate";

  if (!["--dry-run", "--apply", "--validate"].includes(mode)) {
    console.error("Usage: node d3-migrate.mjs [--dry-run|--apply|--validate]");
    process.exit(1);
  }

  const raw = readFileSync(CONTENT_PATH, "utf8");
  const pack = JSON.parse(raw);
  const baseline = loadBaseline();
  const mappings = generateMigrationMappings(pack);

  console.log(`Loaded ${pack.questions.length} question records`);
  console.log(`Generated ${mappings.length} migration mappings\n`);

  if (mode === "--dry-run") {
    dryRun(pack, mappings);
    return;
  }

  if (mode === "--apply") {
    const { changes, changedQids } = applyMigration(pack, mappings);

    // Write updated content
    writeFileSync(CONTENT_PATH, JSON.stringify(pack, null, 2) + "\n");
    console.log(`\nContent written to ${CONTENT_PATH}`);

    // Validate after writing
    console.log("\nRunning post-migration validation...");
    const rawAfter = readFileSync(CONTENT_PATH, "utf8");
    const packAfter = JSON.parse(rawAfter);
    const { errors, warnings, topicCounts, conceptCounts } = validateMigration(packAfter, baseline, mappings);

    if (errors.length > 0) {
      console.error("\nVALIDATION ERRORS:");
      for (const e of errors) console.error(`  ✗ ${e}`);
      process.exit(1);
    }

    if (warnings.length > 0) {
      console.log("\nWarnings:");
      for (const w of warnings) console.log(`  ⚠ ${w}`);
    }

    console.log("\nPost-migration validation: PASS");
    console.log(`Content hash: ${computeContentHash(packAfter.questions)}`);
    return;
  }

  // --validate mode
  console.log("D3 Post-Migration Validation");
  console.log("=============================\n");

  const { errors, warnings, topicCounts, conceptCounts } = validateMigration(pack, baseline, mappings);

  console.log("Record integrity:");
  console.log(`  Before: ${baseline.recordCount}`);
  console.log(`  After: ${pack.questions.length}`);
  console.log(`  QID preservation: ${baseline.qidCount === pack.questions.length ? "PASS" : "FAIL"}`);

  console.log("\nContent preservation:");
  console.log(`  Content hash match: ${baseline.contentHash === computeContentHash(pack.questions) ? "PASS" : "FAIL"}`);

  console.log("\nTopic distribution:");
  for (const [topic, count] of Object.entries(topicCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${topic}: ${count}`);
  }

  console.log("\nConcept distribution (top 10):");
  const sortedConcepts = Object.entries(conceptCounts).sort((a, b) => b[1] - a[1]);
  for (const [concept, count] of sortedConcepts.slice(0, 10)) {
    console.log(`  ${concept}: ${count}`);
  }

  if (errors.length > 0) {
    console.error("\nERRORS:");
    for (const e of errors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }

  if (warnings.length > 0) {
    console.log("\nWarnings:");
    for (const w of warnings) console.log(`  ⚠ ${w}`);
  }

  console.log("\nValidation: PASS");
}

main();
