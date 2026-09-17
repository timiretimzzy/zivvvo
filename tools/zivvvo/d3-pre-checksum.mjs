#!/usr/bin/env node
/**
 * D3 Pre-Migration Checksum
 *
 * Creates a deterministic snapshot of content-v1.json fields that must NOT change.
 * Saves baseline for post-migration verification.
 *
 * Fields preserved (must be identical after migration):
 *   qid, stem, options, correctIndexes, explanation, imageRef, difficulty, type, status
 *
 * Fields that WILL change (migration targets):
 *   topicId, concept
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { createHash } from "crypto";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const CONTENT_PATH = join(ROOT, "packages", "content", "src", "data", "content-v1.json");
const BASELINE_DIR = join(ROOT, "docs", "d3-baseline");

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
    // Fields that must NOT change
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

function main() {
  console.log("D3 Pre-Migration Checksum");
  console.log("=========================\n");

  const raw = readFileSync(CONTENT_PATH, "utf8");
  const pack = JSON.parse(raw);

  const qids = pack.questions.map(q => String(q.qid));
  const qidSet = new Set(qids);
  const contentHash = computeContentHash(pack.questions);

  // Topic distribution before migration
  const topicCounts = {};
  for (const q of pack.questions) {
    topicCounts[q.topicId] = (topicCounts[q.topicId] || 0) + 1;
  }

  // Concept distribution before migration
  const conceptCounts = {};
  for (const q of pack.questions) {
    const c = q.concept || "(null)";
    conceptCounts[c] = (conceptCounts[c] || 0) + 1;
  }

  const baseline = {
    timestamp: new Date().toISOString(),
    recordCount: pack.questions.length,
    qidCount: qidSet.size,
    uniqueQids: qidSet.size === qids.length,
    qids: qids.sort(),
    contentHash,
    topicCounts,
    conceptCounts,
    topics: pack.topics.map(t => ({ id: t.id, count: t.count })),
  };

  mkdirSync(BASELINE_DIR, { recursive: true });
  const baselinePath = join(BASELINE_DIR, "pre-migration-baseline.json");
  writeFileSync(baselinePath, JSON.stringify(baseline, null, 2));

  console.log(`Record count: ${pack.questions.length}`);
  console.log(`QID count: ${qidSet.size}`);
  console.log(`Unique QIDs: ${baseline.uniqueQids}`);
  console.log(`Content hash: ${contentHash}`);
  console.log(`\nTopic distribution (before):`);
  for (const [topic, count] of Object.entries(topicCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${topic}: ${count}`);
  }
  console.log(`\nBaseline saved to: ${baselinePath}`);
}

main();
