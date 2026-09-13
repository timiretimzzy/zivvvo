#!/usr/bin/env node
/**
 * Copies new driving test images from driving_test_images/ into
 * apps/web/public/images/ using the mapping CSVs.
 *
 * Source: C:\Users\TIMIRE\Downloads\driving_test_images\{number}.png
 * Target: apps/web/public/images\{canonical_filename}
 */
import { readFileSync, copyFileSync, existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..", "..");
const SRC_DIR = "C:\\Users\\TIMIRE\\Downloads\\driving_test_images";
const DEST_DIR = join(ROOT, "apps", "web", "public", "images");
const MAPPING_CSV = "C:\\Users\\TIMIRE\\Downloads\\image_filename_mapping_summary.csv";

function parseCSV(path) {
  const text = readFileSync(path, "utf-8");
  const lines = text.trim().split("\n").slice(1); // skip header
  return lines.map((line) => {
    // Simple CSV parser (handles our simple CSV)
    const parts = [];
    let current = "";
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === "," && !inQuotes) { parts.push(current); current = ""; continue; }
      current += ch;
    }
    parts.push(current);
    return {
      constructedImageNumber: parseInt(parts[0], 10),
      sourceFilename: parts[1] || "",
      sourceExtension: parts[2] || "",
    };
  });
}

const mappings = parseCSV(MAPPING_CSV);
let copied = 0;
let skipped = 0;
let missing = 0;

for (const m of mappings) {
  if (!m.sourceFilename) {
    missing++;
    continue;
  }

  const srcNum = m.constructedImageNumber;
  const srcFile = join(SRC_DIR, `${srcNum}.png`);
  const destFile = join(DEST_DIR, m.sourceFilename);

  if (!existsSync(srcFile)) {
    console.log(`  SKIP: ${srcNum}.png not found in source`);
    skipped++;
    continue;
  }

  if (existsSync(destFile)) {
    // Only overwrite if newer
    copied++;
    copyFileSync(srcFile, destFile);
  } else {
    copyFileSync(srcFile, destFile);
    copied++;
  }
}

console.log(`\nDone: ${copied} copied, ${skipped} skipped (source missing), ${missing} no filename`);
