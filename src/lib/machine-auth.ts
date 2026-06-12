// RALD Config — Machine Identity Middleware
// Sprint: Operator Platform Phase 9 · 2026-06-12
// rald-config receives reads from all RALD services — machine JWT validates caller identity.
// Required scopes: "flags:read", "kill-switch:read", "country:read"
// Admin mutations: "flags:write", "kill-switch:write", "country:write" (requires machine JWT from control plane)
// Backward-compatible: falls back to RALD_ADMIN_SECRET during transition.
// LILCKY STUDIO LIMITED

import type { Context, Next } from "hono";
import type { Bindings } from "../index";

export interface MachineJwtPayload {
  type:             "machine";
  machine_id:       string;
  service_name:     string;
  scopes:           string[];
  allowed_services: string[];
  iat:              number;
  exp:              number;
}

async function verifyMachineJwt(
  token: string,
  secret: string
): Promise<MachineJwtPayload | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts as [string, string, string];
    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
    );
    const sigBytes = Uint8Array.from(
      atob(sig.replace(/-/g, "+").replace(/_/g, "/")),
      (c) => c.charCodeAt(0)
    );
    const valid = await crypto.subtle.verify(
      "HMAC", key, sigBytes,
      new TextEncoder().encode(`${header}.${body}`)
    );
    if (!valid) return null;
    const payload = JSON.parse(
      atob(body.replace(/-/g, "+").replace(/_/g, "/"))
    ) as MachineJwtPayload;
    if (payload.type !== "machine") return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

// ── requireMachineRead — any registered machine can read flags/config ──────────
// No scope check for reads — all RALD services need config. JWT presence is sufficient.
export function requireMachineRead() {
  return async (c: Context<{ Bindings: Bindings }>, next: Next) => {
    const env = c.env;

    // 1. Machine JWT path (preferred)
    const tokenRaw = c.req.header("X-Machine-Token") ??
      (c.req.header("Authorization")?.startsWith("Bearer ")
        ? c.req.header("Authorization")!.slice(7) : null);

    if (tokenRaw) {
      const payload = await verifyMachineJwt(tokenRaw, env.RALD_JWT_SECRET);
      if (!payload) return c.json({ error: "Invalid or expired machine token" }, 401);
      return next();
    }

    // 2. Backward-compat: RALD_ADMIN_SECRET (deprecated)
    const adminSecret = c.req.header("X-Admin-Secret") ?? c.req.header("X-Internal-Secret");
    if (adminSecret && env.RALD_ADMIN_SECRET && adminSecret === env.RALD_ADMIN_SECRET) {
      console.warn("[rald-config] DEPRECATED: X-Admin-Secret used — migrate to machine JWT");
      return next();
    }

    return c.json({ error: "Unauthorized — machine token required" }, 401);
  };
}

// ── requireMachineWrite — only control-plane machine keys can mutate config ───
export function requireMachineWrite(requiredScope: string) {
  return async (c: Context<{ Bindings: Bindings }>, next: Next) => {
    const env = c.env;

    const tokenRaw = c.req.header("X-Machine-Token") ??
      (c.req.header("Authorization")?.startsWith("Bearer ")
        ? c.req.header("Authorization")!.slice(7) : null);

    if (tokenRaw) {
      const payload = await verifyMachineJwt(tokenRaw, env.RALD_JWT_SECRET);
      if (!payload) return c.json({ error: "Invalid or expired machine token" }, 401);
      if (!payload.scopes.includes(requiredScope)) {
        return c.json({ error: `Missing required scope: ${requiredScope}` }, 403);
      }
      return next();
    }

    // Backward-compat for admin writes during transition
    const adminSecret = c.req.header("X-Admin-Secret") ?? c.req.header("X-Internal-Secret");
    if (adminSecret && env.RALD_ADMIN_SECRET && adminSecret === env.RALD_ADMIN_SECRET) {
      console.warn("[rald-config] DEPRECATED: X-Admin-Secret write used — migrate to machine JWT");
      return next();
    }

    return c.json({ error: "Unauthorized" }, 401);
  };
}
