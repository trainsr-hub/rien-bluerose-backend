/**
 * Rose Beeper Edge Gateway (Cloudflare Worker)
 *
 * Securely connects to Turso Cloud SQLite over HTTPS Pipeline v2,
 * extracts random quotes with all relational joins, date fallbacks,
 * and category rules, and spoon-feeds flat minimal JSON directly to ESP32.
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 1. CORS Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key"
        }
      });
    }

    // 2. Health check route
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok", service: "rose-beeper-gateway" }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    // 3. Optional Secret Key Check (if ESP32_SECRET_KEY is configured in Cloudflare environment)
    if (env.ESP32_SECRET_KEY) {
      const providedKey = url.searchParams.get("key") || request.headers.get("x-api-key");
      if (providedKey !== env.ESP32_SECRET_KEY) {
        return new Response(JSON.stringify({ error: "Unauthorized. Invalid or missing secret key." }), {
          status: 401,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }
    }

    // 4. Batch Count Parameter (default 10, clamped 1-25 to protect ESP32 memory)
    const countParam = parseInt(url.searchParams.get("count") || "10", 10);
    const limit = Math.max(1, Math.min(25, isNaN(countParam) ? 10 : countParam));

    // 5. Check Environment Variables
    if (!env.TURSO_DATABASE_URL || !env.TURSO_AUTH_TOKEN) {
      return new Response(JSON.stringify({
        error: "Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN in Cloudflare Worker environment settings."
      }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    // Convert libsql:// to https:// if needed
    let dbUrl = env.TURSO_DATABASE_URL.trim();
    if (dbUrl.startsWith("libsql://")) {
      dbUrl = "https://" + dbUrl.slice("libsql://".length);
    }
    dbUrl = dbUrl.replace(/\/+$/, "");

    // 6. Single-Trip Edge SQL Query (Resolves Specifics, Containers, Date Fallback & Themes)
    const sql = `
      SELECT
        q.idx,
        q.main_content AS content,
        COALESCE(q.context, '') AS context,
        COALESCE(NULLIF(q.date, ''), s.date, '') AS effective_date,
        COALESCE(s.name, '') AS specific_name,
        COALESCE(c.name, '') AS container_name,
        COALESCE(s.category, '') AS category,
        COALESCE((
          SELECT GROUP_CONCAT(t.name, ',')
          FROM themes t
          WHERE t.id IN (SELECT value FROM json_each(q.theme_ids))
        ), '') AS theme_names
      FROM quotes q
      LEFT JOIN specifics s ON q.specific_id = s.id
      LEFT JOIN containers c ON s.container_id = c.id
      ORDER BY RANDOM() LIMIT ${limit};
    `;

    try {
      // 7. Request to Turso HTTP Pipeline v2
      const tursoResp = await fetch(`${dbUrl}/v2/pipeline`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.TURSO_AUTH_TOKEN.trim()}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          requests: [
            { type: "execute", stmt: { sql } },
            { type: "close" }
          ]
        })
      });

      if (!tursoResp.ok) {
        const errText = await tursoResp.text();
        return new Response(JSON.stringify({ error: `Turso HTTP ${tursoResp.status}: ${errText}` }), {
          status: 502,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }

      const tursoData = await tursoResp.json();
      const rows = tursoData.results?.[0]?.response?.result?.rows || [];

      // 8. Spoon-Feed Magic: Map into flat, clean JSON objects for ESP32
      const spoonFedQuotes = rows.map(r => {
        const rawThemes = r[7]?.value ? String(r[7].value).split(",").map(t => t.trim()).filter(Boolean) : [];
        const hashtagTags = rawThemes.map(t => t.startsWith("#") ? t : `#${t}`);

        return {
          idx: r[0]?.value,
          content: r[1]?.value || "",
          context: r[2]?.value || "",
          date: r[3]?.value || "",
          specific: r[4]?.value || "",
          container: r[5]?.value || "",
          cat: r[6]?.value || "",
          tags: hashtagTags.length > 0 ? hashtagTags : ["#Prescript"]
        };
      });

      // 9. Deliver pure spoon-fed array directly to microcontroller
      return new Response(JSON.stringify(spoonFedQuotes), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-cache, no-store"
        }
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: `Gateway error: ${err.message}` }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }
  }
};
