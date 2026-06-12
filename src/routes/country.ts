// RALD Config — Country Governance Routes
// Phase 9 Hardening + Phase 1 Operator Platform.
// Products cannot launch in countries automatically — admin approval required.
// LILCKY STUDIO LIMITED

import { Hono } from "hono";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Bindings, Variables } from "../index";
import { verifyJwt, isAdmin, getClientIp } from "../lib/auth";
import { getCachedCountry, setCachedCountry } from "../lib/cache";
import { writeAuditLog } from "../lib/audit";
import type { CountryStatus } from "../types/flags";
import { requireMachineRead, requireMachineWrite } from "../lib/machine-auth";

const country = new Hono<{ Bindings: Bindings; Variables: Variables }>();

async function requireAdmin(authHeader: string | undefined, env: Bindings) {
  if (!authHeader?.startsWith("Bearer ")) return null;
  return verifyJwt(authHeader.slice(7), env.RALD_JWT_SECRET);
}

// ── GET /countries — list all country configs ─────────────────────────────────
country.get("/countries", requireMachineRead(), async (c) => {
  const db = c.get("db") as SupabaseClient;
  const { data, error } = await db
    .from("country_configs")
    .select("*")
    .order("country_name");
  if (error) return c.json({ error: "Failed to fetch countries" }, 500);
  return c.json({ countries: data ?? [], count: data?.length ?? 0 });
});

// ── GET /countries/:code — single country status ──────────────────────────────
// Public read with internal secret for services checking country eligibility.
country.get("/countries/:code", async (c) => {
  const code = c.req.param("code")!.toUpperCase();
  const internalSecret = c.req.header("X-Internal-Secret");
  const isInternal = internalSecret === c.env.RALD_ADMIN_SECRET;
  const authHeader = c.req.header("Authorization");
  if (!isInternal && !authHeader) return c.json({ error: "Unauthorized" }, 401);

  // Try KV cache first
  const cached = await getCachedCountry(c.env.COUNTRY_CACHE_KV, code);
  if (cached) {
    return c.json({ country_code: code, status: cached, source: "cache" });
  }

  const db = c.get("db") as SupabaseClient;
  const { data } = await db.from("country_configs").select("*").eq("country_code", code).single();
  if (!data) {
    // Unknown country — default to WAITLIST (no automatic activation)
    return c.json({ country_code: code, status: "WAITLIST", source: "default", message: "Country not explicitly configured — defaulting to WAITLIST" });
  }
  await setCachedCountry(c.env.COUNTRY_CACHE_KV, code, data.status);
  return c.json({ ...data, source: "db" });
});

// ── POST /countries — configure a country (admin only) ───────────────────────
country.post("/countries", requireMachineWrite("country:write"), async (c) => {
  const payload = await requireAdmin(c.req.header("Authorization"), c.env);
  if (!payload || !isAdmin(payload)) return c.json({ error: "Admin required" }, 403);
  const db = c.get("db") as SupabaseClient;
  const ip = getClientIp(c.req.raw);
  const body = await c.req.json<{
    country_code:       string;
    country_name:       string;
    status:             CountryStatus;
    products?:          string[];
    restrictions?:      string[];
    regulatory_profile?: string;
    notes?:             string;
  }>().catch(() => null);
  if (!body?.country_code || !body.country_name || !body.status) {
    return c.json({ error: "country_code, country_name, and status are required" }, 400);
  }
  const now = new Date().toISOString();
  const { data, error } = await db.from("country_configs").upsert({
    country_code:       body.country_code.toUpperCase(),
    country_name:       body.country_name,
    status:             body.status,
    products:           body.products ?? [],
    restrictions:       body.restrictions ?? [],
    regulatory_profile: body.regulatory_profile ?? null,
    notes:              body.notes ?? "",
    activated_by:       body.status === "ACTIVE" ? payload.id : null,
    activated_at:       body.status === "ACTIVE" ? now : null,
    updated_at:         now,
  }, { onConflict: "country_code" }).select().single();
  if (error) return c.json({ error: "Failed to configure country" }, 500);
  await setCachedCountry(c.env.COUNTRY_CACHE_KV, body.country_code.toUpperCase(), body.status);
  await writeAuditLog(db, {
    action:   `country.${body.status.toLowerCase()}`,
    admin_id: payload.id,
    ip,
    metadata: { country_code: body.country_code, status: body.status },
  });
  return c.json(data, 201);
});

// ── PATCH /countries/:code/status — change country status ────────────────────
country.patch("/countries/:code/status", requireMachineWrite("country:write"), async (c) => {
  const payload = await requireAdmin(c.req.header("Authorization"), c.env);
  if (!payload || !isAdmin(payload)) return c.json({ error: "Admin required" }, 403);
  const code = c.req.param("code")!.toUpperCase();
  const db = c.get("db") as SupabaseClient;
  const ip = getClientIp(c.req.raw);
  const body = await c.req.json<{ status: CountryStatus; reason?: string }>().catch(() => null);
  if (!body?.status) return c.json({ error: "status is required" }, 400);
  const now = new Date().toISOString();
  const { data, error } = await db.from("country_configs")
    .update({ status: body.status, updated_at: now, activated_by: body.status === "ACTIVE" ? payload.id : undefined, activated_at: body.status === "ACTIVE" ? now : undefined })
    .eq("country_code", code).select().single();
  if (error || !data) return c.json({ error: "Country not found" }, 404);
  await setCachedCountry(c.env.COUNTRY_CACHE_KV, code, body.status);
  await writeAuditLog(db, {
    action:   `country.status_changed`,
    admin_id: payload.id,
    ip,
    metadata: { country_code: code, new_status: body.status, reason: body.reason },
  });
  return c.json(data);
});

export default country;
