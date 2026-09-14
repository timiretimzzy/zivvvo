import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import fs from "fs";

// Load env from .env file (simple parser, no dotenv dependency)
const envPath = new URL("./.env", import.meta.url).pathname;
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
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

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const PLANS = {
  monthly:  { amount: 2.00,  months: 1,  label: "Monthly" },
  sixmonth: { amount: 8.00,  months: 6,  label: "6 Months" },
  yearly:   { amount: 12.00, months: 12, label: "Yearly" },
};

function generateHash(values, key) {
  const concatenated = values.join("") + key;
  return crypto.createHash("sha512").update(concatenated, "utf8").digest("hex").toUpperCase();
}

function generateReference(userId) {
  const short = userId.replace(/-/g, "").slice(0, 8);
  return `zivvvo-${short}-${Date.now()}`;
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
    result[decodeURIComponent(key)] = decodeURIComponent(rest.join("="));
  }
  return result;
}

const app = express();
app.use(cors());
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Health check
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Initiate a Paynow transaction
app.post("/api/paynow/initiate", async (req, res) => {
  try {
    const { userId, plan, email } = req.body;
    if (!userId || !plan || !PLANS[plan]) {
      return res.status(400).json({ error: "Invalid userId or plan" });
    }

    const planInfo = PLANS[plan];
    const reference = generateReference(userId);

    // Insert pending transaction
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

    // Build Paynow initiate request
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
    });

    const raw = await paynowRes.text();
    const data = parseUrlEncoded(raw);

    if (data.Status !== "Ok") {
      console.error("Paynow initiate failed:", data);
      return res.status(502).json({ error: data.Error || "Payment initiation failed" });
    }

    // Verify response hash
    const responseHashValues = [
      data.BrowserUrl,
      data.PollUrl,
      data.Status,
    ];
    const expectedHash = generateHash(responseHashValues, PAYNOW_KEY);
    if (data.Hash !== expectedHash) {
      console.error("Hash mismatch on initiate response");
      return res.status(502).json({ error: "Invalid response hash" });
    }

    // Save poll URL
    await supabase
      .from("payments")
      .update({ paynow_poll_url: data.PollUrl, updated_at: new Date().toISOString() })
      .eq("reference", reference);

    res.json({ redirectUrl: data.BrowserUrl, reference });
  } catch (err) {
    console.error("Initiate error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Paynow result webhook
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

    // Verify hash
    const hashValues = [
      fields.Reference,
      fields.Amount,
      fields.PaynowReference || "",
      fields.PaymentMethod || "",
      status,
    ];
    const expectedHash = generateHash(hashValues, PAYNOW_KEY);
    if (paynowHash && paynowHash !== expectedHash) {
      console.error("Hash mismatch on result for", reference);
      return res.status(403).send("Invalid hash");
    }

    // Look up the transaction
    const { data: payment, error: lookupErr } = await supabase
      .from("payments")
      .select("*")
      .eq("reference", reference)
      .single();

    if (lookupErr || !payment) {
      console.error("Payment not found:", reference);
      return res.status(404).send("Not found");
    }

    if (status === "Paid") {
      const planInfo = PLANS[payment.plan];
      if (!planInfo) {
        console.error("Unknown plan:", payment.plan);
        return res.status(500).send("Unknown plan");
      }

      const expiresAt = calculateExpiry(planInfo.months);

      // Update learner_state with premium plan
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

      // Update payment status
      await supabase
        .from("payments")
        .update({ status: "paid", updated_at: new Date().toISOString() })
        .eq("reference", reference);

      console.log(`Plan activated: ${payment.user_id} → premium until ${expiresAt}`);
    } else {
      // Update status (could be "Cancelled", "Expired", etc.)
      await supabase
        .from("payments")
        .update({ status: status.toLowerCase(), updated_at: new Date().toISOString() })
        .eq("reference", reference);
    }

    res.status(200).send("OK");
  } catch (err) {
    console.error("Result webhook error:", err);
    res.status(500).send("Error");
  }
});

// Check transaction status
app.get("/api/paynow/status", async (req, res) => {
  try {
    const { ref } = req.query;
    if (!ref) return res.status(400).json({ error: "Missing ref" });

    const { data: payment, error } = await supabase
      .from("payments")
      .select("status, plan, amount")
      .eq("reference", ref)
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

app.listen(PORT, () => {
  console.log(`Zivvvo API running on port ${PORT}`);
});
