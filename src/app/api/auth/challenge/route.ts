import { NextResponse } from "next/server";
import { randomBytes } from "crypto";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const pubkey = String(body.pubkey || "");
  if (!pubkey) {
    return NextResponse.json({ error: "pubkey required" }, { status: 400 });
  }

  const nonce = randomBytes(16).toString("hex");
  const message = `Sign in to Telegrum\nAddress: ${pubkey}\nNonce: ${nonce}\nIssued: ${new Date().toISOString()}`;

  return NextResponse.json({ message, nonce });
}
