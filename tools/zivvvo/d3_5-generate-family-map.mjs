#!/usr/bin/env node
/**
 * D3.5 Family Mapping Generator
 *
 * Generates a deterministic question family mapping from the D2 duplicate classification.
 * Output: packages/content/src/data/content-family-map.json
 *
 * Family rules:
 * - Questions in the same duplicate group share one familyId.
 * - The familyId is the sorted QIDs of the group joined by ":" (deterministic).
 * - Questions not in any group get their own QID as familyId (singleton family).
 *
 * This file is generated. Do not hand-edit.
 */

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { classifyDuplicates } from "./classify-content.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const CONTENT_PATH = join(ROOT, "packages", "content", "src", "data", "content-v1.json");
const OUTPUT_PATH = join(ROOT, "packages", "content", "src", "data", "content-family-map.json");

function main() {
  console.log("D3.5 Family Mapping Generator");
  console.log("==============================\n");

  const raw = readFileSync(CONTENT_PATH, "utf8");
  const pack = JSON.parse(raw);

  console.log(`Loaded ${pack.questions.length} question records\n`);

  // Detect duplicate groups using D2 classification
  const dupGroups = classifyDuplicates(pack.questions);

  // Build family mapping
  const familyMap = {}; // qid → familyId
  const families = {};  // familyId → { type, qids }

  // Initialize all questions as singleton families
  for (const q of pack.questions) {
    familyMap[q.qid] = q.qid;
  }

  // Override with group families
  for (const group of dupGroups) {
    const familyId = group.qids.join(":");
    for (const qid of group.qids) {
      familyMap[qid] = familyId;
    }
    families[familyId] = {
      type: group.type,
      qids: group.qids,
    };
  }

  // Stats
  const allFamilyIds = new Set(Object.values(familyMap));
  const groupFamilies = Object.keys(families).length;
  const singletonFamilies = allFamilyIds.size - groupFamilies;

  console.log("Family mapping:");
  console.log(`  Total questions: ${pack.questions.length}`);
  console.log(`  Unique families: ${allFamilyIds.size}`);
  console.log(`  Group families (2+ questions): ${groupFamilies}`);
  console.log(`  Singleton families (1 question): ${singletonFamilies}`);
  console.log(`  Questions in groups: ${dupGroups.reduce((s, g) => s + g.count, 0)}`);
  console.log();

  // Group type breakdown
  const typeCounts = {};
  for (const g of dupGroups) {
    typeCounts[g.type] = (typeCounts[g.type] || 0) + 1;
  }
  console.log("Group types:");
  for (const [type, count] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) {
    const totalQ = dupGroups.filter((g) => g.type === type).reduce((s, g) => s + g.count, 0);
    console.log(`  ${type}: ${count} groups, ${totalQ} questions`);
  }
  console.log();

  // Write output
  const output = {
    version: "d3.5",
    generated: new Date().toISOString(),
    totalQuestions: pack.questions.length,
    totalFamilies: allFamilyIds.size,
    groupFamilies,
    singletonFamilies,
    families,
    map: familyMap,
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n");
  console.log(`Written to: ${OUTPUT_PATH}`);
}

main();
