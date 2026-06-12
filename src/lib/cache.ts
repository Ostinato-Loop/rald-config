// RALD Config — KV Cache Layer
// Near-zero latency flag reads via Cloudflare KV edge cache.
// LILCKY STUDIO LIMITED

export interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string }): Promise<{ keys: { name: string }[] }>;
}

const FLAG_CACHE_TTL    = 30;   // 30s — flags update rarely; this is safe
const KILL_SWITCH_TTL   = 5;    // 5s — kill switches need near-instant propagation
const COUNTRY_CACHE_TTL = 60;   // 60s — country config changes rarely

// ── Feature Flags ────────────────────────────────────────────────────────────

export async function getCachedFlag(kv: KVNamespace, name: string): Promise<string | null> {
  return kv.get(`flag:${name}`);
}

export async function setCachedFlag(kv: KVNamespace, name: string, state: string): Promise<void> {
  await kv.put(`flag:${name}`, state, { expirationTtl: FLAG_CACHE_TTL });
}

export async function deleteCachedFlag(kv: KVNamespace, name: string): Promise<void> {
  await kv.delete(`flag:${name}`);
}

export async function getAllCachedFlags(kv: KVNamespace): Promise<Record<string, string>> {
  const { keys } = await kv.list({ prefix: "flag:" });
  const result: Record<string, string> = {};
  await Promise.all(
    keys.map(async (k) => {
      const val = await kv.get(k.name);
      if (val) result[k.name.replace("flag:", "")] = val;
    })
  );
  return result;
}

// ── Kill Switches ────────────────────────────────────────────────────────────

export async function isKillSwitchActive(kv: KVNamespace, target: string): Promise<boolean> {
  try {
    const val = await kv.get(`ks:${target}`);
    return val === "1";
  } catch { return false; }
}

export async function setKillSwitch(kv: KVNamespace, target: string, active: boolean): Promise<void> {
  if (active) {
    await kv.put(`ks:${target}`, "1", { expirationTtl: KILL_SWITCH_TTL });
  } else {
    await kv.delete(`ks:${target}`);
  }
}

export async function getAllKillSwitches(kv: KVNamespace): Promise<Record<string, boolean>> {
  const { keys } = await kv.list({ prefix: "ks:" });
  const result: Record<string, boolean> = {};
  await Promise.all(
    keys.map(async (k) => {
      const val = await kv.get(k.name);
      result[k.name.replace("ks:", "")] = val === "1";
    })
  );
  return result;
}

// ── Country Cache ─────────────────────────────────────────────────────────────

export async function getCachedCountry(kv: KVNamespace, code: string): Promise<string | null> {
  return kv.get(`country:${code}`);
}

export async function setCachedCountry(kv: KVNamespace, code: string, status: string): Promise<void> {
  await kv.put(`country:${code}`, status, { expirationTtl: COUNTRY_CACHE_TTL });
}
