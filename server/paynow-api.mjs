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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  return d.toISOString();
}

function parseUrlEncoded(str) {
  const result = {};
  for (const pair of str.split("&")) {
    const [key, ...rest] = pair.split("=");
    if (key) result[decodeURIComponent(key)] = decodeURIComponent(rest.join("="));
  }
  return result;
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

const app = express();
app.use(cors({ origin: ["https://www.zivvvo.co.zw", "https://zivvvo.co.zw"] }));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

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
    const data = parseUrlEncoded(raw);

    if (data.Status !== "Ok") {
      console.error("Paynow initiate failed:", data);
      await supabase.from("payments").update({ status: "failed", updated_at: new Date().toISOString() }).eq("reference", reference);
      return res.status(502).json({ error: data.Error || "Payment initiation failed" });
    }

    const responseHashValues = [data.BrowserUrl, data.PollUrl, data.Status];
    const expectedHash = generateHash(responseHashValues, PAYNOW_KEY);
    if (data.Hash !== expectedHash) {
      console.error("Hash mismatch on initiate response");
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
    const fields = {};
    if (typeof raw === "string") {
      Object.assign(fields, parseUrlEncoded(raw));
    } else {
      Object.assign(fields, raw);
    }

    const reference = fields.Reference;
    const status = fields.Status;
    const paynowHash = fields.Hash;

    if (!reference || !status) {
      return res.status(400).send("Missing fields");
    }

    // ALWAYS verify hash — never skip
    const hashValues = [
      fields.Reference,
      fields.Amount || "",
      fields.PaynowReference || "",
      fields.PaymentMethod || "",
      status,
    ];
    const expectedHash = generateHash(hashValues, PAYNOW_KEY);
    if (!paynowHash || paynowHash !== expectedHash) {
      console.error("Hash mismatch/rejected on result for", reference);
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

    // Idempotency: skip if already paid
    if (payment.status === "paid") {
      return res.status(200).send("OK");
    }

    if (status === "Paid") {
      const planInfo = PLANS[payment.plan];
      if (!planInfo) {
        console.error("Unknown plan:", payment.plan);
        return res.status(500).send("Unknown plan");
      }

      const expiresAt = calculateExpiry(planInfo.months);

      const { error: updateErr } = await supabase
        .from("learner_state")
        .update({
          plan: "premium",
          plan_expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", payment.user_id);

      if (updateErr) {
        console.error("Update learner_state error:", updateErr);
        return res.status(500).send("Failed to activate plan");
      }

      const { error: payErr } = await supabase
        .from("payments")
        .update({ status: "paid", updated_at: new Date().toISOString() })
        .eq("reference", reference);
      if (payErr) console.error("Failed to update payment status:", payErr);

      console.log(`Plan activated: ${payment.user_id} -> premium until ${expiresAt}`);
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
app.get("/api/paynow/status", rateLimit(30), verifyAuth, async (req, res) => {
  try {
    const { ref } = req.query;
    if (!ref) return res.status(400).json({ error: "Missing ref" });

    const { data: payment, error } = await supabase
      .from("payments")
      .select("status, plan, amount")
      .eq("reference", ref)
      .eq("user_id", req.authUserId)
      .single();

    if (error || !payment) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    res.json({ status: payment.status, plan: payment.plan, amount: payment.amount });
  } catch (err) {
    console.error("Status check error:", err);
    res.status(500).json({ error: "Internal server error" });
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
