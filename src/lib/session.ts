import { createHmac, timingSafeEqual } from "crypto";

const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24 * 14;

function secret() {
  return process.env.SESSION_SECRET || "telegrum-dev-secret-change-me";
}

export type SessionPayload = {
  pubkey: string;
  exp: number;
};

export function createSessionToken(pubkey: string, ttlMs = DEFAULT_TTL_MS) {
  const payload: SessionPayload = {
    pubkey,
    exp: Date.now() + ttlMs,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifySessionToken(token: string | null | undefined): SessionPayload | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;

  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as SessionPayload;
    if (!payload.pubkey || !payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function getBearerToken(request: Request) {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}
