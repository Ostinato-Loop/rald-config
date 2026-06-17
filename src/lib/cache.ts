// RALD Config — KV Cache Layer
// Near-zero latency flag reads via Cloudflare KV edge cache.
// KVNamespace is provided globally by @cloudflare/workers-types — do not redefine here.
// LILCKY STUDIO LIMITED

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

// ── Kill Switches ─────────────────────────────────────────────────────────────

export async function setKillSwitch(kv: KVNamespace, target: string, active: boolean): Promise<void> {
  await kv.put(`kill:${target}`, active ? "1" : "0", { expirationTtl: KILL_SWITCH_TTL });
}

export async function isKillSwitchActive(kv: KVNamespace, target: string): Promise<boolean> {
  const val = await kv.get(`kill:${target}`);
  return val === "1";
}

export async function getAllKillSwitches(kv: KVNamespace): Promise<Record<string, boolean>> {
  const { keys } = await kv.list({ prefix: "kill:" });
  const result: Record<string, boolean> = {};
  await Promise.all(
    keys.map(async (k) => {
      const val = await kv.get(k.name);
      result[k.name.replace("kill:", "")] = val === "1";
    })
  );
  return result;
}

// ── Country Config ─────────────────────────────────────────────────────────────

export async function getCachedCountry(kv: KVNamespace, code: string): Promise<string | null> {
  return kv.get(`country:${code}`);
}

export async function setCachedCountry(kv: KVNamespace, code: string, data: string): Promise<void> {
  await kv.put(`country:${code}`, data, { expirationTtl: COUNTRY_CACHE_TTL });
}
