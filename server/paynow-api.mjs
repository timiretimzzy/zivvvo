import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import fs from "fs";

import ws from "ws";

// Load env from .env file
const envPath = new URL("./.env", import.meta.url).pathname;
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}

const PORT = process.env.PORT || 3939;
const PAYNOW_ID = process.env.PAYNOW_ID;
const PAYNOW_KEY = process.env.PAYNOW_KEY;
const RETURN_URL = process.env.RETURN_URL || "https://www.zivvvo.co.zw/payment/return";
const RESULT_URL = process.env.RESULT_URL || "https://www.zivvvo.co.zw/api/paynow/result";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!PAYNOW_ID || !PAYNOW_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing required environment variables. Check server/.env");
  process.exit(1);
}

if (!process.env.OPENROUTER_API_KEY) {
  console.warn("Warning: OPENROUTER_API_KEY not set. AI Coach will use deterministic fallback.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
  db: { schema: "zivvvo" },
  realtime: { transport: ws },
});

const PLANS = {
  monthly:  { amount: 2.00,  months: 1,  label: "Monthly" },
  sixmonth: { amount: 8.00,  months: 6,  label: "6 Months" },
  yearly:   { amount: 12.00, months: 12, label: "Yearly" },
};

// Test plan only available in non-production
if (process.env.NODE_ENV !== "production") {
  PLANS.test10 = { amount: 0.10, months: 1, label: "Test ($0.10)" };
}

function generateHash(values, key) {
  const concatenated = values.join("") + key;
  return crypto.createHash("sha512").update(concatenated, "utf8").digest("hex").toUpperCase();
}

function generateReference() {
  return `zivvvo-${crypto.randomUUID()}`;
}

function calculateExpiry(months) {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.getTime();
}

// Activate plan for a user — idempotent, handles both first-time and renewal
async function activatePlan(userId, months) {
  const expiresAt = calculateExpiry(months);
  const { data: ls } = await supabase
    .from("learner_state")
    .select("plan, plan_expires_at")
    .eq("user_id", userId)
    .single();

  // If already premium with a future expiry, extend from that expiry (renewal)
  let finalExpiry = expiresAt;
  if (ls && ls.plan === "premium" && ls.plan_expires_at && ls.plan_expires_at > Date.now()) {
    // Extend from current expiry, not from now
    const base = new Date(ls.plan_expires_at);
    base.setMonth(base.getMonth() + months);
    finalExpiry = base.getTime();
  }

  const { error } = await supabase
    .from("learner_state")
    .update({
      plan: "premium",
      plan_expires_at: finalExpiry,
      updated_at: Date.now(),
    })
    .eq("user_id", userId);

  return { error, expiresAt: finalExpiry };
}

// Simple in-memory rate limiter
const rateBuckets = new Map();
function rateLimit(maxPerMin) {
  return (req, res, next) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    const bucket = rateBuckets.get(ip);
    if (!bucket || now - bucket.start > 60000) {
      rateBuckets.set(ip, { start: now, count: 1 });
      return next();
    }
    bucket.count++;
    if (bucket.count > maxPerMin) {
      return res.status(429).json({ error: "Too many requests" });
    }
    next();
  };
}

// Cleanup old rate limit buckets every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - 120000;
  for (const [ip, bucket] of rateBuckets) {
    if (bucket.start < cutoff) rateBuckets.delete(ip);
  }
}, 300000);

// Verify Supabase JWT from Authorization header
async function verifyAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing authorization" });
  }
  const token = auth.slice(7);
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ error: "Invalid token" });
    }
    req.authUserId = data.user.id;
    next();
  } catch {
    return res.status(401).json({ error: "Auth verification failed" });
  }
}

// D8: Verify the authenticated user has an active premium plan
async function verifyEntitlement(req, res, next) {
  try {
    const { data: ls, error } = await supabase
      .from("learner_state")
      .select("plan, plan_expires_at")
      .eq("user_id", req.authUserId)
      .single();
    if (error || !ls) {
      return res.status(403).json({ error: "Could not verify plan status" });
    }
    if (ls.plan !== "premium") {
      return res.status(403).json({ error: "Premium plan required" });
    }
    if (ls.plan_expires_at && new Date(ls.plan_expires_at).getTime() < Date.now()) {
      return res.status(403).json({ error: "Premium plan has expired" });
    }
    next();
  } catch {
    return res.status(500).json({ error: "Entitlement check failed" });
  }
}

const app = express();
app.use(cors({ origin: ["https://www.zivvvo.co.zw", "https://zivvvo.co.zw"] }));
app.use(express.urlencoded({ extended: false, limit: "10kb" }));
app.use(express.json({ limit: "10kb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Initiate a Paynow transaction (requires auth)
app.post("/api/paynow/initiate", rateLimit(10), verifyAuth, async (req, res) => {
  try {
    const { plan } = req.body;
    const userId = req.authUserId;

    if (!plan || !PLANS[plan]) {
      return res.status(400).json({ error: "Invalid plan" });
    }

    const planInfo = PLANS[plan];
    const reference = generateReference();

    const { error: insertErr } = await supabase.from("payments").insert({
      reference,
      user_id: userId,
      plan,
      amount: planInfo.amount,
      currency: "USD",
      status: "pending",
    });
    if (insertErr) {
      console.error("Insert payment error:", insertErr);
      return res.status(500).json({ error: "Failed to create transaction" });
    }

    const params = new URLSearchParams();
    params.append("id", PAYNOW_ID);
    params.append("reference", reference);
    params.append("amount", planInfo.amount.toFixed(2));
    params.append("additionalinfo", `Zivvvo ${planInfo.label} Plan`);
    params.append("returnurl", `${RETURN_URL}?ref=${encodeURIComponent(reference)}`);
    params.append("resulturl", RESULT_URL);
    params.append("status", "Message");

    const hashValues = [
      PAYNOW_ID.toString(),
      reference,
      planInfo.amount.toFixed(2),
      `Zivvvo ${planInfo.label} Plan`,
      `${RETURN_URL}?ref=${encodeURIComponent(reference)}`,
      RESULT_URL,
      "Message",
    ];
    params.append("hash", generateHash(hashValues, PAYNOW_KEY));

    const paynowRes = await fetch("https://www.paynow.co.zw/interface/initiatetransaction", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      signal: AbortSignal.timeout(15000),
    });

    const raw = await paynowRes.text();
    const parsed = new URLSearchParams(raw);
    const data = Object.fromEntries(parsed.entries());
    if (data.status !== undefined) data.Status = data.status;
    if (data.browserurl !== undefined) data.BrowserUrl = data.browserurl;
    if (data.pollurl !== undefined) data.PollUrl = data.pollurl;
    if (data.hash !== undefined) data.Hash = data.hash;
    if (data.error !== undefined) data.Error = data.error;

    if (data.Status !== "Ok") {
      console.error("Paynow initiate failed:", data);
      await supabase.from("payments").update({ status: "failed", updated_at: new Date().toISOString() }).eq("reference", reference);
      return res.status(502).json({ error: data.Error || "Payment initiation failed" });
    }

    const responseHashValues = [data.Status, data.BrowserUrl, data.PollUrl];
    const expectedHash = generateHash(responseHashValues, PAYNOW_KEY);
    if (data.Hash !== expectedHash) {
      console.error("Hash mismatch on initiate response:", {
        status: data.Status,
        browserUrl: data.BrowserUrl?.substring(0, 60),
        pollUrl: data.PollUrl?.substring(0, 60),
        expectedHash,
        gotHash: data.Hash,
      });
      // Mark payment as failed so it doesn't stay pending forever
      await supabase.from("payments").update({ status: "failed", updated_at: new Date().toISOString() }).eq("reference", reference);
      return res.status(502).json({ error: "Invalid response hash" });
    }

    const { error: updateErr } = await supabase
      .from("payments")
      .update({ paynow_poll_url: data.PollUrl, updated_at: new Date().toISOString() })
      .eq("reference", reference);
    if (updateErr) console.error("Failed to save poll URL:", updateErr);

    res.json({ redirectUrl: data.BrowserUrl, reference });
  } catch (err) {
    console.error("Initiate error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Paynow result webhook — idempotent, hash-verified
app.post("/api/paynow/result", async (req, res) => {
  try {
    const raw = req.body;

    if (!raw) {
      return res.status(400).send("Empty body");
    }

    const fields = {};
    const hashValues = [];
    if (typeof raw === "string") {
      for (const [k, v] of new URLSearchParams(raw)) {
        fields[k] = v;
        if (k !== "hash") hashValues.push(v);
      }
    } else {
      for (const [k, v] of Object.entries(raw)) {
        fields[k] = String(v);
        if (k !== "hash") hashValues.push(String(v));
      }
    }

    const reference = fields.Reference || fields.reference;
    const status = fields.Status || fields.status;
    const paynowHash = fields.Hash || fields.hash;

    if (!reference || !status) {
      return res.status(400).send("Missing fields");
    }

    const expectedHash = generateHash(hashValues, PAYNOW_KEY);
    if (!paynowHash || paynowHash.toUpperCase() !== expectedHash.toUpperCase()) {
      console.error("Hash mismatch/rejected on result for", reference, "\nReceived:", hashValues, "\nExpected:", expectedHash);
      return res.status(403).send("Invalid hash");
    }

    const { data: payment, error: lookupErr } = await supabase
      .from("payments")
      .select("*")
      .eq("reference", reference)
      .single();

    if (lookupErr || !payment) {
      console.error("Payment not found:", reference);
      return res.status(404).send("Not found");
    }

    // Idempotency: if already paid, still attempt activation (in case first
    // webhook marked paid but activation failed before this retry).
    if (payment.status === "paid") {
      if (status === "Paid") {
        const planInfo = PLANS[payment.plan];
        if (planInfo) {
          const { error: actErr } = await activatePlan(payment.user_id, planInfo.months);
          if (actErr) console.error("Retry activation failed:", actErr.message);
        }
      }
      return res.status(200).send("OK");
    }

    if (status === "Paid") {
      const planInfo = PLANS[payment.plan];
      if (!planInfo) {
        console.error("Unknown plan:", payment.plan);
        return res.status(500).send("Unknown plan");
      }

      // Step 1: Mark payment as paid FIRST (idempotent — re-delivered webhooks
      // find it already paid and retry activation above).
      const { error: payErr } = await supabase
        .from("payments")
        .update({ status: "paid", updated_at: new Date().toISOString() })
        .eq("reference", reference);
      if (payErr) {
        console.error("Failed to mark payment paid:", payErr);
        return res.status(500).send("Failed to record payment");
      }

      // Step 2: Activate the plan
      const { error: updateErr, expiresAt } = await activatePlan(payment.user_id, planInfo.months);

      if (updateErr) {
        console.error("CRITICAL: Plan activation failed after payment marked paid:", updateErr,
          { user_id: payment.user_id, reference });
      } else {
        console.log(`Plan activated: ${payment.user_id} -> premium until ${new Date(expiresAt).toISOString()}`);
      }
    } else {
      const { error: cancelErr } = await supabase
        .from("payments")
        .update({ status: status.toLowerCase(), updated_at: new Date().toISOString() })
        .eq("reference", reference);
      if (cancelErr) console.error("Failed to update payment status:", cancelErr);
    }

    res.status(200).send("OK");
  } catch (err) {
    console.error("Result webhook error:", err);
    res.status(500).send("Error");
  }
});

// Check transaction status (requires auth, can only check own)
// Fallback: if payment is "paid" but plan wasn't activated, retry here.
app.get("/api/paynow/status", rateLimit(30), verifyAuth, async (req, res) => {
  try {
    const { ref } = req.query;
    if (!ref) return res.status(400).json({ error: "Missing ref" });

    const { data: payment, error } = await supabase
      .from("payments")
      .select("status, plan, amount, user_id")
      .eq("reference", ref)
      .eq("user_id", req.authUserId)
      .single();

    if (error || !payment) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    // Fallback: if payment is paid but plan might not be activated,
    // try (re)activating. Always attempts — handles first-time AND renewals.
    if (payment.status === "paid") {
      const planInfo = PLANS[payment.plan];
      if (planInfo) {
        const { error: actErr } = await activatePlan(payment.user_id, planInfo.months);
        if (actErr) console.error("Status fallback activation failed:", actErr.message);
      }
    }

    res.json({ status: payment.status, plan: payment.plan, amount: payment.amount });
  } catch (err) {
    console.error("Status check error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ---------------------------------------------------------------------------
// D7: AI Coach endpoints — server-side LLM proxy
// ---------------------------------------------------------------------------

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash";

const AI_SYSTEM_PROMPT = `You are Zivvvo's AI driving-theory tutor for Zimbabwe's Class 2 learner's licence exam.

IDENTITY & SCOPE:
You help learners prepare for the Zimbabwe Class 2 learner's licence theory exam. You may discuss any learner's licence study topic that Zivvvo covers, including: road signs, road markings, junction rules, traffic lights, speed limits, overtaking, parking, pedestrian safety, vehicle equipment, vehicle classes, towing and loads, accident procedures, alcohol and drugs, night driving, general driving rules, and learner's licence requirements.

CONVERSATION RULES:
- Follow the learner's conversation naturally. If they ask a follow-up question, answer it in context.
- A question about "other types of signs" after discussing "regulatory signs" is clearly about road signs — answer it.
- Learners may switch topics at any time. Answer their current question, regardless of what was discussed before.
- The learner context (weaknesses, strengths) is personalization — it tells you what they need help with, but does NOT restrict what they can ask about.

AUTHORITY:
- Zivvvo's supplied authoritative content takes precedence over your general knowledge.
- Never invent Zimbabwe driving laws. If the supplied material is insufficient, say: "I don't have enough verified Zivvvo study material to answer that reliably."
- Never claim unsupported facts are official law.
- Never fabricate citations or legal sources.

INTELLIGENCE BOUNDARIES — NEVER:
- Determine mastery, weakness, readiness, or correctness
- Select questions or scores
- Claim the learner passed or failed
- Override the deterministic engine

TEACHING STYLE:
- Concise, friendly, clear
- Zimbabwe-specific where supported by supplied content
- Phone-friendly — readable on a small screen
- Explain rather than lecture
- Use examples when helpful
- Vary your response structure — do NOT end every response with "Remember this:"
- For simple questions, give simple answers — do not over-answer
- Use natural phrasing like "The key idea is..." or "For the exam, focus on..." only when genuinely helpful

RESPONSE FORMAT:
- Use plain text, no markdown headers
- Keep explanations under 200 words for simple answers, expand slightly for complex topics
- Use simple language suitable for a learner driver
- If the learner asks something unrelated to driving theory, politely redirect to exam preparation`;

// In-memory rate limit for AI requests (per IP)
const aiRateBuckets = new Map();
function aiRateLimit(maxPerMin) {
  return (req, res, next) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    const bucket = aiRateBuckets.get(ip);
    if (!bucket || now - bucket.start > 60000) {
      aiRateBuckets.set(ip, { start: now, count: 1 });
      return next();
    }
    bucket.count++;
    if (bucket.count > maxPerMin) {
      return res.status(429).json({ error: "Too many AI requests. Please wait a moment." });
    }
    next();
  };
}

// Cleanup old AI rate limit buckets every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - 120000;
  for (const [ip, bucket] of aiRateBuckets) {
    if (bucket.start < cutoff) aiRateBuckets.delete(ip);
  }
}, 300000);

async function callOpenRouter(messages, maxTokens = 500) {
  if (!OPENROUTER_API_KEY) {
    throw new Error("AI_PROVIDER_NOT_CONFIGURED");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://www.zivvvo.co.zw",
        "X-Title": "Zivvvo AI Tutor",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages,
        max_tokens: maxTokens,
        temperature: 0.7,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`LLM_HTTP_${res.status}: ${text.slice(0, 200)}`);
    }
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text || typeof text !== "string" || text.trim().length === 0) {
      throw new Error("LLM_EMPTY_RESPONSE");
    }
    return text.trim();
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

// Build a conversation history block for the LLM message array
function buildConversationBlock(history) {
  if (!Array.isArray(history) || history.length === 0) return null;
  const recent = history.slice(-6); // Keep last 6 messages (3 turns)
  return recent.map((m) => `${m.role === "user" ? "Learner" : "Tutor"}: ${m.text}`).join("\n\n");
}

// POST /api/ai/explain — concept explanation (premium only)
app.post("/api/ai/explain", aiRateLimit(10), verifyAuth, verifyEntitlement, async (req, res) => {
  try {
    const { concept, conceptLabel, topicLabel, state, mastery, attempts, correct, canonicalExplanation, keyRule, recentMistake, conversationHistory } = req.body;
    if (!concept || !conceptLabel) {
      return res.status(400).json({ error: "Missing concept or conceptLabel" });
    }
    const contextParts = [
      `Learner context:`,
      `Concept: ${conceptLabel}`,
      `Topic: ${topicLabel || "Unknown"}`,
      `Learner state: ${state || "unknown"}`,
      attempts ? `Evidence: ${correct || 0} correct / ${attempts} attempts` : null,
      mastery ? `Mastery: ${Math.round(mastery * 100)}%` : null,
      canonicalExplanation ? `Authoritative Zivvvo explanation: ${canonicalExplanation}` : null,
      keyRule ? `Key rule: ${keyRule}` : null,
      recentMistake ? `Recent mistake: ${recentMistake.stem}\nLearner answer: ${recentMistake.learnerAnswer}\nCorrect answer: ${recentMistake.correctAnswer}` : null,
    ].filter(Boolean).join("\n");

    const historyBlock = buildConversationBlock(conversationHistory);

    const userMessage = historyBlock
      ? `${historyBlock}\n\n${contextParts}\n\nExplain this concept to the learner.`
      : `${contextParts}\n\nExplain this concept to the learner.`;

    const messages = [
      { role: "system", content: AI_SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ];
    const text = await callOpenRouter(messages);
    res.json({ text, source: "generated", available: true });
  } catch (err) {
    if (err.message === "AI_PROVIDER_NOT_CONFIGURED") {
      return res.json({ text: "", source: "canonical", available: false });
    }
    if (err.name === "AbortError") {
      return res.json({ text: "", source: "canonical", available: false });
    }
    console.error("AI explain error:", err.message);
    res.json({ text: "", source: "canonical", available: false });
  }
});

// POST /api/ai/ask — answer learner question (premium only)
app.post("/api/ai/ask", aiRateLimit(10), verifyAuth, verifyEntitlement, async (req, res) => {
  try {
    const { question, concept, conceptLabel, topicLabel, state, mastery, attempts, correct, canonicalExplanation, keyRule, recentMistake, conversationHistory } = req.body;
    if (!question || typeof question !== "string" || question.trim().length === 0) {
      return res.status(400).json({ error: "Missing question" });
    }
    if (question.length > 500) {
      return res.status(400).json({ error: "Question too long (max 500 characters)" });
    }
    const contextParts = [
      concept ? `Learner context:\nConcept: ${conceptLabel || concept}` : null,
      topicLabel ? `Topic: ${topicLabel}` : null,
      state ? `Learner state: ${state}` : null,
      mastery ? `Mastery: ${Math.round(mastery * 100)}%` : null,
      attempts ? `Evidence: ${correct || 0} correct / ${attempts} attempts` : null,
      canonicalExplanation ? `Authoritative Zivvvo explanation: ${canonicalExplanation}` : null,
      keyRule ? `Key rule: ${keyRule}` : null,
      recentMistake ? `Recent mistake context: ${recentMistake.stem}\nCorrect answer: ${recentMistake.correctAnswer}` : null,
    ].filter(Boolean).join("\n");

    const historyBlock = buildConversationBlock(conversationHistory);

    let userMessage;
    if (historyBlock && contextParts) {
      userMessage = `${historyBlock}\n\n${contextParts}\n\nLearner's latest question: ${question}`;
    } else if (historyBlock) {
      userMessage = `${historyBlock}\n\nLearner's latest question: ${question}`;
    } else if (contextParts) {
      userMessage = `${contextParts}\n\nLearner question: ${question}`;
    } else {
      userMessage = `Learner question: ${question}`;
    }

    const messages = [
      { role: "system", content: AI_SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ];
    const text = await callOpenRouter(messages);
    res.json({ text, source: "generated", available: true });
  } catch (err) {
    if (err.message === "AI_PROVIDER_NOT_CONFIGURED") {
      return res.json({ text: "", source: "canonical", available: false });
    }
    if (err.name === "AbortError") {
      return res.json({ text: "", source: "canonical", available: false });
    }
    console.error("AI ask error:", err.message);
    res.json({ text: "", source: "canonical", available: false });
  }
});

// Global error handler
app.use((err, _req, res, _next) => {
  console.error("Unhandled:", err);
  res.status(500).json({ error: "Internal server error" });
});

const server = app.listen(PORT, () => {
  console.log(`Zivvvo API running on port ${PORT}`);
});

process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down...");
  server.close(() => process.exit(0));
});
process.on("SIGINT", () => {
  server.close(() => process.exit(0));
});
