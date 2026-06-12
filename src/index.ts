// RALD Config — Cloudflare Worker
// Deployed at: config.rald.cloud
// Version: 1.0.0
// Purpose: Feature flags, kill switches, and country governance for the RALD ecosystem.
//   Admin-controlled. No redeploy required. Kill switches propagate in < 5 seconds.
// LILCKY STUDIO LIMITED

import { Hono } from "hono";
import { cors } from "hono/cors";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { KVNamespace } from "./lib/cache";

import healthRoutes      from "./routes/health";
import flagsRoutes       from "./routes/flags";
import killSwitchRoutes  from "./routes/kill-switches";
import countryRoutes     from "./routes/country";
import { requestLogger } from "./lib/logger";

export type Bindings = {
  SUPABASE_URL:              string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  RALD_JWT_SECRET:           string;
  RALD_ADMIN_SECRET:         string;  // for internal service reads
  ENVIRONMENT:               string;
  SERVICE_NAME:              string;
  SERVICE_VERSION:           string;
  RATE_LIMIT_KV:             KVNamespace;
  FLAG_CACHE_KV:             KVNamespace;
  KILL_SWITCH_KV:            KVNamespace;
  COUNTRY_CACHE_KV:          KVNamespace;
  OPEN_OBSERVE_API_KEY?:     string;  // OpenObserve ingest key (C-CERT-004)
  OPEN_OBSERVE_ENDPOINT?:    string;  // e.g. https://observe.rald.cloud/api/rald/rald-config/_json
};

export type Variables = {
  db: SupabaseClient;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ── Security headers ──────────────────────────────────────────────────────────
app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  c.header("Referrer-Policy", "no-referrer");
});

// ── Request logger — OpenObserve log shipping ────────────────────────────────
app.use("*", requestLogger("rald-config"));

// ── CORS — RALD ecosystem + admin ─────────────────────────────────────────────
app.use("*", cors({
  origin: (origin) => {
    const allowed = new Set([
      "https://control.rald.cloud",
      "https://auth.rald.cloud",
      "https://loop-api.rald.cloud",
      "https://chat.rald.cloud",
      "https://notification.rald.cloud",
      "https://realtime.rald.cloud",
      "https://inbox.rald.cloud",
      "https://search.rald.cloud",
      "https://events.rald.cloud",
      "https://app.rald.cloud",
    ]);
    return allowed.has(origin ?? "") ? origin : null;
  },
  allowMethods:  ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders:  ["Content-Type", "Authorization", "X-Internal-Secret"],
}));

// ── Boot validation ────────────────────────────────────────────────────────────
app.use("*", async (c, next) => {
  const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "RALD_JWT_SECRET"];
  // RALD_ADMIN_SECRET is a legacy shared secret — now optional (backward-compat, superseded by machine JWT)
  for (const key of required) {
    if (!c.env[key as keyof Bindings]) {
      return c.json({ error: `Missing required env: ${key}` }, 503);
    }
  }
  c.set("db", createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  }));
  return next();
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.route("/", healthRoutes);
app.route("/", flagsRoutes);
app.route("/", killSwitchRoutes);
app.route("/", countryRoutes);

app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError((err, c) => {
  console.error("[rald-config] error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

export default app;
