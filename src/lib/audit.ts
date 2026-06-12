// RALD Config — Audit Logger
// LILCKY STUDIO LIMITED
import type { SupabaseClient } from "@supabase/supabase-js";

export async function writeAuditLog(
  db: SupabaseClient,
  entry: {
    action:   string;
    admin_id?: string;
    ip?:      string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    await db.from("config_audit_logs").insert({
      action:    entry.action,
      admin_id:  entry.admin_id ?? null,
      ip:        entry.ip ?? null,
      metadata:  entry.metadata ?? {},
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn("[config-audit] write failed:", String(err));
  }
}
