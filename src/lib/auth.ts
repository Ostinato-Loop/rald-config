// RALD Config — Auth Utilities
// LILCKY STUDIO LIMITED

export interface JwtPayload {
  id: string;
  email: string;
  role: string;
  iat: number;
  exp: number;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function verifyJwt(token: string, secret: string): Promise<JwtPayload | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts as [string, string, string];
    const key = await hmacKey(secret);
    const sigBytes = Uint8Array.from(
      atob(sig.replace(/-/g, "+").replace(/_/g, "/")),
      (c) => c.charCodeAt(0)
    );
    const valid = await crypto.subtle.verify(
      "HMAC", key, sigBytes,
      new TextEncoder().encode(`${header}.${body}`)
    );
    if (!valid) return null;
    const payload = JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/"))) as JwtPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

export function isAdmin(payload: JwtPayload): boolean {
  return payload.role === "admin" || payload.role === "super_admin";
}

export function getClientIp(req: Request): string {
  return (
    req.headers.get("CF-Connecting-IP") ??
    req.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ??
    "unknown"
  );
}
