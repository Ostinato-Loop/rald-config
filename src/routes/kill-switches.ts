// RALD Config — Kill Switch Routes
// Purpose: Instant emergency shutdown. No deployment required. No code changes.
// Must work within seconds. Admin-controlled only.
// LILCKY STUDIO LIMITED

import { Hono } from "hono";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Bindings, Variables } from "../index";
import { verifyJwt, isAdmin, getClientIp } from "../lib/auth";
import { setKillSwitch, isKillSwitchActive, getAllKillSwitches } from "../lib/cache";
import { writeAuditLog } from "../lib/audit";
import { requireMachineRead, requireMachineWrite } from "../lib/machine-auth";

const killSwitches = new Hono<{ Bindings: Bindings; Variables: Variables }>();

async function requireAdmin(authHeader: string | undefined, env: Bindings) {
  if (!authHeader?.startsWith("Bearer ")) return null;
  return verifyJwt(authHeader.slice(7), env.RALD_JWT_SECRET);
}

// ── GET /kill-switches — list all kill switches ────────────────────────────────
// Both KV state (live) and DB records (history)
killSwitches.get("/kill-switches", async (c) => {
  const payload = await requireAdmin(c.req.header("Authorization"), c.env);
  if (!payload || !isAdmin(payload)) return c.json({ error: "Admin required" }, 403);
  const db: SupabaseClient = c.get("db");
  const [{ data }, kvState] = await Promise.all([
    db.from("kill_switches").select("*").order("created_at", { ascending: false }),
    getAllKillSwitches(c.env.KILL_SWITCH_KV),
  ]);
  return c.json({ kill_switches: data ?? [], live_state: kvState });
});

// ── GET /kill-switches/:target — check a specific kill switch ─────────────────
// Public read — any service can check if a kill switch is active.
// Uses KV for near-zero latency (5s TTL).
killSwitches.get("/kill-switches/:target", async (c) => {
  const target = c.req.param("target");
  // Require internal secret OR admin token for reads
  const internalSecret = c.req.header("X-Internal-Secret");
  const isInternalCall = internalSecret === c.env.RALD_ADMIN_SECRET;
  const authHeader = c.req.header("Authorization");
  if (!isInternalCall && authHeader) {
    const payload = await verifyJwt(authHeader.slice(7), c.env.RALD_JWT_SECRET);
    if (!payload || !isAdmin(payload)) return c.json({ error: "Unauthorized" }, 401);
  }
  if (!isInternalCall && !authHeader) return c.json({ error: "Unauthorized" }, 401);
  const active = await isKillSwitchActive(c.env.KILL_SWITCH_KV, target);
  return c.json({ target, active, checked_at: new Date().toISOString() });
});

// ── POST /kill-switches/:target/activate — ACTIVATE a kill switch ─────────────
// Activates within seconds — updates KV immediately (5s TTL propagation).
killSwitches.post("/kill-switches/:target/activate", requireMachineWrite("kill-switch:write"), async (c) => {
  const payload = await requireAdmin(c.req.header("Authorization"), c.env);
  if (!payload || !isAdmin(payload)) return c.json({ error: "Admin required" }, 403);
  const db: SupabaseClient = c.get("db");
  const target = c.req.param("target");
  const ip = getClientIp(c.req.raw);
  const body = await c.req.json<{ reason?: string; metadata?: Record<string, unknown> }>().catch(() => ({}));

  // Activate in KV immediately (5s propagation to all edge nodes)
  await setKillSwitch(c.env.KILL_SWITCH_KV, target, true);

  // Persist to DB for audit trail
  const now = new Date().toISOString();
  await db.from("kill_switches").upsert({
    target,
    active:       true,
    reason:       body.reason ?? "Emergency shutdown",
    activated_by: payload.id,
    activated_at: now,
    metadata:     body.metadata ?? {},
    updated_at:   now,
  }, { onConflict: "target" });

  await writeAuditLog(db, {
    action:   "kill_switch.activated",
    admin_id: payload.id,
    ip,
    metadata: { target, reason: body.reason },
  });

  console.warn(`[KILL-SWITCH] ACTIVATED: ${target} by ${payload.email} at ${now}`);

  return c.json({
    ok:           true,
    target,
    active:       true,
    activated_by: payload.email,
    activated_at: now,
    propagation:  "< 5 seconds to all edge nodes",
  });
});

// ── POST /kill-switches/:target/deactivate — DEACTIVATE a kill switch ────────
killSwitches.post("/kill-switches/:target/deactivate", requireMachineWrite("kill-switch:write"), async (c) => {
  const payload = await requireAdmin(c.req.header("Authorization"), c.env);
  if (!payload || !isAdmin(payload)) return c.json({ error: "Admin required" }, 403);
  const db: SupabaseClient = c.get("db");
  const target = c.req.param("target");
  const ip = getClientIp(c.req.raw);
  const now = new Date().toISOString();

  await setKillSwitch(c.env.KILL_SWITCH_KV, target, false);
  await db.from("kill_switches").upsert({
    target,
    active:          false,
    deactivated_at:  now,
    updated_at:      now,
  }, { onConflict: "target" });

  await writeAuditLog(db, {
    action:   "kill_switch.deactivated",
    admin_id: payload.id,
    ip,
    metadata: { target },
  });

  console.info(`[KILL-SWITCH] DEACTIVATED: ${target} by ${payload.email} at ${now}`);

  return c.json({ ok: true, target, active: false, deactivated_at: now });
});

export default killSwitches;
