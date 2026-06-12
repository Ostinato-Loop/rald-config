// RALD Config — Feature Flag Routes
// Admin-controlled. No redeploy required.
// LILCKY STUDIO LIMITED

import { Hono } from "hono";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Bindings, Variables } from "../index";
import { verifyJwt, isAdmin, getClientIp } from "../lib/auth";
import { getCachedFlag, setCachedFlag, deleteCachedFlag, getAllCachedFlags } from "../lib/cache";
import { writeAuditLog } from "../lib/audit";
import type { Context } from "hono";
import type { FlagState } from "../types/flags";

const flags = new Hono<{ Bindings: Bindings; Variables: Variables }>();

async function requireAdmin(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
  const auth = c.req.header("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return verifyJwt(auth.slice(7), c.env.RALD_JWT_SECRET);
}

// ── GET /flags — list all feature flags (public read for internal services) ───
flags.get("/flags", async (c) => {
  const db: SupabaseClient = c.get("db");
  // Try KV cache first for performance
  const cached = await getAllCachedFlags(c.env.FLAG_CACHE_KV);
  if (Object.keys(cached).length > 0) {
    return c.json({ flags: cached, source: "cache" });
  }
  const { data, error } = await db.from("feature_flags").select("*").order("name");
  if (error) return c.json({ error: "Failed to fetch flags" }, 500);
  const result: Record<string, string> = {};
  for (const f of data ?? []) result[f.name] = f.state;
  return c.json({ flags: result, source: "db", count: data?.length ?? 0 });
});

// ── GET /flags/:name — single flag ────────────────────────────────────────────
flags.get("/flags/:name", async (c) => {
  const name = c.req.param("name");
  const db: SupabaseClient = c.get("db");
  const cached = await getCachedFlag(c.env.FLAG_CACHE_KV, name);
  if (cached) return c.json({ name, state: cached, source: "cache" });
  const { data } = await db.from("feature_flags").select("*").eq("name", name).single();
  if (!data) return c.json({ error: "Flag not found" }, 404);
  await setCachedFlag(c.env.FLAG_CACHE_KV, name, data.state);
  return c.json({ ...data, source: "db" });
});

// ── POST /flags — create flag (admin only) ────────────────────────────────────
flags.post("/flags", async (c) => {
  const payload = await requireAdmin(c);
  if (!payload || !isAdmin(payload)) return c.json({ error: "Admin required" }, 403);
  const db: SupabaseClient = c.get("db");
  const ip = getClientIp(c.req.raw);
  const body = await c.req.json<{
    name: string; description?: string; state?: FlagState; countries?: string[]; rollout_pct?: number;
  }>().catch(() => null);
  if (!body?.name) return c.json({ error: "name is required" }, 400);
  const { data, error } = await db.from("feature_flags").insert({
    name:        body.name,
    description: body.description ?? "",
    state:       body.state ?? "DISABLED",
    countries:   body.countries ?? [],
    rollout_pct: body.rollout_pct ?? null,
    metadata:    {},
    updated_by:  payload.id,
  }).select().single();
  if (error) return c.json({ error: "Failed to create flag" }, 500);
  await setCachedFlag(c.env.FLAG_CACHE_KV, body.name, data.state);
  await writeAuditLog(db, { action: "flag.created", admin_id: payload.id, ip, metadata: { name: body.name, state: data.state } });
  return c.json(data, 201);
});

// ── PATCH /flags/:name — update flag state (admin only) ──────────────────────
flags.patch("/flags/:name", async (c) => {
  const payload = await requireAdmin(c);
  if (!payload || !isAdmin(payload)) return c.json({ error: "Admin required" }, 403);
  const name = c.req.param("name");
  const db: SupabaseClient = c.get("db");
  const ip = getClientIp(c.req.raw);
  const body = await c.req.json<{ state?: FlagState; countries?: string[]; rollout_pct?: number; description?: string }>().catch(() => null);
  if (!body?.state) return c.json({ error: "state is required" }, 400);
  const { data, error } = await db.from("feature_flags")
    .update({ state: body.state, countries: body.countries, rollout_pct: body.rollout_pct, description: body.description, updated_by: payload.id, updated_at: new Date().toISOString() })
    .eq("name", name).select().single();
  if (error || !data) return c.json({ error: "Flag not found or update failed" }, 404);
  await setCachedFlag(c.env.FLAG_CACHE_KV, name, body.state);
  await writeAuditLog(db, { action: "flag.updated", admin_id: payload.id, ip, metadata: { name, old_state: data.state, new_state: body.state } });
  return c.json(data);
});

// ── DELETE /flags/:name — delete flag (admin only) ────────────────────────────
flags.delete("/flags/:name", async (c) => {
  const payload = await requireAdmin(c);
  if (!payload || !isAdmin(payload)) return c.json({ error: "Admin required" }, 403);
  const name = c.req.param("name");
  const db: SupabaseClient = c.get("db");
  const ip = getClientIp(c.req.raw);
  await db.from("feature_flags").delete().eq("name", name);
  await deleteCachedFlag(c.env.FLAG_CACHE_KV, name);
  await writeAuditLog(db, { action: "flag.deleted", admin_id: payload.id, ip, metadata: { name } });
  return c.json({ ok: true, name, deleted: true });
});

export default flags;
