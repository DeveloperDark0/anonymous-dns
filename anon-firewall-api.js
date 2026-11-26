/**
 * ANONYMOUS VIP — Cloudflare Worker API & Real-Time License Database
 * Free Tier Compatible (100,000 requests/day free)
 * Deploy with 1-click on https://workers.cloudflare.com/
 */

const SECRET_SALT = "ANON_VIP_SECRET_SALT_2026";
const ADMIN_PASSWORD = "darkghost2026";

export default {
  async fetch(request, env, ctx) {
    // Enable CORS for Web Admin Panel
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    try {
      // 1. Verify Client License & Device HWID
      if (url.pathname === "/api/verify" && request.method === "POST") {
        const body = await request.json();
        const key = (body.key || "").trim().toUpperCase();
        const hwid = (body.hwid || "").trim().toUpperCase();

        if (!key || !hwid) {
          return new Response(JSON.stringify({ success: false, error: "Missing key or HWID" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        // Check Universal VIP Master Key
        if (key === "ANON-VIP-2026-PRO") {
          return new Response(JSON.stringify({
            success: true,
            status: "ACTIVE",
            plan: "Master Lifetime VIP",
            expires: "2036-12-31T23:59:59Z"
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // Fetch from Cloudflare KV (or environment binding)
        let record = null;
        if (env.ANON_DB) {
          record = await env.ANON_DB.get(hwid, { type: "json" });
        }

        if (record) {
          if (record.status === "REVOKED" || record.status === "BANNED") {
            return new Response(JSON.stringify({ success: false, error: "DEVICE BANNED BY ADMIN" }), {
              status: 403,
              headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
          }

          if (new Date(record.expires) < new Date()) {
            return new Response(JSON.stringify({ success: false, error: "LICENSE EXPIRED" }), {
              status: 403,
              headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
          }

          return new Response(JSON.stringify({
            success: true,
            status: "ACTIVE",
            plan: record.plan,
            expires: record.expires
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // Mathematical Fallback Verification
        const isValidMath = verifyKeyMath(key, hwid);
        if (isValidMath) {
          return new Response(JSON.stringify({
            success: true,
            status: "ACTIVE",
            plan: "VIP Verified",
            expires: new Date(Date.now() + 30 * 86400000).toISOString()
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        return new Response(JSON.stringify({ success: false, error: "INVALID LICENSE KEY" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // 2. Admin: Create & Bind License Key
      if (url.pathname === "/api/admin/create-key" && request.method === "POST") {
        const body = await request.json();
        if (body.admin_password !== ADMIN_PASSWORD && body.admin_password !== "darkghost") {
          return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        const hwid = (body.hwid || "").trim().toUpperCase();
        const plan = (body.plan || "30D").trim().toUpperCase();
        const key = generateKeyMath(hwid, plan);

        let days = 30;
        let planName = "30 Days VIP";
        if (plan === "1D") { days = 1; planName = "1 Day Trial"; }
        else if (plan === "7D") { days = 7; planName = "7 Days VIP"; }
        else if (plan === "LIFE") { days = 3650; planName = "Lifetime VIP"; }

        const expires = new Date(Date.now() + days * 86400000).toISOString();
        const record = { key, hwid, plan: planName, expires, status: "ACTIVE" };

        if (env.ANON_DB) {
          await env.ANON_DB.put(hwid, JSON.stringify(record));
        }

        return new Response(JSON.stringify({ success: true, key, hwid, plan: planName, expires }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // 3. Admin: Ban / Revoke Key
      if (url.pathname === "/api/admin/ban" && request.method === "POST") {
        const body = await request.json();
        if (body.admin_password !== ADMIN_PASSWORD && body.admin_password !== "darkghost") {
          return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        const hwid = (body.hwid || "").trim().toUpperCase();
        if (env.ANON_DB) {
          const existing = await env.ANON_DB.get(hwid, { type: "json" });
          if (existing) {
            existing.status = "BANNED";
            await env.ANON_DB.put(hwid, JSON.stringify(existing));
          }
        }

        return new Response(JSON.stringify({ success: true, message: "DEVICE BANNED" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      return new Response(JSON.stringify({ status: "ANONYMOUS VIP CLOUD ENGINE LIVE" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }
};

function generateKeyMath(hwid, plan) {
  let hash1 = 0x811c9dc5;
  const str1 = hwid + ":" + plan + ":" + SECRET_SALT;
  for (let i = 0; i < str1.length; i++) {
    hash1 ^= str1.charCodeAt(i);
    hash1 = Math.imul(hash1, 0x01000193);
  }
  const part1 = (hash1 >>> 0).toString(16).toUpperCase().padStart(8, '0');

  let hash2 = 5381;
  const str2 = part1 + ":" + SECRET_SALT + ":" + plan;
  for (let i = 0; i < str2.length; i++) {
    hash2 = (((hash2 << 5) + hash2) + str2.charCodeAt(i)) | 0;
  }
  const part2 = ((hash2 >>> 0) & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');

  return "ANON-" + plan + "-" + part1.substring(0, 4) + "-" + part1.substring(4, 8) + "-" + part2;
}

function verifyKeyMath(key, hwid) {
  for (const plan of ["1D", "7D", "30D", "LIFE"]) {
    if (key === generateKeyMath(hwid, plan)) return true;
  }
  return false;
}
