/**
 * Text normalization for learner language.
 *
 * Handles typos, spelling variants, informal language, and Zimbabwean
 * driving terminology. Normalizes internally without correcting the
 * learner's visible text.
 */

const SPELLING_FIXES: Record<string, string> = {
  "righ of way": "right of way",
  "roght of way": "right of way",
  "rightofway": "right of way",
  "right of way": "right of way",
  "righ or way": "right of way",
  "regulashions": "regulations",
  "overtakeing": "overtaking",
  "pedestrain": "pedestrian",
  "pedesrian": "pedestrian",
  "cylist": "cyclist",
  "junciton": "junction",
  "intersecton": "intersection",
  "traffic ligths": "traffic lights",
  "traffic lighs": "traffic lights",
  "trianffic light": "traffic light",
  "seatbelt": "seat belt",
  "seat-belt": "seat belt",
  "lisence": "licence",
  "license": "licence",
  "honn": "horn",
  "miror": "mirror",
  "windscrean": "windscreen",
  "windshield": "windscreen",
  "aquaplaningg": "aquaplaning",
  "aquaplanning": "aquaplaning",
  "hydroplaning": "aquaplaning",
  "ailcohole": "alcohol",
  "intoximacated": "intoxicated",
  "emergancy": "emergency",
  "precausion": "precaution",
  "manouvre": "manoeuvre",
  "maneuver": "manoeuvre",
  "manuever": "manoeuvre",
  "carriageway": "carriageway",
  "carriagway": "carriageway",
  "significance": "significance",
  "pedistrian": "pedestrian",
  "distrubtion": "distribution",
  "maintanance": "maintenance",
  "suspenstion": "suspension",
  "brakking": "braking",
  "steearng": "steering",
  "requlation": "regulation",
  "requlations": "regulations",
  "compulsary": "compulsory",
  "permision": "permission",
  "prohibision": "prohibition",
  "indicater": "indicator",
  "indicators": "indicator",
  "receiding": "receding",
  "neeccesary": "necessary",
  "necesary": "necessary",
  "nessecary": "necessary",
};

const ZIMBABWEAN_TERMS: Record<string, string> = {
  "robot": "traffic light",
  "robots": "traffic lights",
  "red robot": "red traffic light",
  "green robot": "green traffic light",
  "amber robot": "amber traffic light",
  "hooter": "horn",
  "kombi": "minibus",
  "omnibus": "minibus",
  "commuter omnibus": "minibus",
  "l plates": "learner plate",
  "l-plate": "learner plate",
  "learner plate": "learner plate",
  "reg": "registration",
  "vid": "vehicle inspectorate department",
  "zrp": "zimbabwe republic police",
  "highway code": "highway code",
  "provisional licence": "learner licence",
  "learners licence": "learner licence",
  "learner's licence": "learner licence",
};

const COMMON_ABBREVIATIONS: Record<string, string> = {
  "abs": "anti-lock braking system",
  "psv": "public service vehicle",
  "dpi": "drink driving",
};

/**
 * Normalize raw learner text for internal processing.
 * Preserves original text in the output; normalizedText is separate.
 */
export function normalizeText(raw: string): string {
  let text = raw.toLowerCase().normalize("NFKC").trim();

  // Apply spelling fixes (longest first to avoid partial matches)
  const sortedFixes = Object.entries(SPELLING_FIXES).sort(
    (a, b) => b[0].length - a[0].length,
  );
  for (const [wrong, correct] of sortedFixes) {
    if (text.includes(wrong)) {
      text = text.replace(new RegExp(escapeRegex(wrong), "g"), correct);
    }
  }

  // Apply Zimbabwean term normalization
  for (const [local, canonical] of Object.entries(ZIMBABWEAN_TERMS)) {
    const regex = new RegExp(`\\b${escapeRegex(local)}\\b`, "g");
    text = text.replace(regex, canonical);
  }

  // Apply abbreviations
  for (const [abbr, full] of Object.entries(COMMON_ABBREVIATIONS)) {
    const regex = new RegExp(`\\b${escapeRegex(abbr)}\\b`, "g");
    text = text.replace(regex, full);
  }

  // Normalize whitespace
  text = text.replace(/\s+/g, " ").trim();

  return text;
}

/**
 * Check if a word appears in text (with optional word boundary for short words).
 */
export function wordMatch(text: string, word: string): boolean {
  const lower = text.toLowerCase();
  if (word.length <= 4) {
    const escaped = escapeRegex(word);
    return new RegExp(`\\b${escaped}\\b`).test(lower);
  }
  return lower.includes(word.toLowerCase());
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
