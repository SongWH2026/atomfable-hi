const MAX_MESSAGES = 300;
const RATE_LIMIT_COUNT = 8;
const RATE_LIMIT_MINUTES = 60;

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return null;
  }
  return { url: url.replace(/\/$/, ""), key };
}

async function supabaseRequest(config, path, options = {}) {
  const headers = {
    apikey: config.key,
    Authorization: `Bearer ${config.key}`,
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (options.prefer) {
    headers.Prefer = options.prefer;
  }
  const res = await fetch(`${config.url}/rest/v1/${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }
  return { ok: res.ok, status: res.status, data };
}

async function verifyTurnstile(token, ip) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;
  const body = new URLSearchParams({
    secret,
    response: token,
    remoteip: ip || "",
  });
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json();
  return Boolean(data.success);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("invalid_json"));
      }
    });
    req.on("error", reject);
  });
}

function sanitizeText(value, maxLen) {
  return String(value || "")
    .replace(/\0/g, "")
    .trim()
    .slice(0, maxLen);
}

function normalizeClientToken(value) {
  const token = String(value || "").trim().toLowerCase();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      token
    )
  ) {
    return null;
  }
  return token;
}

function isValidHttpUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "";
}

function mapRow(row) {
  return {
    id: row.id,
    nick: row.nick,
    content: row.content,
    source_label: row.source_label,
    source_url: row.source_url,
    client_token: row.client_token,
    is_admin: row.is_admin,
    created_at: row.created_at,
  };
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  const config = getSupabaseConfig();
  if (!config) {
    json(res, 503, { error: "server_not_configured" });
    return;
  }

  try {
    if (req.method === "GET") {
      const query =
        `hi_messages?select=id,nick,content,source_label,source_url,client_token,is_admin,created_at` +
        `&order=created_at.asc&limit=${MAX_MESSAGES}`;
      const result = await supabaseRequest(config, query);
      if (!result.ok) {
        json(res, 500, { error: "load_failed", detail: result.data });
        return;
      }
      json(res, 200, { messages: (result.data || []).map(mapRow) });
      return;
    }

    if (req.method === "POST") {
      const body = await readBody(req);
      const nick = sanitizeText(body.nick, 20);
      const content = sanitizeText(body.content, 500);
      const clientToken = normalizeClientToken(body.client_token);
      const sourceLabel = sanitizeText(body.source_label, 40) || null;
      let sourceUrl = sanitizeText(body.source_url, 500) || null;

      if (!nick || !content) {
        json(res, 400, { error: "nick_and_content_required" });
        return;
      }
      if (sourceUrl && !isValidHttpUrl(sourceUrl)) {
        sourceUrl = null;
      }
      if (!sourceLabel) {
        sourceUrl = null;
      }

      const ip = getClientIp(req);
      const turnstileOk = await verifyTurnstile(body.turnstile_token, ip);
      if (!turnstileOk) {
        json(res, 403, { error: "turnstile_failed" });
        return;
      }

      if (clientToken) {
        const since = new Date(Date.now() - RATE_LIMIT_MINUTES * 60 * 1000).toISOString();
        const rateQuery =
          `hi_messages?select=id&client_token=eq.${encodeURIComponent(clientToken)}` +
          `&created_at=gte.${encodeURIComponent(since)}`;
        const rateResult = await supabaseRequest(config, rateQuery);
        if (rateResult.ok && Array.isArray(rateResult.data) && rateResult.data.length >= RATE_LIMIT_COUNT) {
          json(res, 429, { error: "rate_limited" });
          return;
        }
      }

      const adminNick = sanitizeText(process.env.HI_ADMIN_NICK, 20);
      const isAdmin = Boolean(adminNick && nick === adminNick);

      const insertBody = {
        nick,
        content,
        source_label: sourceLabel,
        source_url: sourceUrl,
        client_token: clientToken || null,
        is_admin: isAdmin,
      };

      const insertResult = await supabaseRequest(config, "hi_messages", {
        method: "POST",
        prefer: "return=representation",
        body: insertBody,
      });

      if (!insertResult.ok || !Array.isArray(insertResult.data) || !insertResult.data[0]) {
        json(res, 500, { error: "insert_failed", detail: insertResult.data });
        return;
      }

      json(res, 201, { message: mapRow(insertResult.data[0]) });
      return;
    }

    json(res, 405, { error: "method_not_allowed" });
  } catch (err) {
    if (err && err.message === "invalid_json") {
      json(res, 400, { error: "invalid_json" });
      return;
    }
    json(res, 500, { error: "internal_error" });
  }
};
